/* =========================================================
   SafeHaven Live - Child device dashboard
   Location sharing with a visible indicator, guardian linking,
   and a manual SOS with confirmation and cancel.
   ========================================================= */

import { sb, call, serverPost, esc, ago, clock, friendlyError, avatarHtml } from './api.js';
import { Tracker } from './tracker.js';
import { icon } from '../icons.js';
import { openModal, closeModal, showToast } from '../app.js';
import { soundFx } from '../audioNotifier.js';

export class ChildApp {
  constructor(root, profile, hooks) {
    this.root = root;
    this.me = profile;
    this.hooks = hooks; // { setIndicator(state) }
    this.s = {
      loading: true,
      error: '',
      guardians: [],
      zones: [],
      zoneStates: [],
      openSos: null,
      sosNotifs: [],
      sosSending: false,
      sosNotify: null, // server summary for the open SOS
      linking: false,
      offline: !navigator.onLine
    };
    this.tracker = new Tracker(() => this.onTracker());
    this.channel = null;
    this.timers = [];
    this.lastSentSeen = null;
  }

  async mount() {
    this.root.innerHTML = '';
    this.root.className = 'child-view live-child';
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('submit', (e) => this.onSubmit(e));
    window.addEventListener('online', this._online = () => { this.s.offline = false; this.render(); this.load(); });
    window.addEventListener('offline', this._offline = () => { this.s.offline = true; this.render(); });
    this.render();
    await this.load();
    this.subscribe();
    this.tracker.resumeIfAllowed();
    this.timers.push(setInterval(() => this.render(), 10000));
    this.timers.push(setInterval(() => this.load(), 60000));
  }

  destroy() {
    this.tracker.stop();
    this.timers.forEach(clearInterval);
    if (this.channel) sb().removeChannel(this.channel);
    window.removeEventListener('online', this._online);
    window.removeEventListener('offline', this._offline);
    this.hooks.setIndicator(null);
  }

  async load() {
    try {
      const client = sb();
      const [links, zones, states, sos] = await Promise.all([
        client.from('family_links').select('parent_id, created_at'),
        client.from('safe_zones').select('id, name, lat, lng, radius_m').order('name'),
        client.from('zone_states').select('zone_id, inside, updated_at'),
        client.from('sos_alerts').select('*').in('status', ['active', 'acknowledged']).order('created_at', { ascending: false }).limit(1)
      ]);
      for (const r of [links, zones, states, sos]) if (r.error) throw r.error;

      const parentIds = links.data.map((l) => l.parent_id);
      const guardians = parentIds.length
        ? await client.from('profiles').select('id, display_name').in('id', parentIds)
        : { data: [] };
      if (guardians.error) throw guardians.error;

      const openSos = sos.data[0] || null;
      let notifs = { data: [] };
      if (openSos) {
        notifs = await client.from('sos_notifications').select('status, parent_id, delivered_at').eq('sos_id', openSos.id);
        if (notifs.error) throw notifs.error;
      }
      if (!openSos) this.s.sosNotify = null;

      Object.assign(this.s, {
        loading: false,
        error: '',
        guardians: guardians.data,
        zones: zones.data,
        zoneStates: states.data,
        openSos,
        sosNotifs: notifs.data
      });
      if (this.s.guardians.length && this.tracker.state === 'not_linked') this.tracker.start();
    } catch (e) {
      this.s.loading = false;
      this.s.error = friendlyError(e);
    }
    this.render();
  }

  subscribe() {
    let t = null;
    const reload = () => {
      clearTimeout(t);
      t = setTimeout(() => this.load(), 300);
    };
    this.channel = sb().channel(`child-${this.me.id}`);
    for (const table of ['sos_alerts', 'sos_notifications', 'family_links', 'safe_zones']) {
      this.channel.on('postgres_changes', { event: '*', schema: 'public', table }, reload);
    }
    this.channel.subscribe();
  }

  onTracker() {
    this.hooks.setIndicator(this.tracker.state === 'active' ? 'active' : null);
    const sent = this.tracker.lastSent && this.tracker.lastSent.sentAt;
    if (sent && sent !== this.lastSentSeen) {
      this.lastSentSeen = sent;
      for (const ev of this.tracker.lastEvents) {
        showToast(ev.transition === 'enter' ? 'Arrived' : 'Left a safe place', `${ev.zone_name} — your guardians were told automatically.`, 'info');
      }
      if (this.tracker.lastEvents.length) this.load();
    }
    this.render();
  }

  /* ---------------- rendering ---------------- */

  render(force = false) {
    // Don't wipe the invite code while the child is typing it
    const a = document.activeElement;
    if (!force && a && a.name === 'code' && this.root.contains(a)) return;
    this.root.innerHTML = this.html();
  }

  html() {
    const s = this.s;
    const name = this.me.display_name;
    const linked = s.guardians.length > 0;
    const guardianNames = s.guardians.map((g) => esc(g.display_name)).join(', ');
    const insideZone = s.zoneStates.find((z) => z.inside);
    const zone = insideZone ? s.zones.find((z) => z.id === insideZone.zone_id) : null;

    if (s.loading) {
      return `<div class="kid"><div class="live-loading">${icon('locate', 22)}<span>Loading your account…</span></div></div>`;
    }

    return `
      <div class="kid">
        ${s.offline ? `<div class="live-note tone-attention" role="status">${icon('signal', 16)}<span>You're offline. Location and SOS will send when the connection returns — if it's urgent, call 112.</span></div>` : ''}
        ${s.error ? `<div class="live-note tone-danger" role="alert">${icon('alert', 16)}<span>${esc(s.error)}</span><button class="btn btn--soft btn--sm" data-action="reload">Retry</button></div>` : ''}

        <header class="kid-head">
          ${avatarHtml(name, 'lg', this.tracker.state === 'active' ? 'safe' : 'offline')}
          <div class="kid-head__text">
            <p class="eyebrow">My safety</p>
            <h1 class="kid-head__title">Hi, ${esc(name)}</h1>
            <span class="zone-badge tone-${s.openSos ? 'danger' : zone ? 'safe' : 'offline'}">${icon(s.openSos ? 'siren' : zone ? 'shieldCheck' : 'pin', 13)}${
              s.openSos ? 'SOS sent' : zone ? `In safe place — ${esc(zone.name)}` : !linked ? 'Not linked yet' : s.zones.length ? 'Not in a safe place' : 'No safe places set yet'}</span>
          </div>
        </header>

        ${linked ? `
          <div class="kid-privacy">
            ${icon('eyeOff', 15)}
            <span>${guardianNames} can see your location only while sharing is on. You can pause it any time, and you'll always see when it's on.</span>
          </div>
        ` : this.linkCard()}

        ${this.trackingCard(linked)}
        ${this.sosSection(linked)}

        <div class="kid-actions">
          <button class="kid-action tone-neutral" data-action="zones">
            <span class="kid-action__icon">${icon('shield', 22)}</span>
            <span class="kid-action__label">Safe places</span>
            <span class="kid-action__hint">${s.zones.length ? `${s.zones.length} set by your guardians` : 'None set yet'}</span>
          </button>
          <a class="kid-action tone-accent" href="tel:112">
            <span class="kid-action__icon">${icon('phone', 22)}</span>
            <span class="kid-action__label">Call 112</span>
            <span class="kid-action__hint">You place this call yourself</span>
          </a>
        </div>

        ${linked ? `
          <section class="card card--flush">
            <div class="card-head card-head--pad"><div><h3 class="card-title">Your guardians</h3><p class="card-sub">They receive your SOS alerts.</p></div></div>
            <ul class="rows">
              ${s.guardians.map((g) => `
                <li class="row">${avatarHtml(g.display_name, 'sm')}<div class="row__body"><div class="row__title">${esc(g.display_name)}</div></div></li>
              `).join('')}
            </ul>
            <button class="row row--add" data-action="show-link">${icon('userPlus', 16)}<span class="row__title">Link another guardian</span></button>
          </section>
          ${this.s.showLink ? this.linkCard() : ''}
        ` : ''}
      </div>
    `;
  }

  linkCard() {
    return `
      <section class="card live-link">
        <h3 class="card-title">${icon('link', 16)} Link to your guardian</h3>
        <p class="card-sub">Ask your parent or guardian to open SafeHaven → Family → <strong>Create invite code</strong>, then type the 8-character code here. Codes expire after 15 minutes and work once.</p>
        <form class="live-link__form" data-form="link">
          <input class="input mono live-code-input" name="code" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" maxlength="9" placeholder="XXXX-XXXX" aria-label="Invite code" required value="${esc(this.s.codeDraft || '')}" />
          <button class="btn btn--primary" type="submit" ${this.s.linking ? 'disabled' : ''}>${this.s.linking ? 'Linking…' : 'Link'}</button>
        </form>
      </section>
    `;
  }

  trackingCard(linked) {
    const t = this.tracker;
    const sent = t.lastSent;
    const states = {
      off: { tone: 'offline', ic: 'locate', title: 'Location sharing is off', desc: linked ? 'Turn it on so your guardians can see where you are.' : 'Link a guardian first, then turn sharing on.' },
      requesting: { tone: 'info', ic: 'locate', title: 'Asking for permission…', desc: 'Your browser will ask to use your location. Choose Allow.' },
      active: { tone: 'safe', ic: 'locate', title: 'Sharing your location', desc: sent ? `Last sent ${ago(sent.sentAt)} · accurate to ±${sent.accuracy} m` : 'Getting your first position…' },
      paused: { tone: 'offline', ic: 'locate', title: 'Sharing is paused', desc: 'Your guardians can see that you paused it. They see your last sent location.' },
      denied: { tone: 'danger', ic: 'alert', title: 'Location is blocked', desc: 'Your browser is blocking location for SafeHaven. Open the site settings (the icon left of the address) and set Location to Allow, then try again. Your guardians can see that it is blocked.' },
      unavailable: { tone: 'attention', ic: 'signal', title: 'Can\'t find your location', desc: t.lastError || 'No GPS or network fix yet. Try moving near a window or outside.' },
      not_linked: { tone: 'attention', ic: 'link', title: 'Not linked to a guardian', desc: 'Your location isn\'t sent until a guardian is linked.' }
    };
    const st = states[t.state] || states.off;
    const busy = t.state === 'requesting';

    return `
      <section class="kid-status tone-${st.tone} live-track ${t.state === 'active' ? 'is-live' : ''}" aria-live="polite">
        <span class="kid-status__icon">${icon(st.ic, 26)}</span>
        <h2 class="kid-status__title">${st.title}</h2>
        <p class="kid-status__desc">${esc(st.desc)}</p>
        ${t.lastError && t.state === 'active' ? `<p class="kid-status__meta tone-attention">${esc(t.lastError)}</p>` : ''}
        <div class="live-track__actions">
          ${t.state === 'active' || t.state === 'requesting' || t.state === 'unavailable'
            ? `<button class="btn btn--soft" data-action="pause" ${busy ? 'disabled' : ''}>Pause sharing</button>`
            : `<button class="btn btn--primary" data-action="start" ${linked ? '' : 'disabled'}>${icon('locate', 16)} ${t.state === 'denied' ? 'Try again' : 'Start sharing location'}</button>`}
        </div>
        <p class="kid-status__meta live-track__note">${icon('info', 12)} Keep SafeHaven open on screen. Phones pause web pages when locked or in the background, so sharing can stop — continuous background tracking needs a native app.</p>
      </section>
    `;
  }

  sosSection(linked) {
    const sos = this.s.openSos;
    if (sos) {
      const notifs = this.s.sosNotifs;
      const devices = notifs.filter((n) => n.status !== 'no_subscription');
      const delivered = devices.filter((n) => n.status === 'delivered').length;
      const ackBy = sos.acknowledged_by ? this.s.guardians.find((g) => g.id === sos.acknowledged_by) : null;
      let delivery;
      if (sos.status === 'acknowledged') delivery = `${esc(ackBy ? ackBy.display_name : 'A guardian')} has seen your SOS (${clock(sos.acknowledged_at)}).`;
      else if (delivered) delivery = `Delivered to ${delivered} guardian device${delivered > 1 ? 's' : ''}. Waiting for someone to respond…`;
      else if (devices.length) delivery = 'Sent. Waiting for a guardian\'s phone to confirm it arrived…';
      else if (this.s.sosNotify && this.s.sosNotify.pushConfigured === false) delivery = 'Saved. Your guardians see it when SafeHaven is open — push alerts aren\'t set up on this server.';
      else if (notifs.length) delivery = 'Saved, but none of your guardians has phone notifications turned on. They see it when they open SafeHaven.';
      else delivery = 'Saved. Notifying your guardians…';

      return `
        <section class="sos-zone">
          <div class="live-sos-status tone-danger" role="status" aria-live="assertive">
            <span class="live-sos-status__pulse">${icon('siren', 22)}</span>
            <div>
              <strong>SOS sent at ${clock(sos.created_at)}</strong>
              <p>${delivery}</p>
              <p class="fine">${sos.lat != null ? `Shared your location from ${ago(sos.location_recorded_at)} (±${Math.round(sos.accuracy_m)} m).` : 'No location was available to share.'}</p>
            </div>
          </div>
          <div class="sos-active">
            <a class="btn btn--danger btn--lg btn--block" href="tel:112">${icon('phone', 18)} Call 112 now</a>
            <button class="btn btn--soft btn--block" data-action="cancel-sos">It was a mistake — cancel SOS</button>
          </div>
        </section>
      `;
    }
    return `
      <section class="sos-zone">
        <button class="sos live-sos-btn" data-action="sos" ${linked && !this.s.sosSending ? '' : 'disabled'} aria-label="SOS. Alerts your guardians after you confirm.">
          <span class="sos__label">SOS</span>
          <span class="sos__sub">${this.s.sosSending ? 'Sending…' : 'Tap, then confirm'}</span>
        </button>
        <p class="sos-hint">${linked
          ? 'Sends an emergency alert with your location to your guardians. It does <strong>not</strong> call the police or ambulance — use Call 112 for that.'
          : 'Link a guardian to use SOS. In an emergency, call 112.'}</p>
      </section>
    `;
  }

  /* ---------------- actions ---------------- */

  onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    if (a === 'start') this.tracker.start();
    else if (a === 'pause') this.tracker.pause();
    else if (a === 'sos') this.confirmSos();
    else if (a === 'cancel-sos') this.confirmCancel();
    else if (a === 'zones') this.showZones();
    else if (a === 'reload') this.load();
    else if (a === 'show-link') { this.s.showLink = !this.s.showLink; this.render(); }
  }

  async onSubmit(e) {
    const form = e.target.closest('[data-form="link"]');
    if (!form) return;
    e.preventDefault();
    const code = String(new FormData(form).get('code') || '').trim();
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) {
      showToast('Check the code', 'Invite codes have 8 letters and numbers.', 'warning');
      return;
    }
    this.s.linking = true;
    this.s.codeDraft = code;
    this.render(true);
    try {
      const res = await call('redeem_link_invite', { p_code: code });
      showToast('Linked', `${res.parent_name} is now your guardian.`, 'safe');
      this.s.showLink = false;
      this.s.codeDraft = '';
      await this.load();
    } catch (err) {
      showToast('Couldn\'t link', err.message, 'warning');
    } finally {
      this.s.linking = false;
      this.render(true);
    }
  }

  confirmSos() {
    const names = this.s.guardians.map((g) => esc(g.display_name)).join(', ');
    openModal(
      'Send SOS to your guardians?',
      `
        <p class="modal__lede">This alerts <strong>${names}</strong> right away with your latest location.</p>
        <ul class="sos-effects">
          <li>${icon('bell', 16)} Your guardians get an emergency alert</li>
          <li>${icon('locate', 16)} Your latest location is attached${this.tracker.state === 'active' ? '' : ' (sharing is off, so it may be old or missing)'}</li>
          <li>${icon('info', 16)} It does not call 112 — do that yourself if you're in danger</li>
        </ul>
      `,
      `
        <button class="btn btn--ghost" data-modal="cancel">Cancel</button>
        <button class="btn btn--danger" data-modal="send">${icon('siren', 15)} Send SOS</button>
      `,
      { size: 'sm' }
    );
    const overlay = document.getElementById('global-modal-overlay');
    overlay.querySelector('[data-modal="cancel"]').addEventListener('click', closeModal);
    overlay.querySelector('[data-modal="send"]').addEventListener('click', () => {
      closeModal();
      this.sendSos();
    });
    overlay.querySelector('[data-modal="cancel"]').focus();
  }

  async sendSos() {
    this.s.sosSending = true;
    this.render();
    try {
      await this.tracker.freshFixForSos();
      const res = await call('raise_sos', { p_message: null });
      this.s.openSos = res.sos;
      soundFx.playSafeChime();
      showToast('SOS sent', 'Your guardians are being alerted.', 'critical');
      try {
        this.s.sosNotify = await serverPost('/api/live/sos-notify', { sosId: res.sos.id });
      } catch (err) {
        // The SOS is stored and visible in the guardian dashboard even if push fails
        showToast('Push alert failed', `${err.message} Your SOS is saved and shows on their dashboard.`, 'warning');
      }
      await this.load();
    } catch (err) {
      openModal(
        'SOS could not be sent',
        `<p class="modal__lede">${esc(err.message)}</p><p class="modal__lede">If you are in danger, call 112 now.</p>`,
        `<a class="btn btn--danger" href="tel:112">${icon('phone', 15)} Call 112</a><button class="btn btn--soft" data-modal="retry">Try again</button>`,
        { size: 'sm' }
      );
      document.querySelector('#global-modal-overlay [data-modal="retry"]').addEventListener('click', () => {
        closeModal();
        this.sendSos();
      });
    } finally {
      this.s.sosSending = false;
      this.render();
    }
  }

  confirmCancel() {
    openModal(
      'Cancel your SOS?',
      '<p class="modal__lede">Your guardians will see that you cancelled it as a mistake.</p>',
      `<button class="btn btn--ghost" data-modal="keep">Keep SOS active</button><button class="btn btn--primary" data-modal="confirm">Yes, cancel it</button>`,
      { size: 'sm' }
    );
    const overlay = document.getElementById('global-modal-overlay');
    overlay.querySelector('[data-modal="keep"]').addEventListener('click', closeModal);
    overlay.querySelector('[data-modal="confirm"]').addEventListener('click', async () => {
      closeModal();
      try {
        await call('cancel_sos', { p_sos: this.s.openSos.id });
        showToast('SOS cancelled', 'Your guardians were told it was a mistake.', 'info');
        await this.load();
      } catch (err) {
        showToast('Couldn\'t cancel', err.message, 'warning');
      }
    });
  }

  showZones() {
    const zones = this.s.zones;
    openModal(
      'Your safe places',
      zones.length ? `
        <p class="modal__lede">Your guardians are told automatically when you arrive at or leave these places (while location sharing is on).</p>
        <div class="choices">
          ${zones.map((z) => {
            const st = this.s.zoneStates.find((x) => x.zone_id === z.id);
            return `
              <div class="choice choice--static">
                <span class="choice__icon choice__icon--safe">${icon('shield', 18)}</span>
                <span class="choice__body">
                  <span class="choice__title">${esc(z.name)}</span>
                  <span class="choice__sub">${z.radius_m} m radius${st ? ` · ${st.inside ? 'you are here' : 'not here'}` : ''}</span>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      ` : `<div class="empty empty--compact"><span class="empty__icon">${icon('shield', 22)}</span><p>Your guardians haven't added any safe places yet.</p></div>`,
      `<button class="btn btn--soft btn--block" onclick="window.closeModal()">Close</button>`,
      { size: 'sm' }
    );
  }
}
