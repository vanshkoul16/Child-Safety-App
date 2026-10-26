/* =========================================================
   SafeHaven Live - Guardian dashboard
   Real data only: linked children, their latest reported
   location, safe zones, zone events and SOS alerts.
   ========================================================= */

import { sb, call, esc, ago, clock, fullTime, friendlyError, avatarHtml, LIVE_MS, STALE_MS, config } from './api.js';
import { LiveMap } from './liveMap.js';
import { pushState, enablePush, disablePush } from './push.js';
import { icon } from '../icons.js';
import { openModal, closeModal, showToast } from '../app.js';
import { soundFx } from '../audioNotifier.js';

const TABS = [
  { key: 'home', label: 'Home', ic: 'home' },
  { key: 'map', label: 'Map', ic: 'map' },
  { key: 'alerts', label: 'Alerts', ic: 'bell' },
  { key: 'family', label: 'Family', ic: 'users' },
  { key: 'settings', label: 'Settings', ic: 'sliders' }
];

/* Status of one child from real data. Never claims "live" without a recent fix. */
export function childStatus(child, latest, openSos, zones, states, now = Date.now()) {
  const myZones = zones.filter((z) => z.child_id === child.id);
  const inside = states.filter((s) => s.child_id === child.id && s.inside).map((s) => myZones.find((z) => z.id === s.zone_id)).filter(Boolean);
  const age = latest ? now - new Date(latest.recorded_at).getTime() : Infinity;
  const ts = child.tracking_state;
  const tsAfterFix = child.tracking_state_at && (!latest || new Date(child.tracking_state_at) > new Date(latest.received_at));

  let freshness;
  if (ts === 'denied' && tsAfterFix) freshness = { key: 'denied', label: 'Location blocked', tone: 'danger', desc: `Location permission is blocked on ${child.display_name}'s device.` };
  else if (ts === 'paused' && tsAfterFix) freshness = { key: 'paused', label: 'Sharing paused', tone: 'offline', desc: `${child.display_name} paused location sharing ${ago(child.tracking_state_at)}.` };
  else if (!latest) freshness = { key: 'none', label: 'No location yet', tone: 'offline', desc: `${child.display_name} hasn't shared a location yet.` };
  else if (age <= LIVE_MS) freshness = { key: 'live', label: 'Live', tone: 'safe', desc: `Position from ${ago(latest.recorded_at)}.` };
  else if (age <= STALE_MS) freshness = { key: 'stale', label: 'Stale', tone: 'attention', desc: `No update for ${ago(latest.recorded_at).replace(' ago', '')}.` };
  else freshness = { key: 'offline', label: 'Offline', tone: 'offline', desc: `Last position ${ago(latest.recorded_at)} — the app may be closed or the phone offline.` };
  if (ts === 'unavailable' && tsAfterFix && freshness.key !== 'live') freshness.desc = `${child.display_name}'s device can't get a GPS fix.`;

  let place;
  if (!latest) place = { label: 'Location unknown', name: '—', ic: 'pin' };
  else if (inside.length) place = { label: 'In a safe zone', name: inside.map((z) => z.name).join(', '), ic: 'shieldCheck' };
  else if (myZones.length) place = { label: 'Outside safe zones', name: freshness.key === 'live' ? 'Not in any safe zone' : 'At last report', ic: 'pin' };
  else place = { label: 'No safe zones yet', name: 'Add one from the map', ic: 'shield' };

  let tone = freshness.tone;
  if (openSos) tone = 'danger';
  else if (freshness.key === 'live' && myZones.length && !inside.length) tone = 'attention';
  else if (freshness.key === 'live' && !myZones.length) tone = 'info';

  return { freshness, place, tone, inside, sos: openSos };
}

export class ParentApp {
  constructor(root, profile, session) {
    this.root = root;
    this.me = profile;
    this.email = session.user.email;
    this.map = new LiveMap();
    this.s = {
      tab: new URLSearchParams(location.search).get('sos') ? 'alerts' : 'home',
      loading: true,
      error: '',
      offline: !navigator.onLine,
      children: [],
      latest: {},
      zones: [],
      states: [],
      events: [],
      sos: [],
      notifs: [],
      selected: null,
      invite: null,
      push: 'unknown',
      filter: 'all',
      overlayDismissed: new Set(),
      busy: new Set()
    };
    this.firstLoad = true;
    this.knownSos = new Set();
    this.knownEvents = new Set();
    this.timers = [];
    this.channel = null;
    this.picking = null;
  }

  async mount() {
    this.root.className = 'parent-view live-parent';
    this.root.innerHTML = `
      <nav class="sidenav" aria-label="Guardian navigation">
        ${TABS.map((t) => `
          <button class="nav-item" data-tab="${t.key}">
            <span class="nav-item__iconwrap">${icon(t.ic, 17, 'nav-item__icon')}${t.key === 'alerts' ? '<span class="nav-badge" data-sos-count hidden>0</span>' : ''}</span>
            <span>${t.label}</span>
          </button>
        `).join('')}
        <div class="sidenav__foot">
          <a class="sidenav__sos" href="tel:112">${icon('phone', 16)}<span>Call 112</span></a>
        </div>
      </nav>
      <div class="content">
        <div data-region="banner"></div>
        <section class="screen" data-screen="home"></section>
        <section class="screen screen--map" data-screen="map">
          <div class="map-shell">
            <div id="leaflet-map" aria-label="Map of your children's latest locations"></div>
            <div class="map-top"><div class="map-chips glass" data-region="chips"></div></div>
            <div class="map-banner glass" data-region="pick-banner" hidden></div>
            <div class="map-sync glass" aria-live="off"><i class="map-sync__dot"></i><span data-region="sync">Loading…</span></div>
            <div class="map-rail glass" role="toolbar" aria-label="Map controls">
              <button class="rail-btn" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('plus', 18)}</button>
              <button class="rail-btn" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('minus', 18)}</button>
              <span class="rail-sep"></span>
              <button class="rail-btn" data-action="fit" aria-label="Fit everyone in view" title="Fit everyone in view">${icon('expand', 18)}</button>
              <button class="rail-btn rail-btn--accent" data-action="add-zone" aria-label="Add safe zone" title="Add safe zone">${icon('shield', 18)}</button>
            </div>
            <div class="map-sheet glass" data-region="sheet"></div>
          </div>
        </section>
        <section class="screen" data-screen="alerts"></section>
        <section class="screen" data-screen="family"></section>
        <section class="screen" data-screen="settings"></section>
      </div>
    `;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    window.addEventListener('online', this._online = () => { this.s.offline = false; this.load(); });
    window.addEventListener('offline', this._offline = () => { this.s.offline = true; this.render(); });
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', this._swMsg = (e) => { if (e.data && e.data.type === 'sos-push') this.load(); });
    }

    this.render();
    await this.load();
    this.subscribe();
    this.s.push = await pushState();
    this.render();
    this.timers.push(setInterval(() => this.render(), 10000));
    this.timers.push(setInterval(() => this.load(), 30000));
  }

  destroy() {
    this.timers.forEach(clearInterval);
    if (this.channel) sb().removeChannel(this.channel);
    window.removeEventListener('online', this._online);
    window.removeEventListener('offline', this._offline);
    if (navigator.serviceWorker && this._swMsg) navigator.serviceWorker.removeEventListener('message', this._swMsg);
    soundFx.stopEmergencySOS();
    document.getElementById('emergency-broadcast-overlay')?.remove();
    delete document.body.dataset.tab;
  }

  /* ---------------- data ---------------- */

  async load() {
    try {
      const c = sb();
      const links = await c.from('family_links').select('child_id, created_at');
      if (links.error) throw links.error;
      const ids = links.data.map((l) => l.child_id);

      if (!ids.length) {
        Object.assign(this.s, { loading: false, error: '', children: [], latest: {}, zones: [], states: [], events: [], sos: [], notifs: [] });
      } else {
        const [profiles, zones, states, events, sos, ...latest] = await Promise.all([
          c.from('profiles').select('id, display_name, tracking_state, tracking_state_at, location_retention_days').in('id', ids).order('display_name'),
          c.from('safe_zones').select('*').in('child_id', ids).order('created_at'),
          c.from('zone_states').select('*').in('child_id', ids),
          c.from('zone_events').select('*').in('child_id', ids).order('occurred_at', { ascending: false }).limit(100),
          c.from('sos_alerts').select('*').in('child_id', ids).order('created_at', { ascending: false }).limit(50),
          ...ids.map((id) => c.from('location_updates')
            .select('child_id, lat, lng, accuracy_m, battery_pct, recorded_at, received_at')
            .eq('child_id', id).order('recorded_at', { ascending: false }).limit(1))
        ]);
        for (const r of [profiles, zones, states, events, sos, ...latest]) if (r.error) throw r.error;
        const sosIds = sos.data.map((x) => x.id);
        const notifs = sosIds.length
          ? await c.from('sos_notifications').select('sos_id, status, sent_at, delivered_at, detail').in('sos_id', sosIds)
          : { data: [] };
        if (notifs.error) throw notifs.error;

        const linkedAt = Object.fromEntries(links.data.map((l) => [l.child_id, l.created_at]));
        // A newly linked child means the open invite code was just used
        if (this.s.invite && ids.some((id) => !this.s.children.some((ch) => ch.id === id)) && !this.firstLoad) {
          this.s.invite = null;
          const added = profiles.data.filter((p) => !this.s.children.some((ch) => ch.id === p.id));
          if (added.length) showToast('Child linked', `${added.map((p) => p.display_name).join(', ')} completed the link.`, 'safe');
        }
        Object.assign(this.s, {
          loading: false,
          error: '',
          children: profiles.data.map((p) => ({ ...p, linked_at: linkedAt[p.id] })),
          latest: Object.fromEntries(latest.map((r, i) => [ids[i], r.data[0] || null])),
          zones: zones.data,
          states: states.data,
          events: events.data,
          sos: sos.data,
          notifs: notifs.data
        });
      }
      if (!this.s.selected || !this.s.children.some((ch) => ch.id === this.s.selected)) {
        this.s.selected = this.s.children[0] ? this.s.children[0].id : null;
      }
      this.announceNew();
    } catch (e) {
      this.s.loading = false;
      this.s.error = friendlyError(e);
    }
    this.render();
  }

  // Toasts + siren for SOS alerts and zone events that arrived since the last load
  announceNew() {
    const name = (id) => (this.s.children.find((c) => c.id === id) || {}).display_name || 'Your child';
    for (const a of this.s.sos) {
      if (!this.knownSos.has(a.id)) {
        this.knownSos.add(a.id);
        if (!this.firstLoad && a.status === 'active') {
          soundFx.playEmergencySOS();
          showToast('SOS', `${name(a.child_id)} pressed SOS.`, 'critical');
        }
      }
    }
    for (const ev of this.s.events) {
      if (!this.knownEvents.has(ev.id)) {
        this.knownEvents.add(ev.id);
        if (!this.firstLoad) {
          showToast('Safe zone', `${name(ev.child_id)} ${ev.transition === 'enter' ? 'arrived at' : 'left'} ${ev.zone_name}.`, ev.transition === 'enter' ? 'safe' : 'warning');
        }
      }
    }
    this.firstLoad = false;
  }

  subscribe() {
    let t = null;
    const reload = () => {
      clearTimeout(t);
      t = setTimeout(() => this.load(), 300);
    };
    // postgres_changes is filtered by RLS: only rows this guardian may read are delivered
    this.channel = sb().channel(`parent-${this.me.id}`);
    for (const table of ['location_updates', 'zone_events', 'sos_alerts', 'sos_notifications', 'safe_zones', 'family_links', 'profiles']) {
      this.channel.on('postgres_changes', { event: '*', schema: 'public', table }, reload);
    }
    this.channel.subscribe((status) => {
      this.s.realtime = status;
      this.renderMapOverlays();
    });
  }

  childById(id) {
    return this.s.children.find((c) => c.id === id);
  }

  openSosFor(childId) {
    return this.s.sos.find((a) => a.child_id === childId && (a.status === 'active' || a.status === 'acknowledged')) || null;
  }

  statusOf(child) {
    return childStatus(child, this.s.latest[child.id], this.openSosFor(child.id), this.s.zones, this.s.states);
  }

  /* ---------------- rendering ---------------- */

  render() {
    const s = this.s;
    document.body.dataset.tab = s.tab;
    this.root.querySelectorAll('.nav-item').forEach((b) => {
      const on = b.dataset.tab === s.tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    this.root.querySelectorAll('[data-screen]').forEach((el) => el.classList.toggle('active', el.dataset.screen === s.tab));

    const openCount = s.sos.filter((a) => a.status === 'active').length;
    const badge = this.root.querySelector('[data-sos-count]');
    badge.textContent = openCount;
    badge.hidden = openCount === 0;

    this.region('banner').innerHTML = [
      s.offline ? `<div class="live-note tone-attention" role="status">${icon('signal', 16)}<span>You're offline. Showing the last data received; it will refresh when you reconnect.</span></div>` : '',
      s.error ? `<div class="live-note tone-danger" role="alert">${icon('alert', 16)}<span>Couldn't load live data: ${esc(s.error)}</span><button class="btn btn--soft btn--sm" data-action="reload">Retry</button></div>` : ''
    ].join('');

    if (s.tab !== 'map') this.screen(s.tab).innerHTML = this[`render_${s.tab}`]();
    if (s.tab === 'map') this.renderMap();
    this.renderSosOverlay();
  }

  region(name) {
    return this.root.querySelector(`[data-region="${name}"]`);
  }

  screen(name) {
    return this.root.querySelector(`[data-screen="${name}"]`);
  }

  pageHead(eyebrow, title, lede, actions = '') {
    return `
      <header class="page-head">
        <div class="page-head__text">
          <p class="eyebrow">${eyebrow}</p>
          <h1 class="display">${title}</h1>
          ${lede ? `<p class="lede">${lede}</p>` : ''}
        </div>
        ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
      </header>
    `;
  }

  loadingBlock() {
    return `<div class="live-loading">${icon('locate', 22)}<span>Loading your family…</span></div>`;
  }

  render_home() {
    const s = this.s;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const head = this.pageHead(today, `${greeting}, ${esc(this.me.display_name.split(' ')[0])}`, 'Live status from your children\'s devices.',
      s.children.length ? `<button class="btn btn--soft" data-tab="map">${icon('map', 16)} Open live map</button>` : '');

    if (s.loading) return head + this.loadingBlock();
    if (!s.children.length) {
      return head + `
        <section class="card live-empty">
          <span class="empty__icon">${icon('userPlus', 26)}</span>
          <h3>Link your first child</h3>
          <ol class="steps live-steps">
            <li><strong>Create an account on your child's phone</strong><span>Open SafeHaven there and choose "Child's phone".</span></li>
            <li><strong>Create an invite code here</strong><span>It works once and expires after 15 minutes.</span></li>
            <li><strong>Type the code on your child's phone</strong><span>Your child completes the link — nothing is shared until they do.</span></li>
          </ol>
          <button class="btn btn--primary" data-action="invite">${icon('link', 16)} Create invite code</button>
        </section>
      `;
    }

    const statuses = s.children.map((c) => ({ c, st: this.statusOf(c) }));
    const sosChild = statuses.find((x) => x.st.sos);
    const problem = statuses.find((x) => ['offline', 'denied', 'paused', 'none', 'stale'].includes(x.st.freshness.key));
    const outside = statuses.find((x) => x.st.tone === 'attention' && x.st.freshness.key === 'live');

    let hero;
    if (sosChild) {
      const a = sosChild.st.sos;
      hero = this.hero('danger', 'siren', 'SOS · sent by child', ago(a.created_at), `${esc(sosChild.c.display_name)} pressed SOS`,
        `${a.status === 'acknowledged' ? 'Acknowledged. ' : ''}${a.lat != null ? `Location from ${ago(a.location_recorded_at)} (±${Math.round(a.accuracy_m)} m) was attached.` : 'No location was available.'}`,
        `${a.status === 'active' ? `<button class="btn btn--ink" data-action="ack" data-id="${a.id}">Acknowledge</button>` : ''}
         <button class="btn btn--glass" data-action="locate" data-id="${a.child_id}">${icon('map', 15)} View on map</button>
         <a class="btn btn--glass" href="tel:112">${icon('phone', 15)} Call 112</a>`);
    } else if (problem || outside) {
      const x = problem || outside;
      hero = this.hero('attention', 'alert', problem ? 'Location' : 'Automatic · safe zones', x.st.freshness.label,
        problem ? `${esc(x.c.display_name)}: ${esc(x.st.freshness.label.toLowerCase())}` : `${esc(x.c.display_name)} is outside safe zones`,
        esc(problem ? x.st.freshness.desc : `Live position, not inside any of ${x.c.display_name}'s safe zones.`),
        s.latest[x.c.id] ? `<button class="btn btn--ink" data-action="locate" data-id="${x.c.id}">${icon('map', 15)} View last position</button>` : '');
    } else {
      const allZoned = statuses.every((x) => x.st.inside.length);
      hero = this.hero('safe', 'shieldCheck', 'All clear', 'Live',
        allZoned ? 'Everyone is in a safe zone' : 'Everyone is sharing location',
        'Every linked child has reported a position in the last 2 minutes.', '');
    }

    const feed = this.timeline().slice(0, 5);
    return head + `
      <div class="home-top">
        ${hero}
        <aside class="home-aside">
          <section class="card">
            <div class="card-head">
              <h3 class="card-title">Recent activity</h3>
              <button class="link-btn" data-tab="alerts">View all ${icon('chevronRight', 14)}</button>
            </div>
            ${feed.length ? `<ol class="feed">${feed.map((item) => `
              <li class="feed__item" data-tab="alerts">
                <span class="feed__icon tone-${item.tone}">${icon(item.ic, 15)}</span>
                <div class="feed__body"><div class="feed__title">${item.title}</div><div class="feed__meta">${item.kindLabel} · ${ago(item.at)}</div></div>
              </li>`).join('')}</ol>` : `<p class="empty-inline">No zone events or SOS alerts yet.</p>`}
          </section>
        </aside>
      </div>

      <div class="section-head">
        <h2 class="section-title">Family</h2>
        <span class="section-count">${s.children.length}</span>
        <button class="link-btn" data-tab="family">Manage ${icon('chevronRight', 14)}</button>
      </div>
      <div class="child-grid">${statuses.map(({ c, st }) => this.childCard(c, st)).join('')}</div>
      <p class="trust-note">${icon('eyeOff', 15)} Children always see when their location is being shared and can pause it. SafeHaven never shows a location it didn't receive from the child's device.</p>
    `;
  }

  hero(tone, ic, eyebrow, time, title, desc, actions) {
    return `
      <section class="hero hero--${tone}">
        <div class="hero__top">
          <span class="hero__badge">${icon(ic, 20)}</span>
          <div class="hero__meta"><span class="hero__eyebrow">${eyebrow}</span><span class="hero__time">${time}</span></div>
        </div>
        <h2 class="hero__title">${title}</h2>
        <p class="hero__desc">${desc}</p>
        ${actions ? `<div class="hero__actions">${actions}</div>` : ''}
      </section>
    `;
  }

  childCard(c, st) {
    const loc = this.s.latest[c.id];
    return `
      <article class="child-card tone-${st.tone}">
        <header class="child-card__head">
          ${avatarHtml(c.display_name, 'lg', st.tone)}
          <div class="child-card__id"><h3>${esc(c.display_name)}</h3><p>${st.sos ? 'SOS active' : esc(st.freshness.desc)}</p></div>
          <span class="pill pill--${st.freshness.tone}"><i class="dot"></i>${st.freshness.label}</span>
        </header>
        <div class="place">
          <span class="place__icon">${icon(st.place.ic, 17)}</span>
          <div class="place__text"><span class="place__label">${st.place.label}</span><span class="place__name">${esc(st.place.name)}</span></div>
        </div>
        <dl class="stats">
          <div><dt>Accuracy</dt><dd>${loc ? `±${Math.round(loc.accuracy_m)} m` : '—'}</dd></div>
          <div><dt>Battery</dt><dd>${loc && loc.battery_pct != null ? `${loc.battery_pct}%` : '—'}</dd></div>
          <div><dt>Position</dt><dd>${loc ? ago(loc.recorded_at) : '—'}</dd></div>
        </dl>
        <footer class="child-card__actions">
          <button class="btn btn--primary btn--sm btn--grow" data-action="locate" data-id="${c.id}" ${loc ? '' : 'disabled'}>${icon('map', 15)} Live map</button>
          <button class="btn btn--soft btn--sm" data-action="add-zone" data-id="${c.id}">${icon('shield', 15)} Safe zone</button>
        </footer>
      </article>
    `;
  }

  /* Combined SOS + zone event history, newest first */
  timeline() {
    const name = (id) => esc((this.childById(id) || {}).display_name || 'Child');
    const sos = this.s.sos.map((a) => ({
      kind: 'sos', kindLabel: 'SOS · sent by child', at: a.created_at, tone: 'danger', ic: 'siren',
      title: `${name(a.child_id)} pressed SOS`, item: a
    }));
    const evs = this.s.events.map((e) => ({
      kind: 'zone', kindLabel: 'Automatic · safe zone', at: e.occurred_at, tone: e.transition === 'enter' ? 'safe' : 'attention', ic: e.transition === 'enter' ? 'checkCircle' : 'pin',
      title: `${name(e.child_id)} ${e.transition === 'enter' ? 'arrived at' : 'left'} ${esc(e.zone_name)}`, item: e
    }));
    return [...sos, ...evs].sort((a, b) => new Date(b.at) - new Date(a.at));
  }

  render_alerts() {
    const s = this.s;
    const head = this.pageHead('Activity', 'Alerts', 'SOS alerts are sent by your child. Safe-zone events are detected automatically from location updates.');
    if (s.loading) return head + this.loadingBlock();
    const all = this.timeline();
    const filters = [
      { key: 'all', label: 'All' },
      { key: 'sos', label: 'SOS (sent by child)' },
      { key: 'zone', label: 'Safe-zone events (automatic)' }
    ];
    const list = all.filter((x) => s.filter === 'all' || x.kind === s.filter);
    return head + `
      <div class="chips" role="tablist" aria-label="Filter alerts">
        ${filters.map((f) => `<button class="chip ${s.filter === f.key ? 'active' : ''}" role="tab" aria-selected="${s.filter === f.key}" data-action="filter" data-id="${f.key}">${f.label}<span class="chip__count">${all.filter((x) => f.key === 'all' || x.kind === f.key).length}</span></button>`).join('')}
      </div>
      <div class="alert-list">
        ${list.length ? list.map((x) => (x.kind === 'sos' ? this.sosCard(x.item) : this.zoneCard(x.item))).join('') : `
          <div class="empty">
            <span class="empty__icon">${icon('shieldCheck', 26)}</span>
            <h3>Nothing here yet</h3>
            <p>${s.children.length ? 'SOS alerts and safe-zone arrivals and departures will appear here.' : 'Link a child to start receiving alerts.'}</p>
          </div>`}
      </div>
    `;
  }

  sosCard(a) {
    const child = this.childById(a.child_id);
    const name = esc(child ? child.display_name : 'Child');
    const statusPill = {
      active: '<span class="pill pill--danger">Active</span>',
      acknowledged: '<span class="pill pill--attention">Acknowledged</span>',
      resolved: '<span class="pill pill--safe">Resolved</span>',
      cancelled: '<span class="pill pill--neutral">Cancelled by child</span>'
    }[a.status];
    const mine = this.s.notifs.filter((n) => n.sos_id === a.id);
    const devices = mine.filter((n) => n.status !== 'no_subscription');
    const delivered = devices.filter((n) => n.status === 'delivered');
    let delivery;
    if (!mine.length) delivery = 'No push was sent to you (push notifications are not configured on the server, or the alert is still being processed).';
    else if (!devices.length) delivery = 'No push was sent to you: you have not turned on notifications on any device (Settings → Notifications).';
    else delivery = devices.map((n) => n.status === 'delivered'
      ? `Delivered to your device at ${clock(n.delivered_at)}`
      : n.status === 'sent' ? 'Sent to the push service — not yet confirmed by your device'
      : n.status === 'failed' ? `Push failed: ${esc(n.detail || 'unknown error')}` : 'Queued').join(' · ');
    const busy = this.s.busy.has(a.id);

    return `
      <article class="alert-card tone-danger ${a.status === 'active' ? 'is-unread' : ''}">
        <span class="alert-card__icon">${icon('siren', 18)}</span>
        <div class="alert-card__body">
          <div class="alert-card__meta">
            <span class="pill pill--danger">SOS · sent by child</span>${statusPill}
            <time datetime="${a.created_at}">${ago(a.created_at)} · ${fullTime(a.created_at)}</time>
          </div>
          <h3 class="alert-card__title">${name} pressed SOS</h3>
          <p class="alert-card__text">${a.lat != null
            ? `Last known location: <span class="mono">${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}</span> (±${Math.round(a.accuracy_m)} m), recorded ${fullTime(a.location_recorded_at)}.`
            : 'No location had been received from the device when SOS was pressed.'}</p>
          <dl class="why__list live-sos-facts">
            <div><dt>Push delivery</dt><dd>${delivery}</dd></div>
            ${a.acknowledged_at ? `<div><dt>Acknowledged</dt><dd>${fullTime(a.acknowledged_at)}</dd></div>` : ''}
            ${a.closed_at ? `<div><dt>${a.status === 'cancelled' ? 'Cancelled' : 'Resolved'}</dt><dd>${fullTime(a.closed_at)}</dd></div>` : ''}
          </dl>
          <div class="alert-card__actions">
            ${a.status === 'active' ? `<button class="btn btn--danger btn--sm" data-action="ack" data-id="${a.id}" ${busy ? 'disabled' : ''}>Acknowledge</button>` : ''}
            ${a.status === 'active' || a.status === 'acknowledged' ? `<button class="btn btn--soft btn--sm" data-action="resolve" data-id="${a.id}" ${busy ? 'disabled' : ''}>Mark resolved</button>` : ''}
            ${a.lat != null ? `<button class="btn btn--soft btn--sm" data-action="locate-sos" data-id="${a.id}">${icon('map', 15)} View on map</button>` : ''}
            <a class="btn btn--ghost btn--sm" href="tel:112">${icon('phone', 15)} Call 112</a>
          </div>
        </div>
      </article>
    `;
  }

  zoneCard(e) {
    const child = this.childById(e.child_id);
    const enter = e.transition === 'enter';
    return `
      <article class="alert-card tone-${enter ? 'safe' : 'attention'}">
        <span class="alert-card__icon">${icon(enter ? 'checkCircle' : 'pin', 18)}</span>
        <div class="alert-card__body">
          <div class="alert-card__meta">
            <span class="pill pill--info">Automatic · safe zone</span>
            <time datetime="${e.occurred_at}">${ago(e.occurred_at)} · ${fullTime(e.occurred_at)}</time>
          </div>
          <h3 class="alert-card__title">${esc(child ? child.display_name : 'Child')} ${enter ? 'arrived at' : 'left'} ${esc(e.zone_name)}</h3>
          <p class="alert-card__text">Detected from a location fix accurate to ±${Math.round(e.accuracy_m)} m, ${Math.round(e.distance_m)} m from the zone centre.</p>
        </div>
      </article>
    `;
  }

  render_family() {
    const s = this.s;
    const head = this.pageHead('Family', 'Children & linking', 'Link a child\'s phone with a one-time code. Each link can be removed at any time.',
      `<button class="btn btn--primary" data-action="invite">${icon('link', 16)} Create invite code</button>`);
    if (s.loading) return head + this.loadingBlock();

    const inv = s.invite;
    const remaining = inv ? Math.max(0, new Date(inv.expires_at).getTime() - Date.now()) : 0;
    const inviteCard = inv && remaining > 0 ? `
      <section class="card live-invite">
        <div class="pair">
          <div class="pair__code" aria-label="Invite code ${esc(inv.code)}">${esc(inv.code.replace('-', '')).split('').map((d) => `<span>${d}</span>`).join('')}</div>
          <p class="pair__hint">${icon('clock', 13)} Expires at ${clock(inv.expires_at)} (${Math.ceil(remaining / 60000)} min) · works once</p>
        </div>
        <p class="fine">On your child's phone: sign in to their SafeHaven child account and enter this code. The link is only created when they do.</p>
      </section>
    ` : inv ? `<div class="live-note tone-attention">${icon('clock', 16)}<span>Your last invite code expired. Create a new one.</span></div>` : '';

    return head + inviteCard + `
      <section class="card card--flush">
        <div class="card-head card-head--pad"><div><h3 class="card-title">Linked children</h3><p class="card-sub">Only you and other linked guardians can see their data.</p></div></div>
        ${s.children.length ? `<ul class="rows">${s.children.map((c) => `
          <li class="row live-family-row">
            ${avatarHtml(c.display_name, 'sm')}
            <div class="row__body">
              <div class="row__title">${esc(c.display_name)}</div>
              <div class="row__sub">Linked ${new Date(c.linked_at).toLocaleDateString()} · ${this.s.zones.filter((z) => z.child_id === c.id).length} safe zones</div>
            </div>
            <label class="live-inline-field">
              <span>Keep history</span>
              <span class="select-wrap">
                <select class="select" data-action="retention" data-id="${c.id}" aria-label="Location history retention for ${esc(c.display_name)}">
                  ${[1, 7, 14, 30].map((d) => `<option value="${d}" ${c.location_retention_days === d ? 'selected' : ''}>${d === 1 ? '24 hours' : `${d} days`}</option>`).join('')}
                </select>${icon('chevronDown', 15)}
              </span>
            </label>
            <div class="row__actions">
              <button class="btn btn--soft btn--sm" data-action="purge" data-id="${c.id}">${icon('trash', 14)} Delete history</button>
              <button class="btn btn--danger-soft btn--sm" data-action="unlink" data-id="${c.id}">Unlink</button>
            </div>
          </li>`).join('')}</ul>` : `<div class="empty empty--compact"><span class="empty__icon">${icon('users', 22)}</span><p>No children linked yet. Create an invite code to start.</p></div>`}
      </section>
    `;
  }

  render_settings() {
    const s = this.s;
    const pushCopy = {
      unknown: ['Checking…', false],
      unsupported: ['This browser does not support push notifications. You will still see alerts while SafeHaven is open.', false],
      unconfigured: ['Push is not configured on this server (missing VAPID keys). Alerts only appear while SafeHaven is open.', false],
      denied: ['Blocked — allow notifications for this site in your browser settings, then reload.', false],
      off: ['Get SOS alerts on this device even when SafeHaven is closed.', true],
      on: ['On for this device. SOS alerts arrive even when SafeHaven is closed.', true]
    }[s.push];
    return this.pageHead('Preferences', 'Settings', 'Notifications, account and privacy.') + `
      <div class="settings-grid">
        <div class="stack">
          <section class="group">
            <h3 class="group__title">${icon('bell', 15)} Notifications</h3>
            <div class="card card--flush">
              <label class="row row--control">
                <div class="row__body"><div class="row__title">SOS push notifications on this device</div><div class="row__sub">${pushCopy[0]}</div></div>
                <input type="checkbox" class="switch" data-action="push" ${s.push === 'on' ? 'checked' : ''} ${pushCopy[1] ? '' : 'disabled'} />
              </label>
              <div class="row"><div class="row__body"><div class="row__title">Emergency services</div><div class="row__sub">SafeHaven does not contact police or ambulance automatically. Call 112 yourself when needed.</div></div></div>
            </div>
          </section>
          <section class="group">
            <h3 class="group__title">${icon('shieldCheck', 15)} Privacy & data</h3>
            <div class="card card--flush">
              <div class="row"><div class="row__body"><div class="row__title">What is stored</div><div class="row__sub">Location fixes (position, accuracy, battery, time) for each child's retention period — set per child under Family. SOS records keep the location that was attached. Safe-zone events keep the zone name and distance.</div></div></div>
              <div class="row"><div class="row__body"><div class="row__title">Who can see it</div><div class="row__sub">Only linked guardians and the child, enforced by database row-level security.</div></div></div>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="group">
            <h3 class="group__title">${icon('user', 15)} Account</h3>
            <div class="card card--flush">
              <div class="row">${avatarHtml(this.me.display_name, 'sm')}<div class="row__body"><div class="row__title">${esc(this.me.display_name)}</div><div class="row__sub">${esc(this.email)} · Guardian</div></div></div>
              <button class="row row--control" data-action="signout"><div class="row__body"><div class="row__title">Sign out</div></div>${icon('logOut', 16)}</button>
            </div>
          </section>
          <section class="group">
            <h3 class="group__title">${icon('play', 15)} Demo</h3>
            <div class="card card--flush">
              <button class="row row--control" data-action="demo"><div class="row__body"><div class="row__title">Switch to demo mode</div><div class="row__sub">A sample family with synthetic data, for presentations. Your live data is untouched.</div></div>${icon('chevronRight', 16)}</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  /* ---------------- map ---------------- */

  renderMap() {
    const el = this.root.querySelector('#leaflet-map');
    if (!this.map.map) this.map.mount(el);
    this.map.invalidate();
    const s = this.s;
    this.map.setChildren(s.children.map((c) => ({
      id: c.id, name: c.display_name, tone: this.statusOf(c).tone, location: s.latest[c.id], selected: c.id === s.selected
    })));
    this.map.setZones(s.zones.filter((z) => z.child_id === s.selected), (id) => this.openZoneModal(this.s.zones.find((z) => z.id === id)));
    if (!this.map.didFit) {
      const pts = [...Object.values(s.latest).filter(Boolean).map((l) => [l.lat, l.lng]), ...s.zones.map((z) => [z.lat, z.lng])];
      if (pts.length) this.map.fitAll(pts);
    }
    this.renderMapOverlays();
  }

  renderMapOverlays() {
    const s = this.s;
    const chips = this.region('chips');
    if (!chips) return;
    chips.innerHTML = s.children.length ? s.children.map((c) => `
      <button class="map-chip ${c.id === s.selected ? 'active' : ''}" data-action="select" data-id="${c.id}">
        <span class="map-chip__avatar tone-${this.statusOf(c).tone} live-chip-avatar">${esc(c.display_name[0] || '?')}</span><span>${esc(c.display_name)}</span>
      </button>`).join('') : '<span class="map-chip">No linked children</span>';

    const sync = this.region('sync');
    sync.textContent = s.realtime === 'SUBSCRIBED' ? 'Live updates on' : s.offline ? 'Offline' : 'Connecting to live updates…';
    sync.parentElement.classList.toggle('is-off', s.realtime !== 'SUBSCRIBED');

    const sheet = this.region('sheet');
    const child = this.childById(s.selected);
    if (!child) {
      sheet.innerHTML = `<p class="empty-inline">Link a child to see them on the map.</p>`;
      return;
    }
    const st = this.statusOf(child);
    const loc = s.latest[child.id];
    const zones = s.zones.filter((z) => z.child_id === child.id);
    sheet.innerHTML = `
      <div class="map-sheet__who">
        ${avatarHtml(child.display_name, 'md', st.tone)}
        <div class="map-sheet__id">
          <div class="map-sheet__name">${esc(child.display_name)} <span class="pill pill--${st.freshness.tone}"><i class="dot"></i>${st.freshness.label}</span></div>
          <div class="map-sheet__place">${icon(st.place.ic, 14)}<span>${esc(st.place.label)}${st.inside.length ? ` · ${esc(st.place.name)}` : ''}</span></div>
          <div class="map-sheet__meta">
            ${loc ? `<span>${icon('clock', 13)} Position ${fullTime(loc.recorded_at)}</span><span>±${Math.round(loc.accuracy_m)} m</span>${loc.battery_pct != null ? `<span>${loc.battery_pct}% battery</span>` : ''}` : `<span>${esc(st.freshness.desc)}</span>`}
          </div>
        </div>
      </div>
      <div class="live-zone-list">
        ${zones.map((z) => `<button class="tag live-zone-tag" data-action="edit-zone" data-id="${z.id}">${icon('shield', 12)} ${esc(z.name)} · ${z.radius_m} m</button>`).join('')}
      </div>
      <div class="map-sheet__actions">
        <button class="btn btn--primary btn--sm" data-action="center" ${loc ? '' : 'disabled'}>${icon('locate', 15)} Center on ${esc(child.display_name)}</button>
        <button class="btn btn--soft btn--sm" data-action="add-zone" data-id="${child.id}">${icon('plus', 15)} Safe zone</button>
      </div>
    `;
  }

  /* ---------------- SOS overlay ---------------- */

  renderSosOverlay() {
    let overlay = document.getElementById('emergency-broadcast-overlay');
    const a = this.s.sos.find((x) => x.status === 'active' && !this.s.overlayDismissed.has(x.id));
    if (!a) {
      if (overlay) overlay.remove();
      return;
    }
    const child = this.childById(a.child_id);
    const name = esc(child ? child.display_name : 'Your child');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'emergency-broadcast-overlay';
      overlay.className = 'sos-overlay is-open';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-labelledby', 'sos-overlay-title');
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => this.onClick(e));
    }
    overlay.innerHTML = `
      <div class="sos-overlay__inner">
        <div class="sos-overlay__pulse">${icon('siren', 34)}</div>
        <p class="sos-overlay__eyebrow">SOS sent by child · ${clock(a.created_at)}</p>
        <h2 class="sos-overlay__title" id="sos-overlay-title">${name} needs help</h2>
        <p class="sos-overlay__lede">${name} pressed the SOS button ${ago(a.created_at)}. SafeHaven has not contacted emergency services.</p>
        <div class="sos-overlay__card">
          <dl>
            <div><dt>Location</dt><dd class="mono">${a.lat != null ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : 'Not available'}</dd></div>
            ${a.lat != null ? `<div><dt>Accuracy</dt><dd>±${Math.round(a.accuracy_m)} m, recorded ${ago(a.location_recorded_at)}</dd></div>` : ''}
          </dl>
        </div>
        <div class="sos-overlay__actions">
          <button class="btn btn--white btn--lg btn--block" data-action="ack" data-id="${a.id}">I've seen this — acknowledge</button>
          <div class="sos-overlay__row">
            <a class="btn btn--glass-dark btn--block" href="tel:112">${icon('phone', 16)} Call 112</a>
            ${a.lat != null ? `<button class="btn btn--glass-dark btn--block" data-action="locate-sos" data-id="${a.id}">${icon('map', 16)} View on map</button>` : ''}
          </div>
          <button class="btn btn--glass-dark btn--block" data-action="dismiss-overlay" data-id="${a.id}">Close (keeps SOS active)</button>
        </div>
      </div>
    `;
  }

  /* ---------------- actions ---------------- */

  onClick(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && this.root.contains(tabBtn)) {
      this.s.tab = tabBtn.dataset.tab;
      this.render();
      if (this.s.tab === 'map') this.map.invalidate();
      window.scrollTo({ top: 0 });
      return;
    }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'reload': this.load(); break;
      case 'invite': this.createInvite(); break;
      case 'filter': this.s.filter = id; this.render(); break;
      case 'ack': this.sosAction('acknowledge_sos', id, 'Acknowledged', `Your child's app now shows that you've seen it.`); break;
      case 'resolve': this.sosAction('resolve_sos', id, 'Resolved', 'The SOS is closed.'); break;
      case 'dismiss-overlay': this.s.overlayDismissed.add(id); soundFx.stopEmergencySOS(); this.render(); break;
      case 'locate': this.locate(id); break;
      case 'locate-sos': {
        const a = this.s.sos.find((x) => x.id === id);
        this.s.overlayDismissed.add(id);
        soundFx.stopEmergencySOS();
        this.s.selected = a.child_id;
        this.s.tab = 'map';
        this.render();
        setTimeout(() => this.map.focus(a.lat, a.lng, 17), 100);
        break;
      }
      case 'select': this.s.selected = id; this.render(); this.centerSelected(); break;
      case 'center': this.centerSelected(); break;
      case 'zoom-in': this.map.zoomBy(1); break;
      case 'zoom-out': this.map.zoomBy(-1); break;
      case 'fit': {
        const pts = Object.values(this.s.latest).filter(Boolean).map((l) => [l.lat, l.lng]);
        if (pts.length) this.map.fitAll(pts); else showToast('Nothing to show', 'No child has shared a location yet.', 'info');
        break;
      }
      case 'add-zone': this.openZoneModal(null, id || this.s.selected); break;
      case 'edit-zone': this.openZoneModal(this.s.zones.find((z) => z.id === id)); break;
      case 'purge': this.confirmPurge(id); break;
      case 'unlink': this.confirmUnlink(id); break;
      case 'signout': sb().auth.signOut(); break;
      case 'demo': window.enterDemoMode(); break;
      case 'cancel-pick': this.endPick(); break;
      default: break;
    }
  }

  async onChange(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'retention') {
      try {
        await call('set_child_retention', { p_child: el.dataset.id, p_days: Number(el.value) });
        showToast('Saved', `Location history older than ${el.value === '1' ? '24 hours' : `${el.value} days`} is deleted automatically.`, 'info');
        this.load();
      } catch (err) {
        showToast('Couldn\'t save', err.message, 'warning');
        this.load();
      }
    } else if (el.dataset.action === 'push') {
      el.disabled = true;
      try {
        if (el.checked) {
          await enablePush();
          showToast('Push notifications on', 'SOS alerts will reach this device even when SafeHaven is closed.', 'safe');
        } else {
          await disablePush();
          showToast('Push notifications off', 'This device will no longer receive SOS pushes.', 'info');
        }
      } catch (err) {
        showToast('Push notifications', friendlyError(err), 'warning');
      }
      this.s.push = await pushState();
      this.render();
    }
  }

  locate(childId) {
    this.s.selected = childId;
    this.s.tab = 'map';
    this.render();
    setTimeout(() => this.centerSelected(), 100);
  }

  centerSelected() {
    const loc = this.s.latest[this.s.selected];
    if (loc) this.map.focus(loc.lat, loc.lng, 16);
  }

  async createInvite() {
    try {
      const rows = await call('create_link_invite');
      this.s.invite = rows[0];
      this.s.tab = 'family';
      this.render();
      showToast('Invite code ready', 'Enter it on your child\'s phone within 15 minutes.', 'safe');
    } catch (err) {
      showToast('Couldn\'t create a code', err.message, 'warning');
    }
  }

  async sosAction(fn, id, title, msg) {
    this.s.busy.add(id);
    this.s.overlayDismissed.add(id);
    soundFx.stopEmergencySOS();
    this.render();
    try {
      await call(fn, { p_sos: id });
      showToast(title, msg, 'safe');
    } catch (err) {
      showToast('Couldn\'t update the SOS', err.message, 'warning');
    }
    this.s.busy.delete(id);
    await this.load();
  }

  confirmPurge(childId) {
    const c = this.childById(childId);
    this.confirm(`Delete ${esc(c.display_name)}'s location history?`,
      'Every stored location fix is deleted now. Safe-zone events and SOS records are kept. This can\'t be undone.',
      'Delete history', async () => {
        const n = await call('delete_location_history', { p_child: childId });
        showToast('History deleted', `${n} location fixes removed.`, 'info');
        this.load();
      });
  }

  confirmUnlink(childId) {
    const c = this.childById(childId);
    this.confirm(`Unlink ${esc(c.display_name)}?`,
      `You will immediately lose access to ${esc(c.display_name)}'s location, safe zones and alerts. Linking again needs a new invite code entered on their phone.`,
      'Unlink', async () => {
        const { error } = await sb().from('family_links').delete().eq('child_id', childId).eq('parent_id', this.me.id);
        if (error) throw error;
        showToast('Unlinked', `${c.display_name} is no longer linked to you.`, 'info');
        this.load();
      });
  }

  confirm(title, body, okLabel, fn) {
    openModal(title, `<p class="modal__lede">${body}</p>`,
      `<button class="btn btn--ghost" data-modal="no">Cancel</button><button class="btn btn--danger" data-modal="yes">${okLabel}</button>`, { size: 'sm' });
    const o = document.getElementById('global-modal-overlay');
    o.querySelector('[data-modal="no"]').addEventListener('click', closeModal);
    o.querySelector('[data-modal="yes"]').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        await fn();
        closeModal();
      } catch (err) {
        ev.target.disabled = false;
        showToast('Something went wrong', friendlyError(err), 'warning');
      }
    });
  }

  /* ---------------- safe zone create / edit ---------------- */

  openZoneModal(zone, childId = null, draft = null) {
    const s = this.s;
    const cid = zone ? zone.child_id : childId;
    const child = this.childById(cid);
    if (!child) {
      showToast('Link a child first', 'Safe zones belong to a linked child.', 'info');
      return;
    }
    const loc = s.latest[cid];
    const center = this.map.center();
    const v = draft || {
      name: zone ? zone.name : '',
      radius: zone ? zone.radius_m : 150,
      lat: zone ? zone.lat : loc ? loc.lat : center ? center.lat : '',
      lng: zone ? zone.lng : loc ? loc.lng : center ? center.lng : ''
    };
    const fmt = (n) => (n === '' || n == null ? '' : Number(n).toFixed(6));

    openModal(
      zone ? 'Edit safe zone' : `New safe zone for ${esc(child.display_name)}`,
      `
        <p class="modal__lede">You're alerted automatically when ${esc(child.display_name)} enters or leaves this area.</p>
        <form class="form" id="zone-form" novalidate>
          <label class="field"><span class="field__label">Name</span>
            <input class="input" name="name" maxlength="80" required value="${esc(v.name)}" placeholder="e.g. Home, School" /></label>
          <label class="field"><span class="field__label">Radius <output class="field__value" id="zone-radius-out">${v.radius} m</output></span>
            <input class="range" name="radius" type="range" min="25" max="2000" step="25" value="${v.radius}" /></label>
          <div class="field"><span class="field__label">Centre</span>
            <div class="form__row">
              <input class="input mono" name="lat" inputmode="decimal" value="${fmt(v.lat)}" placeholder="Latitude" aria-label="Latitude" />
              <input class="input mono" name="lng" inputmode="decimal" value="${fmt(v.lng)}" placeholder="Longitude" aria-label="Longitude" />
            </div>
            <div class="form__row">
              <button type="button" class="btn btn--soft btn--sm" data-zone="pick">${icon('pin', 15)} Pick on map</button>
              <button type="button" class="btn btn--soft btn--sm" data-zone="here" ${loc ? '' : 'disabled'}>${icon('locate', 15)} ${esc(child.display_name)}'s position</button>
            </div>
          </div>
          <p class="form-error" id="zone-error" role="alert" hidden></p>
        </form>
        <p class="fine">Tip: use a radius of at least 100 m. Phone GPS is often off by 10–50 m, and SafeHaven waits for a clear exit before alerting.</p>
      `,
      `
        ${zone ? `<button class="btn btn--danger-soft" data-zone="delete">${icon('trash', 15)} Delete</button>` : ''}
        <button class="btn btn--ghost" data-zone="cancel">Cancel</button>
        <button class="btn btn--primary" data-zone="save">${zone ? 'Save changes' : 'Create zone'}</button>
      `
    );

    const o = document.getElementById('global-modal-overlay');
    const form = o.querySelector('#zone-form');
    const err = o.querySelector('#zone-error');
    const read = () => {
      const fd = new FormData(form);
      return { name: String(fd.get('name') || '').trim(), radius: Number(fd.get('radius')), lat: fd.get('lat'), lng: fd.get('lng') };
    };
    form.radius.addEventListener('input', () => { o.querySelector('#zone-radius-out').textContent = `${form.radius.value} m`; });
    o.querySelector('[data-zone="cancel"]').addEventListener('click', closeModal);
    o.querySelector('[data-zone="here"]').addEventListener('click', () => {
      form.lat.value = loc.lat.toFixed(6);
      form.lng.value = loc.lng.toFixed(6);
    });
    o.querySelector('[data-zone="pick"]').addEventListener('click', () => {
      const d = read();
      closeModal();
      this.beginPick(zone, cid, d);
    });
    if (zone) {
      o.querySelector('[data-zone="delete"]').addEventListener('click', () => {
        closeModal();
        this.confirm(`Delete "${esc(zone.name)}"?`, 'You will stop receiving entry and exit alerts for it. Past events stay in the alert history.', 'Delete zone', async () => {
          const { data, error } = await sb().from('safe_zones').delete().eq('id', zone.id).select('id');
          if (error) throw error;
          if (!data.length) throw new Error('forbidden');
          showToast('Zone deleted', zone.name, 'info');
          this.load();
        });
      });
    }
    form.addEventListener('submit', (e) => e.preventDefault());
    o.querySelector('[data-zone="save"]').addEventListener('click', async (ev) => {
      const d = read();
      const lat = Number(d.lat);
      const lng = Number(d.lng);
      const problem = !d.name ? 'Give the zone a name.'
        : d.name.length > 80 ? 'Name must be 80 characters or fewer.'
        : !(d.radius >= 25 && d.radius <= 5000) ? 'Radius must be between 25 m and 5 km.'
        : d.lat === '' || !Number.isFinite(lat) || lat < -90 || lat > 90 ? 'Latitude must be between -90 and 90.'
        : d.lng === '' || !Number.isFinite(lng) || lng < -180 || lng > 180 ? 'Longitude must be between -180 and 180.'
        : '';
      if (problem) {
        err.textContent = problem;
        err.hidden = false;
        return;
      }
      ev.target.disabled = true;
      const row = { name: d.name, radius_m: Math.round(d.radius), lat, lng };
      const q = zone
        ? sb().from('safe_zones').update(row).eq('id', zone.id).select()
        : sb().from('safe_zones').insert({ ...row, child_id: cid }).select();
      const { data, error } = await q;
      if (error || !data || !data.length) {
        err.textContent = friendlyError(error || 'forbidden');
        err.hidden = false;
        ev.target.disabled = false;
        return;
      }
      closeModal();
      showToast(zone ? 'Zone updated' : 'Safe zone created', `${d.name} · ${Math.round(d.radius)} m. Alerts start from ${esc(child.display_name)}'s next location update.`, 'safe');
      await this.load();
      this.map.focus(lat, lng, 15);
    });
  }

  beginPick(zone, childId, draft) {
    this.s.tab = 'map';
    this.render();
    this.picking = { zone, childId, draft };
    const banner = this.region('pick-banner');
    banner.hidden = false;
    banner.className = 'map-banner glass tone-info';
    banner.innerHTML = `<span class="map-banner__icon">${icon('pin', 16)}</span><div class="map-banner__text"><strong>Click the map to place the zone centre</strong><span>Then adjust the details.</span></div><button class="btn btn--sm btn--ink" data-action="cancel-pick">Cancel</button>`;
    this.map.startPicking((lat, lng) => {
      this.map.showPick(lat, lng, draft.radius);
      this.picking.draft = { ...draft, lat, lng };
      this.endPick();
    });
  }

  endPick() {
    const p = this.picking;
    this.picking = null;
    this.map.stopPicking();
    const banner = this.region('pick-banner');
    banner.hidden = true;
    if (p) this.openZoneModal(p.zone, p.childId, p.draft);
  }
}
