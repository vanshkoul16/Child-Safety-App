/* =========================================================
   SafeHaven - Parent Guardian UI Component Views
   ========================================================= */

import { store } from './state.js';
import { mapCtrl } from './mapController.js';
import { icon, zoneIcon, clean, short, timeAgo, statusOf, batteryMeter, signalBars } from './icons.js';

const ALERT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'safezone', label: 'Safe-zone exits' },
  { key: 'route', label: 'Route deviations' },
  { key: 'battery', label: 'Low battery' },
  { key: 'device', label: 'Offline & issues' }
];

function alertMatches(alert, filter) {
  const t = (alert.title || '').toLowerCase();
  const w = (alert.what || '').toLowerCase();
  switch (filter) {
    case 'emergency': return alert.type === 'critical' || t.includes('emergency') || t.includes('sos');
    case 'safezone': return t.includes('safe zone') || t.includes('departure') || t.includes('exit') || t.includes('arrived');
    case 'route': return t.includes('route') || t.includes('deviation') || w.includes('route');
    case 'battery': return t.includes('battery') || w.includes('battery');
    case 'device': return t.includes('gps') || t.includes('signal') || t.includes('offline') || t.includes('location unavailable') || w.includes('signal');
    default: return true;
  }
}

function alertTone(alert) {
  if (alert.type === 'critical') return { tone: 'danger', label: 'Emergency' };
  if (alert.type === 'warning') return { tone: 'attention', label: 'Attention' };
  return { tone: 'info', label: 'Update' };
}

function alertIcon(alert) {
  const t = (alert.title || '').toLowerCase();
  if (alert.type === 'critical' || t.includes('sos')) return 'siren';
  if (t.includes('battery')) return 'battery';
  if (t.includes('route') || t.includes('deviation')) return 'route';
  if (t.includes('check-in')) return 'checkCircle';
  if (t.includes('gps') || t.includes('signal') || t.includes('unavailable')) return 'signal';
  if (t.includes('fall')) return 'alert';
  if (t.includes('arrived')) return 'checkCircle';
  return 'pin';
}

export class ParentUI {
  constructor() {
    this.container = null;
    this.activeFilter = 'all';
    this.isMounted = false;
    this.lastTab = null;
    this.lastSync = Date.now();
  }

  mount(containerId = 'parent-content-area') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.container.innerHTML = `
      <section id="tab-home" class="screen"></section>
      <section id="tab-map" class="screen screen--map">
        <div class="map-shell">
          <div id="leaflet-map"></div>

          <div class="map-top">
            <div id="map-child-pills" class="map-chips glass"></div>
            <div class="seg glass map-layers" role="group" aria-label="Map style">
              <button class="seg__btn map-style-btn active" data-style="google_streets" onclick="window.changeMapStyle('google_streets')">Streets</button>
              <button class="seg__btn map-style-btn" data-style="google_hybrid" onclick="window.changeMapStyle('google_hybrid')">Satellite</button>
              <button class="seg__btn map-style-btn" data-style="google_terrain" onclick="window.changeMapStyle('google_terrain')">Terrain</button>
            </div>
          </div>

          <div id="map-route-deviation-banner" class="map-banner" hidden></div>

          <div class="map-sync glass" aria-live="off"><i class="map-sync__dot"></i><span id="map-sync-text">Live · synced just now</span></div>

          <div id="map-directions" class="map-directions glass" hidden></div>

          <div class="map-rail glass" role="toolbar" aria-label="Map controls">
            <button class="rail-btn" title="Zoom in" aria-label="Zoom in" onclick="window.mapZoom(1)">${icon('plus', 18)}</button>
            <button class="rail-btn" title="Zoom out" aria-label="Zoom out" onclick="window.mapZoom(-1)">${icon('minus', 18)}</button>
            <span class="rail-sep"></span>
            <button class="rail-btn" title="My location" aria-label="My location" onclick="window.useMyCurrentLocation()">${icon('locate', 18)}</button>
            <button class="rail-btn" title="Center on selected child" aria-label="Center on selected child" onclick="window.locateSelectedChild()">${icon('user', 18)}</button>
            <button class="rail-btn" title="Directions to selected child" aria-label="Directions to selected child" onclick="window.navigateToSelectedChild()">${icon('navigation', 18)}</button>
            <button class="rail-btn" title="Fit everyone in view" aria-label="Fit everyone in view" onclick="window.fitAllMapBounds()">${icon('expand', 18)}</button>
            <button class="rail-btn" title="Jammu overview" aria-label="Jammu overview" onclick="window.goToJammuLocation()">${icon('compass', 18)}</button>
            <span class="rail-sep"></span>
            <button class="rail-btn rail-btn--accent" title="Add safe zone" aria-label="Add safe zone" onclick="window.openAddZoneModal()">${icon('shield', 18)}</button>
          </div>

          <div id="map-bottom-sheet" class="map-sheet glass"></div>
        </div>
      </section>
      <section id="tab-alerts" class="screen"></section>
      <section id="tab-zones" class="screen"></section>
      <section id="tab-children" class="screen"></section>
      <section id="tab-settings" class="screen"></section>
    `;

    this.isMounted = true;
    this.render();

    // Live sync timestamp on the map
    setInterval(() => {
      const el = document.getElementById('map-sync-text');
      if (el) el.textContent = `Live · synced ${timeAgo(this.lastSync).toLowerCase()}`;
    }, 5000);

    store.subscribe(() => {
      this.render();
    });
  }

  render() {
    if (!this.container || !this.isMounted) return;
    const state = store.get();
    const activeTab = state.activeParentTab || 'home';
    this.lastSync = Date.now();
    const syncEl = document.getElementById('map-sync-text');
    if (syncEl) syncEl.textContent = `Live · synced ${new Date(this.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;

    this._set('tab-home', this.renderHomeContent(state));
    this._renderMapOverlays(state);

    // Keep "Why did I receive this?" panels open across live re-renders
    const alertsTab = document.getElementById('tab-alerts');
    const openWhy = alertsTab ? [...alertsTab.querySelectorAll('details[open]')].map(d => d.dataset.id) : [];
    this._set('tab-alerts', this.renderAlertsContent(state));
    openWhy.forEach(id => {
      const d = alertsTab.querySelector(`details[data-id="${id}"]`);
      if (d) d.open = true;
    });

    this._set('tab-zones', this.renderSafeZonesContent(state));
    this._set('tab-children', this.renderChildrenContent(state));
    this._set('tab-settings', this.renderSettingsContent(state));

    ['home', 'map', 'alerts', 'zones', 'children', 'settings'].forEach(tab => {
      const el = document.getElementById(`tab-${tab}`);
      if (el) el.classList.toggle('active', tab === activeTab);
    });

    if (activeTab !== this.lastTab) {
      const main = document.getElementById('parent-content-area');
      if (main && this.lastTab !== null) main.scrollTop = 0;
      if (this.lastTab !== null && activeTab !== 'map') window.scrollTo({ top: 0 });
      if (activeTab === 'map') mapCtrl.onTabActivated();
      else if (this.lastTab === 'map') mapCtrl.onTabDeactivated();
      this.lastTab = activeTab;
    }

    if (mapCtrl.map) {
      mapCtrl.renderChildrenMarkers();
      mapCtrl.renderSafeZones();
      mapCtrl.renderSelectedChildRoute();
      mapCtrl.renderLiveUserMarker();
    }
  }

  _set(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  _childName(alert) {
    const c = store.getChild(alert.childId);
    return c ? c.name : alert.childName;
  }

  _pageHead(eyebrow, title, lede, actions = '') {
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

  /* -------------------------------------------------------------
     MAP OVERLAYS
     ------------------------------------------------------------- */
  _renderMapOverlays(state) {
    const childPills = document.getElementById('map-child-pills');
    if (childPills) {
      childPills.innerHTML = state.children.map(c => `
        <button class="map-chip ${c.id === state.selectedChildId ? 'active' : ''}" onclick="window.selectChildMap('${c.id}')">
          <span class="map-chip__avatar tone-${statusOf(c).tone}"><img src="${c.avatar}" alt="" /></span>
          <span>${c.name}</span>
        </button>
      `).join('');
    }

    const banner = document.getElementById('map-route-deviation-banner');
    const deviating = state.children.find(c => c.safetyStatus === 'attention' || c.safetyStatus === 'danger');
    if (banner) {
      if (deviating) {
        const st = statusOf(deviating);
        const off = mapCtrl.routeDeviationMeters(deviating.id);
        const isOffRoute = off !== null && off >= 50;
        banner.hidden = false;
        banner.className = `map-banner glass tone-${st.tone}`;
        banner.innerHTML = `
          <span class="map-banner__icon">${icon(isOffRoute ? 'route' : st.icon, 16)}</span>
          <div class="map-banner__text">
            <strong>${deviating.name} · ${isOffRoute ? `${Math.round(off / 10) * 10} m off expected route` : st.label}</strong>
            <span>${clean(deviating.statusReason)}</span>
          </div>
          <button class="btn btn--sm btn--ink" onclick="window.locateChild('${deviating.id}')">Focus</button>
        `;
      } else {
        banner.hidden = true;
      }
    }

    const sheet = document.getElementById('map-bottom-sheet');
    const child = store.getChild(state.selectedChildId);
    if (sheet && child) {
      const zone = state.safeZones.find(z => z.id === child.currentZoneId);
      const st = statusOf(child);
      sheet.innerHTML = `
        <div class="map-sheet__who">
          <span class="avatar avatar--md ring-${st.tone}"><img src="${child.avatar}" alt="" /></span>
          <div class="map-sheet__id">
            <div class="map-sheet__name">${child.name} <span class="pill pill--${st.tone}"><i class="dot"></i>${st.label}</span></div>
            <div class="map-sheet__place">${zone ? zoneIcon(zone.type, 14) : icon('pin', 14)}<span>${zone ? zone.name : clean(child.activity) || 'Outside safe zones'}</span></div>
            <div class="map-sheet__meta">
              <span>${batteryMeter(child.battery)} ${child.battery}%</span>
              <span>${signalBars(child.signal)} ${short(child.signal)}</span>
              <span>${icon('clock', 13)} ${timeAgo(child.lastUpdated)}</span>
            </div>
          </div>
        </div>
        <div class="map-sheet__actions">
          <button class="btn btn--primary btn--sm" onclick="window.navigateToChild('${child.id}')">${icon('navigation', 15)} Navigate to ${child.name}</button>
          <button class="btn btn--soft btn--sm" onclick="window.callChildPhone('${child.name}')">${icon('phone', 15)} Call</button>
        </div>
      `;
    }
  }

  /* -------------------------------------------------------------
     HOME
     ------------------------------------------------------------- */
  renderHomeContent(state) {
    const children = state.children;
    const counts = { safe: 0, attention: 0, danger: 0, unknown: 0 };
    children.forEach(c => { counts[c.safetyStatus] = (counts[c.safetyStatus] || 0) + 1; });

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const guardianName = (state.parent.name || 'Vansh').split(' ')[0];
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

    if (state.auth && !state.auth.isAuthenticated) {
      return `
        <div class="locked">
          <div class="locked__mark">${icon('lock', 26)}</div>
          <h1 class="display">Sign in to continue</h1>
          <p class="lede">Your family's live safety information is protected. Sign in with your guardian account to view it.</p>
          <button class="btn btn--primary btn--lg" onclick="window.openGmailLoginModal()">${icon('mail', 17)} Sign in with Google</button>
          <p class="fine">Demo guardian: <strong>vansh.koul@gmail.com</strong></p>
        </div>
      `;
    }

    const activeAlert = (state.alerts || []).find(a => !a.isDismissed && (a.type === 'critical' || a.type === 'warning'));
    const flagged = children.find(c => c.safetyStatus === 'danger') || children.find(c => c.safetyStatus === 'attention');
    const needsAttention = !!(activeAlert || flagged);
    const isEmergency = counts.danger > 0;

    let hero;
    if (needsAttention) {
      const tone = isEmergency ? 'danger' : 'attention';
      const targetId = (activeAlert && activeAlert.childId) || (flagged && flagged.id) || children[0].id;
      const target = store.getChild(targetId) || children[0];
      hero = `
        <section class="hero hero--${tone}">
          <div class="hero__top">
            <span class="hero__badge">${icon(isEmergency ? 'siren' : 'alert', 20)}</span>
            <div class="hero__meta">
              <span class="hero__eyebrow">${isEmergency ? 'Emergency' : flagged ? 'Needs your attention' : 'Unreviewed alert'}</span>
              <span class="hero__time">${timeAgo(activeAlert ? activeAlert.timestamp : flagged.lastUpdated)}</span>
            </div>
          </div>
          <h2 class="hero__title">${activeAlert ? clean(activeAlert.title) : `${flagged.name} needs your attention`}</h2>
          <p class="hero__desc">${clean(activeAlert ? activeAlert.what : flagged.statusReason)}</p>
          <div class="hero__actions">
            <button class="btn btn--ink" onclick="window.switchTab('alerts')">Review alert</button>
            <button class="btn btn--glass" onclick="window.locateChild('${target.id}')">${icon('map', 15)} View on map</button>
            <button class="btn btn--glass" onclick="window.callChildPhone('${target.name}')">${icon('phone', 15)} Call ${target.name}</button>
          </div>
          ${this._statusMeter(counts, children.length)}
        </section>
      `;
    } else {
      hero = `
        <section class="hero hero--safe">
          <div class="hero__top">
            <span class="hero__badge">${icon('shieldCheck', 20)}</span>
            <div class="hero__meta">
              <span class="hero__eyebrow">All clear</span>
              <span class="hero__time">Live</span>
            </div>
          </div>
          <h2 class="hero__title">Everyone is safe</h2>
          <p class="hero__desc">Every family member is inside a verified safe zone with a healthy battery.</p>
          ${this._statusMeter(counts, children.length)}
        </section>
      `;
    }

    const recent = [...(state.alerts || [])]
      .filter(a => !a.isDismissed)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4);

    const live = state.userLiveLocation;

    return `
      ${this._pageHead(today, `${greeting}, ${guardianName}`, "Here's how your family is doing right now.",
        `<button class="btn btn--soft" onclick="window.switchTab('map')">${icon('map', 16)} Open live map</button>`)}

      <div class="home-top">
        ${hero}
        <aside class="home-aside">

          <section class="card">
            <div class="card-head">
              <h3 class="card-title">Recent activity</h3>
              <button class="link-btn" onclick="window.switchTab('alerts')">View all ${icon('chevronRight', 14)}</button>
            </div>
            ${recent.length ? `
              <ol class="feed">
                ${recent.map(a => {
                  const t = alertTone(a);
                  return `
                    <li class="feed__item" onclick="window.switchTab('alerts')">
                      <span class="feed__icon tone-${t.tone}">${icon(alertIcon(a), 15)}</span>
                      <div class="feed__body">
                        <div class="feed__title">${clean(a.title)}</div>
                        <div class="feed__meta">${this._childName(a)} · ${timeAgo(a.timestamp)}</div>
                      </div>
                    </li>
                  `;
                }).join('')}
              </ol>
            ` : `<p class="empty-inline">No recent activity.</p>`}
          </section>

          <section class="card gps-card ${live ? 'is-live' : ''}">
            <div class="gps-card__icon">${icon('locate', 18)}</div>
            <div class="gps-card__body">
              <h3 class="card-title">${live ? 'Your location is live' : 'Your location'}</h3>
              <p class="card-sub">${live
                ? `<span class="mono">${live.lat.toFixed(4)}° N, ${live.lng.toFixed(4)}° E</span> · ±${live.accuracy}m`
                : 'Use this device\'s GPS to see yourself alongside your family on the map.'}</p>
            </div>
            <button class="btn btn--soft btn--sm" onclick="window.useMyCurrentLocation()">${live ? 'Refresh' : 'Use my location'}</button>
          </section>
        </aside>
      </div>

      <div class="section-head">
        <h2 class="section-title">Family</h2>
        <span class="section-count">${children.length}</span>
        <button class="link-btn" onclick="window.switchTab('children')">Manage ${icon('chevronRight', 14)}</button>
      </div>
      <div class="child-grid">
        ${children.map(child => this._renderChildCard(child, state)).join('')}
      </div>

      <p class="trust-note">${icon('eyeOff', 15)} Children always see when their location is shared. No covert listening, camera access or keystroke logging — ever.</p>
    `;
  }

  _statusMeter(counts, total) {
    const segs = [
      { key: 'safe', label: 'Safe', tone: 'safe' },
      { key: 'attention', label: 'Attention', tone: 'attention' },
      { key: 'danger', label: 'Emergency', tone: 'danger' },
      { key: 'unknown', label: 'Offline', tone: 'offline' }
    ];
    return `
      <div class="meter">
        <div class="meter__bar" role="img" aria-label="${segs.map(s => `${counts[s.key] || 0} ${s.label}`).join(', ')}">
          ${segs.filter(s => counts[s.key]).map(s => `<span class="meter__seg tone-${s.tone}" style="flex:${counts[s.key]}"></span>`).join('')}
        </div>
        <div class="meter__legend">
          ${segs.map(s => `
            <button class="meter__item ${counts[s.key] ? '' : 'is-zero'}" onclick="window.switchTab('${s.key === 'safe' || s.key === 'unknown' ? 'children' : 'alerts'}')">
              <i class="dot tone-${s.tone}"></i><strong>${counts[s.key] || 0}</strong> ${s.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderChildCard(child, state) {
    const st = statusOf(child);
    const zone = state.safeZones.find(z => z.id === child.currentZoneId);
    const placeLabel = zone ? (zone.type === 'school' ? 'At school' : zone.type === 'home' ? 'At home' : 'In a safe zone') : 'Outside safe zones';
    const placeName = zone ? zone.name : (clean(child.activity) || 'Location shared');

    return `
      <article class="child-card tone-${st.tone}">
        <header class="child-card__head">
          <span class="avatar avatar--lg ring-${st.tone}"><img src="${child.avatar}" alt="${child.name}" /></span>
          <div class="child-card__id">
            <h3>${child.name}</h3>
            <p>${clean(child.grade)}</p>
          </div>
          <span class="pill pill--${st.tone}"><i class="dot"></i>${st.label}</span>
        </header>

        <div class="place">
          <span class="place__icon">${zone ? zoneIcon(zone.type, 17) : icon('pin', 17)}</span>
          <div class="place__text">
            <span class="place__label">${placeLabel}</span>
            <span class="place__name">${placeName}</span>
          </div>
        </div>

        <p class="child-card__note">${clean(child.statusReason)}</p>

        <dl class="stats">
          <div><dt>Battery</dt><dd>${batteryMeter(child.battery)} ${child.battery}%</dd></div>
          <div><dt>Signal</dt><dd>${signalBars(child.signal)} ${short(child.signal)}</dd></div>
          <div><dt>Updated</dt><dd>${timeAgo(child.lastUpdated)}</dd></div>
        </dl>

        <footer class="child-card__actions">
          <button class="btn btn--primary btn--sm btn--grow" onclick="window.locateChild('${child.id}')">${icon('map', 15)} Live map</button>
          <button class="btn btn--soft btn--sm btn--icon" onclick="window.callChildPhone('${child.name}')" title="Call ${child.name}" aria-label="Call ${child.name}">${icon('phone', 16)}</button>
          <button class="btn btn--soft btn--sm btn--icon" onclick="window.navigateToChild('${child.id}')" title="Directions to ${child.name}" aria-label="Directions to ${child.name}">${icon('navigation', 16)}</button>
          <button class="btn btn--danger-soft btn--sm btn--icon" onclick="window.parentSOSAlert('${child.id}')" title="SOS alert for ${child.name}" aria-label="Raise SOS alert for ${child.name}">${icon('siren', 16)}</button>
        </footer>
      </article>
    `;
  }

  /* -------------------------------------------------------------
     ALERTS
     ------------------------------------------------------------- */
  renderAlertsContent(state) {
    const all = (state.alerts || []).filter(a => !a.isDismissed).sort((a, b) => b.timestamp - a.timestamp);
    const alerts = all.filter(a => alertMatches(a, this.activeFilter));

    return `
      ${this._pageHead('Activity', 'Alerts', 'Safe-zone changes, route deviations and device signals — each one explained.')}

      <div class="chips" role="tablist" aria-label="Filter alerts">
        ${ALERT_FILTERS.map(f => {
          const n = all.filter(a => alertMatches(a, f.key)).length;
          return `
            <button class="chip ${this.activeFilter === f.key ? 'active' : ''}" role="tab" aria-selected="${this.activeFilter === f.key}" onclick="window.setAlertFilter('${f.key}')">
              ${f.label}<span class="chip__count">${n}</span>
            </button>
          `;
        }).join('')}
      </div>

      <div class="alert-list">
        ${alerts.length === 0 ? `
          <div class="empty">
            <span class="empty__icon">${icon('shieldCheck', 26)}</span>
            <h3>Nothing here</h3>
            <p>No alerts match this filter. Everyone is within their usual safety rules.</p>
          </div>
        ` : alerts.map(alert => {
          const t = alertTone(alert);
          const child = store.getChild(alert.childId);
          const name = this._childName(alert);
          return `
            <article class="alert-card tone-${t.tone} ${alert.isRead ? '' : 'is-unread'}">
              <span class="alert-card__icon">${icon(alertIcon(alert), 18)}</span>
              <div class="alert-card__body">
                <div class="alert-card__meta">
                  <span class="pill pill--${t.tone}">${t.label}</span>
                  <time>${timeAgo(alert.timestamp)} · ${new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </div>
                <h3 class="alert-card__title">${clean(alert.title)}</h3>
                <div class="alert-card__who">
                  ${child ? `<span class="avatar avatar--xs"><img src="${child.avatar}" alt="" /></span>` : ''}
                  <span>${name}</span>
                </div>
                <p class="alert-card__text">${clean(alert.what)}</p>

                <details class="why" data-id="${alert.id}">
                  <summary>${icon('info', 15)} Why did I receive this? ${icon('chevronDown', 15, 'why__chev')}</summary>
                  <dl class="why__list">
                    <div><dt>Sensor telemetry</dt><dd>${clean(alert.evidence)}</dd></div>
                    <div><dt>Severity</dt><dd>${clean(alert.severity)}</dd></div>
                    <div><dt>Suggested action</dt><dd class="why__advice">${clean(alert.recommendedAction)}</dd></div>
                  </dl>
                </details>

                <div class="alert-card__actions">
                  <button class="btn btn--soft btn--sm" onclick="window.locateChild('${alert.childId}')">${icon('map', 15)} View on map</button>
                  <button class="btn btn--soft btn--sm" onclick="window.callChildPhone('${name}')">${icon('phone', 15)} Call</button>
                  <button class="btn btn--ghost btn--sm" onclick="window.dismissAlert('${alert.id}')">Dismiss</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  /* -------------------------------------------------------------
     SAFE ZONES
     ------------------------------------------------------------- */
  _zoneList(zones) {
    return `
      <ul class="rows">
        ${zones.map(zone => `
          <li class="row">
            <span class="row__icon ${zone.isRestricted ? 'tone-danger' : 'tone-safe'}">${zoneIcon(zone.type, 17)}</span>
            <div class="row__body">
              <div class="row__title">${clean(zone.name)} ${zone.isRestricted ? '<span class="pill pill--danger pill--xs">Restricted</span>' : ''}</div>
              <div class="row__sub">${clean(zone.address)}</div>
              <div class="row__tags">
                <span class="tag">${icon('locate', 12)} ${zone.radius} m</span>
                <span class="tag">${icon('calendar', 12)} ${clean(zone.activeSchedule)}</span>
              </div>
            </div>
            <div class="row__actions">
              <button class="icon-btn" title="View on map" aria-label="View ${clean(zone.name)} on map" onclick="window.focusZoneOnMap('${zone.id}')">${icon('map', 17)}</button>
              <button class="icon-btn icon-btn--danger" title="Delete zone" aria-label="Delete ${clean(zone.name)}" onclick="window.deleteZoneConfirm('${zone.id}')">${icon('trash', 17)}</button>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  renderSafeZonesContent(state) {
    return `
      ${this._pageHead('Geofences', 'Safe zones', 'Trusted places and restricted areas across Jammu.',
        `<button class="btn btn--primary" onclick="window.openAddZoneModal()">${icon('plus', 16)} Add zone</button>`)}
      <section class="card card--flush">${this._zoneList(state.safeZones)}</section>
    `;
  }

  /* -------------------------------------------------------------
     FAMILY
     ------------------------------------------------------------- */
  renderChildrenContent(state) {
    const children = state.children;
    const settings = state.settings;

    const routes = [
      { id: 'c1', title: 'School bus route', tag: 'Verified corridor', tone: 'safe', path: ['Gandhi Nagar Sector 3', 'Bikram Chowk', 'Tawi River Bridge', 'Residency Road (DPS gate)'] },
      { id: 'c2', title: 'Walking route home', tag: 'Pedestrian path', tone: 'attention', path: ['Presentation Convent School', 'Sector 2 Church Road', 'Gole Market, Gandhi Nagar'] }
    ];

    return `
      ${this._pageHead('Family', 'Children & devices', 'Profiles, paired phones, places, routes and the people we call in an emergency.',
        `<button class="btn btn--primary" onclick="window.openPairingModal()">${icon('link', 16)} Pair a device</button>`)}

      <div class="profile-grid">
        ${children.map(child => {
          const st = statusOf(child);
          return `
            <article class="card profile">
              <header class="profile__head">
                <span class="avatar avatar--lg ring-${st.tone}"><img src="${child.avatar}" alt="${child.name}" /></span>
                <div class="profile__id">
                  <h3>${child.name} <span class="profile__age">${child.age} yrs</span></h3>
                  <p>${clean(child.grade)}</p>
                </div>
                <span class="pill pill--${st.tone}"><i class="dot"></i>${st.label}</span>
              </header>
              <dl class="spec">
                <div><dt>Device</dt><dd>${short(child.device)}</dd></div>
                <div><dt>System</dt><dd>${short(child.os)}</dd></div>
                <div><dt>Battery</dt><dd>${batteryMeter(child.battery)} ${child.battery}%</dd></div>
                <div><dt>Signal</dt><dd>${signalBars(child.signal)} ${short(child.carrier)}</dd></div>
                <div><dt>Accuracy</dt><dd>${clean(child.gpsAccuracy)}</dd></div>
                <div><dt>Pairing PIN</dt><dd class="mono">${child.pairingCode}</dd></div>
              </dl>
              <footer class="profile__actions">
                <button class="btn btn--soft btn--sm" onclick="window.locateChild('${child.id}')">${icon('map', 15)} Locate</button>
                <button class="btn btn--soft btn--sm" onclick="window.callChildPhone('${child.name}')">${icon('phone', 15)} Call</button>
                <button class="btn btn--soft btn--sm" onclick="window.openChildHistoryModal('${child.id}')">${icon('history', 15)} Timeline</button>
              </footer>
            </article>
          `;
        }).join('')}
      </div>

      <div class="split">
        <section class="card card--flush">
          <div class="card-head card-head--pad">
            <div>
              <h3 class="card-title">Safe zones</h3>
              <p class="card-sub">Alerts fire on entry and exit.</p>
            </div>
            <button class="btn btn--soft btn--sm" onclick="window.openAddZoneModal()">${icon('plus', 15)} Add</button>
          </div>
          ${this._zoneList(state.safeZones)}
        </section>

        <div class="stack">
          <section class="card">
            <div class="card-head">
              <div>
                <h3 class="card-title">Routes</h3>
                <p class="card-sub">Deviation monitoring is on.</p>
              </div>
              <span class="pill pill--safe"><i class="dot"></i>Active</span>
            </div>
            <div class="routes">
              ${routes.map(r => {
                const child = store.getChild(r.id);
                return `
                  <div class="route">
                    <div class="route__head">
                      <strong>${r.title}${child ? ` · ${child.name}` : ''}</strong>
                      <span class="pill pill--${r.tone} pill--xs">${r.tag}</span>
                    </div>
                    <ol class="route__path">${r.path.map(p => `<li>${p}</li>`).join('')}</ol>
                    <div class="route__foot">
                      <span class="tag">${icon('route', 12)} 150 m corridor</span>
                      ${(() => {
                        const off = mapCtrl.routeDeviationMeters(r.id);
                        if (off === null) return '';
                        return off <= 150
                          ? `<span class="tag tag--safe">${icon('check', 12)} On route</span>`
                          : `<span class="tag tag--attention">${icon('alert', 12)} ${Math.round(off / 10) * 10} m off route</span>`;
                      })()}
                      <button class="link-btn" onclick="window.showChildRoute('${r.id}')">Preview on map ${icon('chevronRight', 14)}</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>

          <section class="card card--flush">
            <div class="card-head card-head--pad">
              <div>
                <h3 class="card-title">Emergency contacts</h3>
                <p class="card-sub">Notified the moment SOS is pressed.</p>
              </div>
            </div>
            <ul class="rows">
              ${settings.emergencyContacts.map(c => `
                <li class="row">
                  <span class="row__icon">${icon(/112|1098|office/i.test(c.name) ? 'building' : 'user', 16)}</span>
                  <div class="row__body">
                    <div class="row__title">${clean(c.name)}</div>
                    <div class="row__sub"><span class="mono">${c.phone}</span> · ${clean(c.relation)}</div>
                  </div>
                  <div class="row__actions">
                    ${c.notifySOS ? '<span class="pill pill--danger pill--xs">SOS</span>' : ''}
                    <a class="icon-btn" href="sms:${c.phone.replace(/\s+/g, '')}" title="Send SMS" aria-label="Text ${clean(c.name)}">${icon('message', 16)}</a>
                    <a class="icon-btn" href="tel:${c.phone.replace(/\s+/g, '')}" title="Call" aria-label="Call ${clean(c.name)}">${icon('phone', 16)}</a>
                  </div>
                </li>
              `).join('')}
            </ul>
          </section>
        </div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     SETTINGS
     ------------------------------------------------------------- */
  renderSettingsContent(state) {
    const settings = state.settings;
    const n = settings.notifications;
    const retention = settings.privacy.historyRetentionDays;

    const toggle = (title, desc, checked, onchange, disabled = false) => `
      <label class="row row--control">
        <div class="row__body">
          <div class="row__title">${title}</div>
          <div class="row__sub">${desc}</div>
        </div>
        <input type="checkbox" class="switch" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${onchange ? `onchange="${onchange}"` : ''} />
      </label>
    `;

    const shareMode = settings.privacy.locationSharingMode || 'always';
    const radio = (value, title, desc) => `
      <label class="row row--control">
        <div class="row__body">
          <div class="row__title">${title}</div>
          <div class="row__sub">${desc}</div>
        </div>
        <input type="radio" class="radio" name="loc-share-mode" value="${value}" ${shareMode === value ? 'checked' : ''} onchange="window.setLocationSharingMode('${value}')" />
      </label>
    `;

    const pushSupported = typeof Notification !== 'undefined';
    const pushPermission = pushSupported ? Notification.permission : 'unsupported';
    const pushOn = !!n.push && pushPermission === 'granted';
    const pushDesc = !pushSupported ? 'Not supported in this browser.'
      : pushPermission === 'denied' ? 'Blocked — allow notifications for this site in your browser settings.'
      : 'Alerts on this device, even when SafeHaven is in the background.';

    const devices = state.children.map(c => ({
      name: `${c.name}'s ${short(c.device)}`,
      meta: `${short(c.os)} · ${short(c.carrier)} · End-to-end encrypted`
    }));

    return `
      ${this._pageHead('Preferences', 'Settings', 'Location sharing, notifications, guardians and privacy.')}

      <div class="settings-grid">
        <div class="stack">
          <section class="group">
            <h3 class="group__title">${icon('pin', 15)} Location sharing</h3>
            <div class="card card--flush">
              ${radio('always', 'Always on', 'Continuous live tracking with dual-band GNSS (±1.8 m).')}
              ${radio('moving', 'While moving', 'Saves battery — updates only when walking or travelling.')}
              ${radio('sos', 'Emergency only', 'Location is shared only when SOS is pressed.')}
            </div>
          </section>

          <section class="group">
            <h3 class="group__title">${icon('bell', 15)} Notifications</h3>
            <div class="card card--flush">
              ${toggle('Emergency SOS siren', 'Always on — overrides silent mode when SOS is pressed.', true, '', true)}
              ${toggle('Safe-zone entry & exit', 'When a child arrives at or leaves home, school and other zones.', n.safeZoneAlerts, "window.toggleNotificationSetting('safeZoneAlerts')")}
              ${toggle('Route deviation', 'When a child moves more than 150 m off an approved route.', n.routeDeviation !== false, "window.toggleNotificationSetting('routeDeviation')")}
              ${toggle('Low battery', 'When a phone drops below 20%.', n.batteryAlerts, "window.toggleNotificationSetting('batteryAlerts')")}
              ${toggle('Offline devices', 'When no location is received for more than 10 minutes.', n.locationUnavailable, "window.toggleNotificationSetting('locationUnavailable')")}
            </div>
          </section>

          <section class="group">
            <h3 class="group__title">${icon('message', 15)} How you're alerted</h3>
            <div class="card card--flush">
              ${toggle('Push notifications', pushDesc, pushOn, 'window.togglePushNotifications(this)', !pushSupported || pushPermission === 'denied')}
              ${toggle('SMS alerts', 'Text every SOS contact with a live location link when SOS is pressed.', n.sms !== false, "window.toggleNotificationSetting('sms')")}
              ${toggle('Siren & alert sounds', 'Audible siren for SOS and chimes for check-ins on this device.', !state.isAudioMuted, 'window.toggleAudioMute()')}
            </div>
          </section>

          <section class="group">
            <h3 class="group__title">${icon('history', 15)} Location history</h3>
            <div class="card card--flush">
              <div class="row row--control">
                <div class="row__body">
                  <div class="row__title">Keep history for</div>
                  <div class="row__sub">Older location logs are deleted automatically.</div>
                </div>
                <div class="select-wrap">
                  <select class="select" onchange="window.updateRetentionPolicy(this.value)" aria-label="History retention">
                    <option value="1" ${retention === 1 ? 'selected' : ''}>24 hours</option>
                    <option value="7" ${retention === 7 ? 'selected' : ''}>7 days</option>
                    <option value="30" ${retention === 30 ? 'selected' : ''}>30 days</option>
                    <option value="0" ${retention === 0 ? 'selected' : ''}>Don't keep</option>
                  </select>
                  ${icon('chevronDown', 15)}
                </div>
              </div>
              <div class="row row--buttons">
                <button class="btn btn--soft btn--sm" onclick="window.exportDataJSON()">${icon('download', 15)} Export data</button>
                <button class="btn btn--danger-soft btn--sm" onclick="window.purgeLocationHistory()">${icon('trash', 15)} Delete all history</button>
              </div>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="group">
            <h3 class="group__title">${icon('users', 15)} Guardians</h3>
            <div class="card card--flush">
              <div class="row">
                <span class="row__icon">${icon('user', 16)}</span>
                <div class="row__body">
                  <div class="row__title">Vansh Koul</div>
                  <div class="row__sub">Father · vansh.koul@gmail.com</div>
                </div>
                <span class="pill pill--accent pill--xs">Primary</span>
              </div>
              <div class="row">
                <span class="row__icon">${icon('user', 16)}</span>
                <div class="row__body">
                  <div class="row__title">Isheta Koul</div>
                  <div class="row__sub">Mother · <span class="mono">+91 98765 24811</span></div>
                </div>
                <span class="pill pill--neutral pill--xs">Secondary</span>
              </div>
              <button class="row row--add" onclick="window.showToast('Invitation sent', 'A guardian invite link was sent.', 'safe')">
                <span class="row__icon">${icon('userPlus', 16)}</span>
                <span class="row__title">Invite a guardian</span>
              </button>
            </div>
          </section>

          <section class="group">
            <h3 class="group__title">${icon('smartphone', 15)} Connected devices</h3>
            <div class="card card--flush">
              ${devices.map(d => `
                <div class="row">
                  <span class="row__icon">${icon('smartphone', 16)}</span>
                  <div class="row__body">
                    <div class="row__title">${d.name}</div>
                    <div class="row__sub">${d.meta}</div>
                  </div>
                  <span class="status-text tone-safe"><i class="dot"></i>Connected</span>
                </div>
              `).join('')}
              <button class="row row--add" onclick="window.openPairingModal()">
                <span class="row__icon">${icon('plus', 16)}</span>
                <span class="row__title">Pair a new device</span>
              </button>
            </div>
          </section>

          <section class="promise">
            <span class="promise__icon">${icon('shieldCheck', 20)}</span>
            <div>
              <h3>Our privacy promise</h3>
              <p>SafeHaven is built on trust. We never use covert listening, hidden camera recording, keystroke logging or secret tracking — children are always shown when their location is shared.</p>
              <ul class="promise__list">
                <li>${icon('check', 14)} 256-bit encryption</li>
                <li>${icon('check', 14)} Explicit consent</li>
                <li>${icon('check', 14)} No data sold, ever</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  _timeAgo(timestamp) {
    return timeAgo(timestamp);
  }
}

export const parentUI = new ParentUI();
