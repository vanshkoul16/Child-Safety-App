/* =========================================================
   SafeHaven Live - Child device location tracker
   Real browser geolocation only. Never invents a position, and
   reports "denied" / "unavailable" honestly to guardians.
   A browser tab cannot track reliably in the background: the OS
   pauses it when the screen locks or the tab is closed.
   ========================================================= */

import { call } from './api.js';

const PREF_KEY = 'safehaven_tracking_on';
const HEARTBEAT_MS = 60 * 1000;     // ask for a fresh fix at least this often
const MIN_INTERVAL_MS = 10 * 1000;  // never send faster than this (server allows 5 s)
const MOVE_THRESHOLD_M = 25;        // send early when the child moved this far
const MAX_FIX_AGE_MS = 9 * 60 * 1000; // server rejects fixes older than 10 min

function metres(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function batteryPct() {
  try {
    if (!navigator.getBattery) return null;
    const b = await navigator.getBattery();
    return Math.round(b.level * 100);
  } catch (e) {
    return null;
  }
}

export class Tracker {
  constructor(onChange) {
    this.onChange = onChange;
    // off | requesting | active | paused | denied | unavailable | not_linked
    this.state = 'off';
    this.watchId = null;
    this.heartbeat = null;
    this.lastFix = null;      // { lat, lng, accuracy, recordedAt }
    this.lastSent = null;     // { lat, lng, accuracy, recordedAt, sentAt }
    this.pending = null;      // newest fix not yet accepted by the server
    this.sending = false;
    this.retryTimer = null;
    this.lastError = '';
    this.lastEvents = [];

    window.addEventListener('online', () => this._flush());
  }

  get wantsTracking() {
    try { return localStorage.getItem(PREF_KEY) === '1'; } catch (e) { return false; }
  }

  _setPref(on) {
    try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
  }

  _set(state, error = '') {
    this.state = state;
    this.lastError = error;
    this.onChange(this);
  }

  async permissionState() {
    try {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      return p.state; // granted | prompt | denied
    } catch (e) {
      return 'unknown';
    }
  }

  // Resume automatically only if the child turned sharing on before AND permission is already granted
  async resumeIfAllowed() {
    if (this.wantsTracking && (await this.permissionState()) === 'granted') this.start();
  }

  start() {
    if (!('geolocation' in navigator)) {
      this._set('unavailable', 'This browser has no location support.');
      call('set_tracking_state', { p_state: 'unavailable' }).catch(() => {});
      return;
    }
    this._setPref(true);
    this._clearWatch();
    this._set('requesting');
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._onPosition(pos),
      (err) => this._onError(err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
    this.heartbeat = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => this._onPosition(pos),
        (err) => this._onError(err),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
      );
    }, HEARTBEAT_MS);
  }

  pause() {
    this._setPref(false);
    this._clearWatch();
    this.pending = null;
    this._set('paused');
    call('set_tracking_state', { p_state: 'paused' }).catch(() => {});
  }

  stop() {
    this._clearWatch();
    this.state = 'off';
  }

  _clearWatch() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    clearInterval(this.heartbeat);
    this.heartbeat = null;
    clearTimeout(this.retryTimer);
  }

  _onPosition(pos) {
    if (this.state === 'paused' || this.state === 'off') return;
    const fix = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.max(1, Math.round(pos.coords.accuracy)),
      recordedAt: pos.timestamp || Date.now()
    };
    this.lastFix = fix;
    if (this.state !== 'active' && this.state !== 'not_linked') this._set('active');
    else this.onChange(this);

    const elapsed = this.lastSent ? Date.now() - this.lastSent.sentAt : Infinity;
    const moved = this.lastSent ? metres(this.lastSent, fix) : Infinity;
    if (elapsed >= HEARTBEAT_MS || (elapsed >= MIN_INTERVAL_MS && moved >= MOVE_THRESHOLD_M) || !this.lastSent) {
      this.pending = fix;
      this._flush();
    }
  }

  _onError(err) {
    if (err.code === 1) {
      this._clearWatch();
      this._set('denied', 'Location permission is blocked for this site.');
      call('set_tracking_state', { p_state: 'denied' }).catch(() => {});
    } else if (this.state !== 'active') {
      // Position unavailable or timed out before any fix: keep watching, but say so
      this._set('unavailable', err.code === 3 ? 'Still waiting for a GPS fix…' : 'Location is unavailable right now (no GPS or network fix).');
      call('set_tracking_state', { p_state: 'unavailable' }).catch(() => {});
    }
  }

  async _flush() {
    const fix = this.pending;
    if (!fix || this.sending) return;
    if (Date.now() - fix.recordedAt > MAX_FIX_AGE_MS) {
      this.pending = null;
      return;
    }
    if (!navigator.onLine) {
      this.lastError = 'Offline — the latest location will be sent when you reconnect.';
      this.onChange(this);
      return;
    }
    this.sending = true;
    try {
      const res = await call('submit_location', {
        p_lat: fix.lat,
        p_lng: fix.lng,
        p_accuracy: fix.accuracy,
        p_recorded_at: new Date(fix.recordedAt).toISOString(),
        p_battery: await batteryPct()
      });
      this.lastSent = { ...fix, sentAt: Date.now() };
      this.lastEvents = res.events || [];
      if (this.pending === fix) this.pending = null;
      if (this.state === 'not_linked') this.state = 'active';
      this.lastError = '';
    } catch (e) {
      if (e.code === 'not_linked') {
        this.pending = null;
        this._set('not_linked', e.message);
      } else if (e.code === 'rate_limited') {
        this.retryTimer = setTimeout(() => this._flush(), MIN_INTERVAL_MS);
      } else {
        this.lastError = e.message;
        this.retryTimer = setTimeout(() => this._flush(), 15000);
      }
    } finally {
      this.sending = false;
      this.onChange(this);
    }
  }

  // One quick fix for an SOS, if permission is already granted. Resolves null otherwise.
  async freshFixForSos(timeoutMs = 5000) {
    if (!('geolocation' in navigator) || (await this.permissionState()) !== 'granted') return null;
    const pos = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, maximumAge: 10000, timeout: timeoutMs });
    });
    if (!pos) return null;
    const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.max(1, Math.round(pos.coords.accuracy)), recordedAt: pos.timestamp || Date.now() };
    try {
      await call('submit_location', {
        p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy,
        p_recorded_at: new Date(fix.recordedAt).toISOString(), p_battery: await batteryPct()
      });
      this.lastFix = fix;
      this.lastSent = { ...fix, sentAt: Date.now() };
      this.onChange(this);
      return fix;
    } catch (e) {
      return null; // rate limited or offline: the SOS still goes out with the newest stored fix
    }
  }
}
