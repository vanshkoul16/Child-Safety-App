/* =========================================================
   SafeHaven — Real Location Tracker
   Child-side: requests permission, watches GPS, sends
   authenticated pings to /api/location every 15 s.
   Parent-side: polls latest location for each child.
   ========================================================= */

import { getSupabase } from './auth.js';

// How often (ms) to POST a new fix to the backend
const UPLOAD_INTERVAL_MS  = 15_000;
// How often (ms) the parent dashboard polls for child location
const POLL_INTERVAL_MS    = 10_000;
// Threshold (ms) after which location is considered stale
const STALE_THRESHOLD_MS  = 5 * 60 * 1000; // 5 minutes

export class LocationTracker {
  constructor() {
    this._watchId     = null;
    this._uploadTimer = null;
    this._pollTimer   = null;
    this._latestFix   = null;
    this._isDemo      = false;
    this._demoTimer   = null;

    // Demo route around Jammu (synthetic coordinates)
    this._demoRoute = [
      { lat: 32.7065, lng: 74.8785 },
      { lat: 32.7080, lng: 74.8800 },
      { lat: 32.7100, lng: 74.8820 },
      { lat: 32.7120, lng: 74.8840 },
      { lat: 32.7140, lng: 74.8860 },
      { lat: 32.7120, lng: 74.8880 },
      { lat: 32.7100, lng: 74.8870 },
      { lat: 32.7080, lng: 74.8850 },
      { lat: 32.7065, lng: 74.8830 },
      { lat: 32.7050, lng: 74.8810 },
    ];
    this._demoIndex = 0;

    // Callbacks
    this._onFix   = null; // (fix) => {}
    this._onError = null; // (err) => {}
    this._onStatus = null; // ('live'|'demo'|'denied'|'stale') => {}
  }

  // -------------------------------------------------------
  // Child-side: start tracking
  // -------------------------------------------------------

  /**
   * Start real geolocation tracking on the child's device.
   * Prompts for permission; falls back to demo mode if denied.
   * @param {{ onFix, onError, onStatus }} callbacks
   */
  async startChildTracking(callbacks = {}) {
    this._onFix    = callbacks.onFix    || null;
    this._onError  = callbacks.onError  || null;
    this._onStatus = callbacks.onStatus || null;

    if (!('geolocation' in navigator)) {
      this._emit('status', 'denied');
      this._emit('error', { message: 'Geolocation is not supported by this browser.' });
      return;
    }

    // Check current permission state
    let permState = 'prompt';
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      permState = perm.state;
    } catch { /* Firefox private mode etc */ }

    if (permState === 'denied') {
      this._emit('status', 'denied');
      this._emit('error', { message: 'Location permission was denied. Enable it from browser settings.' });
      return;
    }

    // Request and watch position
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._handleFix(pos),
      (err) => this._handleGeoError(err),
      {
        enableHighAccuracy: true,
        maximumAge:         5000,
        timeout:            20000
      }
    );

    // Upload loop
    this._uploadTimer = setInterval(() => this._uploadFix(), UPLOAD_INTERVAL_MS);
  }

  /**
   * Enter demo mode: synthetic GPS route for presentations.
   * Shows a "DEMO" badge in the UI.
   */
  startDemoMode(callbacks = {}) {
    this._isDemo   = true;
    this._onFix    = callbacks.onFix    || null;
    this._onError  = callbacks.onError  || null;
    this._onStatus = callbacks.onStatus || null;
    this._emit('status', 'demo');

    // Advance along demo route every 5 s
    this._demoTimer = setInterval(() => {
      const pt = this._demoRoute[this._demoIndex % this._demoRoute.length];
      this._demoIndex++;
      const fix = {
        lat:        pt.lat + (Math.random() - 0.5) * 0.0005,
        lng:        pt.lng + (Math.random() - 0.5) * 0.0005,
        accuracy:   Math.round(5 + Math.random() * 10),
        speed:      parseFloat((1 + Math.random() * 2).toFixed(1)),
        heading:    Math.round(Math.random() * 360),
        altitude:   320,
        isDemo:     true,
        recordedAt: new Date().toISOString()
      };
      this._latestFix = fix;
      this._emit('fix', fix);
    }, 5000);
  }

  stopTracking() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    clearInterval(this._uploadTimer);
    clearInterval(this._demoTimer);
    clearInterval(this._pollTimer);
    this._uploadTimer = null;
    this._demoTimer   = null;
    this._pollTimer   = null;
  }

  // -------------------------------------------------------
  // Parent-side: poll for a child's latest location
  // -------------------------------------------------------

  /**
   * Start polling Supabase for a child's latest location.
   * @param {string} childId  — UUID
   * @param {{ onFix, onStatus }} callbacks
   */
  startParentPolling(childId, callbacks = {}) {
    this.stopParentPolling();
    this._onFix    = callbacks.onFix    || null;
    this._onStatus = callbacks.onStatus || null;

    const poll = async () => {
      const fix = await this.fetchLatestLocation(childId);
      if (fix) {
        const age = Date.now() - new Date(fix.recorded_at).getTime();
        this._emit('status', age > STALE_THRESHOLD_MS ? 'stale' : 'live');
        this._emit('fix', fix);
      } else {
        this._emit('status', 'stale');
      }
    };

    poll(); // immediate
    this._pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  stopParentPolling() {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  /**
   * Fetch the single most recent location update for a child.
   * Parent must be linked (RLS enforced on the server).
   */
  async fetchLatestLocation(childId) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('location_updates')
        .select('lat, lng, accuracy, speed, heading, altitude, is_demo, recorded_at')
        .eq('child_id', childId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      if (error) return null;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Fetch the last N location points for a child (route playback).
   */
  async fetchLocationHistory(childId, limit = 50) {
    try {
      const sb = await getSupabase();
      const { data } = await sb
        .from('location_updates')
        .select('lat, lng, accuracy, recorded_at')
        .eq('child_id', childId)
        .order('recorded_at', { ascending: false })
        .limit(limit);
      return (data || []).reverse();
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------

  _handleFix(pos) {
    const fix = {
      lat:        pos.coords.latitude,
      lng:        pos.coords.longitude,
      accuracy:   pos.coords.accuracy,
      speed:      pos.coords.speed,
      heading:    pos.coords.heading,
      altitude:   pos.coords.altitude,
      isDemo:     false,
      recordedAt: new Date().toISOString()
    };
    this._latestFix = fix;
    this._emit('status', 'live');
    this._emit('fix', fix);

    // Upload immediately on first fix
    if (!this._uploadTimer) {
      this._uploadFix();
      this._uploadTimer = setInterval(() => this._uploadFix(), UPLOAD_INTERVAL_MS);
    }
  }

  _handleGeoError(err) {
    const messages = {
      1: 'Location permission denied. You can enable it from browser settings.',
      2: 'Location unavailable. Check GPS/network signal.',
      3: 'Location request timed out. Retrying…'
    };
    this._emit('status', err.code === 1 ? 'denied' : 'stale');
    this._emit('error', { message: messages[err.code] || err.message });
  }

  async _uploadFix() {
    if (!this._latestFix) return;
    const fix = this._latestFix;
    try {
      const sb = await getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      await sb.from('location_updates').insert({
        child_id:   user.id,
        lat:        fix.lat,
        lng:        fix.lng,
        accuracy:   fix.accuracy,
        speed:      fix.speed,
        heading:    fix.heading,
        altitude:   fix.altitude,
        is_demo:    fix.isDemo || false,
        recorded_at: fix.recordedAt
      });
    } catch (err) {
      console.warn('[LocationTracker] Upload failed:', err.message);
    }
  }

  _emit(event, data) {
    if (event === 'fix'    && this._onFix)    this._onFix(data);
    if (event === 'error'  && this._onError)  this._onError(data);
    if (event === 'status' && this._onStatus) this._onStatus(data);
  }

  // -------------------------------------------------------
  // Staleness helper (used by parent dashboard)
  // -------------------------------------------------------
  static isStale(recordedAt) {
    if (!recordedAt) return true;
    return (Date.now() - new Date(recordedAt).getTime()) > STALE_THRESHOLD_MS;
  }

  static formatAge(recordedAt) {
    if (!recordedAt) return 'never';
    const diffMs = Date.now() - new Date(recordedAt).getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1)  return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    return `${Math.round(diffMin / 60)} hr ago`;
  }
}

export const locationTracker = new LocationTracker();
