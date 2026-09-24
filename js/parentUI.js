/* =========================================================
   SafeHaven - Parent Guardian UI Component Views
   Realistic San Francisco Family Telemetry & Google Maps
   ========================================================= */

import { store } from './state.js';
import { mapCtrl } from './mapController.js';

export class ParentUI {
  constructor() {
    this.container = null;
    this.activeFilter = 'all';
    this.isMounted = false;
  }

  mount(containerId = 'parent-content-area') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.container.innerHTML = `
      <div id="tab-home" class="parent-tab-screen"></div>
      <div id="tab-map" class="parent-tab-screen" style="padding: 0; margin: 0; height: 100%;">
        <div class="map-view-container">
          <!-- Floating Controls Top: Child Pills + Hub Switcher + Google Map Style Switcher -->
          <div class="map-floating-header">
            <div id="map-child-pills" class="map-child-selector-pills"></div>

            <div class="map-location-hub-pills">
              <button class="map-loc-btn active" id="btn-hub-jammu" onclick="window.goToJammuLocation()">
                🏙️ Jammu Hub
              </button>
              <button class="map-loc-btn" id="btn-hub-live" onclick="window.useMyCurrentLocation()">
                📍 My Live GPS
              </button>
            </div>

            <div class="map-style-selector-pills">
              <button class="map-style-btn active" data-style="google_streets" onclick="window.changeMapStyle('google_streets')">
                🗺️ Streets
              </button>
              <button class="map-style-btn" data-style="google_hybrid" onclick="window.changeMapStyle('google_hybrid')">
                🛰️ Satellite
              </button>
              <button class="map-style-btn" data-style="google_terrain" onclick="window.changeMapStyle('google_terrain')">
                🏔️ Terrain
              </button>
            </div>
          </div>

          <!-- Leaflet Map Canvas (PERMANENT DOM NODE) -->
          <div id="leaflet-map"></div>

          <!-- Floating Controls Right -->
          <div class="map-floating-controls">
            <button class="map-ctrl-btn" title="Detect & Center on My Real Device GPS" onclick="window.useMyCurrentLocation()">
              📍
            </button>
            <button class="map-ctrl-btn" title="Jammu Family Hub" onclick="window.goToJammuLocation()">
              🏙️
            </button>
            <button class="map-ctrl-btn" title="Center on Active Child" onclick="window.locateChild(store.get().selectedChildId)">
              🎯
            </button>
            <button class="map-ctrl-btn" title="Driving Directions from Guardian" onclick="window.navigateToChild(store.get().selectedChildId)">
              🧭
            </button>
            <button class="map-ctrl-btn" title="Fit All Family on Map" onclick="window.fitAllMapBounds()">
              📐
            </button>
            <button class="map-ctrl-btn" title="Add Geofence Here" onclick="window.openAddZoneModal()">
              ➕
            </button>
          </div>

          <!-- Bottom Sheet Details -->
          <div id="map-bottom-sheet" class="map-bottom-sheet"></div>
        </div>
      </div>
      <div id="tab-alerts" class="parent-tab-screen"></div>
      <div id="tab-zones" class="parent-tab-screen"></div>
      <div id="tab-children" class="parent-tab-screen"></div>
      <div id="tab-settings" class="parent-tab-screen"></div>
    `;

    this.isMounted = true;
    this.render();

    store.subscribe(() => {
      this.render();
    });
  }

  render() {
    if (!this.container || !this.isMounted) return;
    const state = store.get();
    const activeTab = state.activeParentTab || 'home';

    // 1. Home Tab
    const homeTab = document.getElementById('tab-home');
    if (homeTab) {
      homeTab.innerHTML = this.renderHomeContent(state);
    }

    // 2. Map Tab Overlays
    const childPills = document.getElementById('map-child-pills');
    if (childPills) {
      childPills.innerHTML = state.children.map(c => `
        <button class="map-pill-btn ${c.id === state.selectedChildId ? 'active' : ''}" onclick="window.selectChildMap('${c.id}')">
          <img src="${c.avatar}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;" />
          <span>${c.name}</span>
        </button>
      `).join('');
    }

    const bottomSheet = document.getElementById('map-bottom-sheet');
    const activeChild = store.getChild(state.selectedChildId);
    if (bottomSheet && activeChild) {
      bottomSheet.innerHTML = `
        <div class="sheet-drag-handle"></div>
        <div class="sheet-details">
          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <img src="${activeChild.avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #2563eb;" />
            <div>
              <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-main);">
                ${activeChild.name} • ${activeChild.safetyStatus === 'safe' ? '🟢 Safe' : activeChild.safetyStatus === 'attention' ? '🟡 Attention' : activeChild.safetyStatus === 'danger' ? '🔴 Danger' : '⚪ Offline'}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 1px;">
                ${activeChild.statusReason}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-subtle); margin-top: 2px;">
                🔋 ${activeChild.battery}% &bull; 📶 ${activeChild.signal} &bull; ${activeChild.gpsAccuracy}
              </div>
            </div>
          </div>
          <button class="btn btn-primary" style="font-size: 0.78rem; padding: 0.5rem 1rem;" onclick="window.navigateToChild('${activeChild.id}')">
            🧭 Directions
          </button>
        </div>
      `;
    }

    // 3. Alerts Tab
    const alertsTab = document.getElementById('tab-alerts');
    if (alertsTab) {
      alertsTab.innerHTML = this.renderAlertsContent(state);
    }

    // 4. Safe Zones Tab
    const zonesTab = document.getElementById('tab-zones');
    if (zonesTab) {
      zonesTab.innerHTML = this.renderSafeZonesContent(state);
    }

    // 5. Children Tab
    const childrenTab = document.getElementById('tab-children');
    if (childrenTab) {
      childrenTab.innerHTML = this.renderChildrenContent(state);
    }

    // 6. Settings Tab
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab) {
      settingsTab.innerHTML = this.renderSettingsContent(state);
    }

    // 7. Toggle Active Tab visibility
    const tabs = ['home', 'map', 'alerts', 'zones', 'children', 'settings'];
    tabs.forEach(tab => {
      const el = document.getElementById(`tab-${tab}`);
      if (el) {
        if (tab === activeTab) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });

    // 8. Handle map activation and updates
    if (activeTab === 'map') {
      mapCtrl.onTabActivated();
    }
    if (mapCtrl.map) {
      mapCtrl.renderChildrenMarkers();
      mapCtrl.renderSafeZones();
      mapCtrl.renderSelectedChildRoute();
      mapCtrl.renderLiveUserMarker();
    }
  }

  /* -------------------------------------------------------------
     HOME TAB CONTENT
     ------------------------------------------------------------- */
  renderHomeContent(state) {
    const children = state.children;
    const safeCount = children.filter(c => c.safetyStatus === 'safe').length;
    const attentionCount = children.filter(c => c.safetyStatus === 'attention').length;
    const dangerCount = children.filter(c => c.safetyStatus === 'danger').length;

    let overallStatus = 'normal';
    let overallBadgeText = '🟢 All Normal';
    if (dangerCount > 0) {
      overallStatus = 'danger';
      overallBadgeText = `🔴 ${dangerCount} Emergency Active`;
    } else if (attentionCount > 0) {
      overallStatus = 'attention';
      overallBadgeText = `🟡 ${attentionCount} Attention Needed`;
    }

    const recentAlerts = (state.alerts || []).filter(a => !a.isDismissed).slice(0, 4);

    if (state.auth && !state.auth.isAuthenticated) {
      return `
        <div class="auth-locked-card">
          <div class="google-auth-icon-circle">
            <span class="google-icon-svg">G</span>
          </div>
          <h2>Sign in with Gmail</h2>
          <p>Please log in with your Gmail account to monitor Aarav, Anaya, and Kabir's live safety telemetry in Jammu.</p>
          <button class="btn btn-primary btn-gmail-login-main" onclick="window.openGmailLoginModal()">
            <span class="gmail-btn-g">G</span>
            <span>Sign in with Google</span>
          </button>
          <div style="font-size: 0.72rem; color: var(--text-subtle); margin-top: 1rem;">
            Demo Guardian: <strong>vansh.koul@gmail.com</strong>
          </div>
        </div>
      `;
    }

    return `
      <div class="greeting-header">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div class="greeting-title">
            <img src="${state.parent.avatar}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); background: #1e3a8a; flex-shrink: 0;" />
            <div>
              <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                <span style="font-weight: 800; font-size: 1.15rem;">Namaste, ${state.parent.name.split(' ')[0]} 👋</span>
                <span class="guardian-role-badge">Father &bull; Primary Guardian</span>
              </div>
              <div class="greeting-subtitle">Jammu, J&K &bull; Logged in as: <strong>${state.auth ? state.auth.email : state.parent.email}</strong></div>
            </div>
          </div>
          <button class="gmail-pill-account-btn" onclick="window.openGmailLoginModal()" title="Gmail Account Details">
            <span class="gmail-g-tag">G</span>
            <span class="gmail-switch-label">Switch</span>
          </button>
        </div>
      </div>

      <!-- Live GPS Banner -->
      <div class="live-gps-banner ${state.userLiveLocation ? 'active' : ''}">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <span style="font-size: 1.35rem;">📍</span>
          <div>
            <div style="font-size: 0.82rem; font-weight: 800; color: var(--text-main);">
              ${state.userLiveLocation ? `Live Device GPS Active (±${state.userLiveLocation.accuracy}m)` : 'Real Device GPS Available'}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">
              ${state.userLiveLocation ? `${state.userLiveLocation.lat.toFixed(4)}° N, ${state.userLiveLocation.lng.toFixed(4)}° E • Hardware Synced` : 'Click to detect your current physical location and view it on the map'}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" style="font-size: 0.74rem; padding: 0.4rem 0.8rem; white-space: nowrap;" onclick="window.useMyCurrentLocation()">
          ${state.userLiveLocation ? '🔄 Refresh GPS' : '📍 Use My Location'}
        </button>
      </div>

      <!-- Family Safety Summary Box -->
      <div class="family-safety-summary">
        <div class="summary-headline">
          <span class="summary-title">Family Safety Status</span>
          <span class="summary-overall-badge ${overallStatus}">${overallBadgeText}</span>
        </div>
        <div class="summary-metrics-row">
          <div class="summary-stat-box">
            <span class="summary-stat-count safe">🟢 ${safeCount}</span>
            <span class="summary-stat-label">Children Safe</span>
          </div>
          <div class="summary-stat-box">
            <span class="summary-stat-count attention">🟡 ${attentionCount}</span>
            <span class="summary-stat-label">Attention</span>
          </div>
          <div class="summary-stat-box">
            <span class="summary-stat-count danger">🔴 ${dangerCount}</span>
            <span class="summary-stat-label">Emergencies</span>
          </div>
        </div>
      </div>

      <!-- Connected Children Cards -->
      <div class="section-header">
        <h2 class="section-title"><span>Connected Children</span></h2>
        <button class="section-action" onclick="window.switchTab('children')">+ Manage Devices</button>
      </div>

      <div class="children-card-list">
        ${children.map(child => this._renderChildCard(child, state)).join('')}
      </div>

      <!-- Recent Explainable Events Feed -->
      <div class="section-header">
        <h2 class="section-title"><span>Recent Safety Events</span></h2>
        <button class="section-action" onclick="window.switchTab('alerts')">View Alert Center</button>
      </div>

      <div class="recent-events-card">
        ${recentAlerts.length === 0 ? `
          <div style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">
            ✨ No active safety alerts right now.
          </div>
        ` : recentAlerts.map(alert => `
          <div class="event-feed-item">
            <div class="event-severity-dot ${alert.type}"></div>
            <div class="event-feed-info">
              <div class="event-feed-title">
                <span>${alert.title}</span>
                <span class="event-feed-time">${this._timeAgo(alert.timestamp)}</span>
              </div>
              <div class="event-feed-desc">${alert.what}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderChildCard(child, state) {
    let statusClass = 'safe';
    let statusBadgeText = '🟢 Safe';
    if (child.safetyStatus === 'attention') {
      statusClass = 'attention';
      statusBadgeText = '🟡 Attention';
    } else if (child.safetyStatus === 'danger') {
      statusClass = 'danger';
      statusBadgeText = '🔴 Danger';
    } else if (child.safetyStatus === 'unknown') {
      statusClass = 'unknown';
      statusBadgeText = '⚪ Offline';
    }

    let batteryClass = 'battery-good';
    if (child.battery <= 20) batteryClass = 'battery-low';
    else if (child.battery <= 50) batteryClass = 'battery-mid';

    const zone = state.safeZones.find(z => z.id === child.currentZoneId);
    const locationName = zone ? zone.name : 'Outside Safe Zones';
    const zoneIcon = zone ? zone.icon : '📍';

    return `
      <div class="child-card border-${statusClass}">
        <div class="child-card-top">
          <div class="child-identity">
            <div class="child-avatar-wrap">
              <div class="status-pulse-ring ${statusClass}"></div>
              <img src="${child.avatar}" alt="${child.name}" class="child-avatar" />
            </div>
            <div class="child-name-group">
              <h3>
                <span>${child.name}</span>
                <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">(${child.age} yrs)</span>
              </h3>
              <div class="child-meta-text">${child.grade}</div>
              <div style="font-size: 0.7rem; color: var(--text-subtle);">${child.device} &bull; ${child.carrier}</div>
            </div>
          </div>
          <span class="status-pill ${statusClass}">${statusBadgeText}</span>
        </div>

        <!-- Location Context Banner -->
        <div class="child-location-banner">
          <div class="location-desc-group">
            <div class="location-icon-bubble">${zoneIcon}</div>
            <div>
              <div class="location-text-primary">${locationName}</div>
              <div class="location-text-secondary">${child.statusReason}</div>
            </div>
          </div>
          <div class="location-update-time">${this._timeAgo(child.lastUpdated)}</div>
        </div>

        <!-- Telemetry Chips -->
        <div class="child-telemetry-row">
          <span class="telemetry-chip ${batteryClass}" title="${child.batteryDetail || ''}">
            🔋 ${child.battery}%
          </span>
          <span class="telemetry-chip">
            📶 ${child.signal}
          </span>
          <span class="telemetry-chip">
            🛰️ ${child.gpsAccuracy}
          </span>
          <span class="telemetry-chip">
            🏃 ${child.activity}
          </span>
        </div>

        <!-- Card Quick Action Buttons -->
        <div class="child-card-actions">
          <button class="card-action-btn locate-btn" onclick="window.locateChild('${child.id}')">
            🎯 Google Maps
          </button>
          <button class="card-action-btn" onclick="window.showChildRoute('${child.id}')">
            📍 Route History
          </button>
          <button class="card-action-btn" onclick="window.callChildPhone('${child.name}')">
            📞 Call (${child.phone})
          </button>
        </div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     ALERTS TAB CONTENT
     ------------------------------------------------------------- */
  renderAlertsContent(state) {
    let alerts = state.alerts.filter(a => !a.isDismissed);
    if (this.activeFilter === 'critical') alerts = alerts.filter(a => a.type === 'critical');
    if (this.activeFilter === 'warning') alerts = alerts.filter(a => a.type === 'warning');
    if (this.activeFilter === 'info') alerts = alerts.filter(a => a.type === 'info');

    return `
      <div class="alerts-tab-header">
        <h2 class="greeting-title"><span>Safety Alert Center</span></h2>
        <div class="greeting-subtitle">Explainable signals, verified evidence, and recommended emergency steps.</div>

        <!-- Filter Chips -->
        <div class="filter-chips-row">
          <button class="filter-chip ${this.activeFilter === 'all' ? 'active' : ''}" onclick="window.setAlertFilter('all')">
            All (${state.alerts.filter(a => !a.isDismissed).length})
          </button>
          <button class="filter-chip ${this.activeFilter === 'critical' ? 'active' : ''}" onclick="window.setAlertFilter('critical')">
            🔴 Critical (${state.alerts.filter(a => !a.isDismissed && a.type === 'critical').length})
          </button>
          <button class="filter-chip ${this.activeFilter === 'warning' ? 'active' : ''}" onclick="window.setAlertFilter('warning')">
            🟡 Warning (${state.alerts.filter(a => !a.isDismissed && a.type === 'warning').length})
          </button>
          <button class="filter-chip ${this.activeFilter === 'info' ? 'active' : ''}" onclick="window.setAlertFilter('info')">
            🔵 Info (${state.alerts.filter(a => !a.isDismissed && a.type === 'info').length})
          </button>
        </div>
      </div>

      <div class="alerts-timeline-feed">
        ${alerts.length === 0 ? `
          <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-xl); border: 1px solid var(--border-light);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛡️</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-main);">No alerts found</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">All children are operating within verified safety parameters.</div>
          </div>
        ` : alerts.map(alert => `
          <div class="alert-item-card ${alert.type}">
            <div class="alert-top-meta">
              <span class="alert-type-pill ${alert.type}">${alert.type}</span>
              <span class="alert-timestamp">${this._timeAgo(alert.timestamp)} &bull; ${new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div class="alert-title-main">
              <span>${alert.title}</span>
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">— ${alert.childName}</span>
            </div>

            <!-- Explainable 4-part architecture box -->
            <div class="explainable-box">
              <div class="explain-row">
                <span class="explain-label">Event:</span>
                <span class="explain-value">${alert.what}</span>
              </div>
              <div class="explain-row">
                <span class="explain-label">Evidence:</span>
                <span class="explain-value">${alert.evidence}</span>
              </div>
              <div class="explain-row">
                <span class="explain-label">Severity:</span>
                <span class="explain-value">${alert.severity}</span>
              </div>
              <div class="explain-row">
                <span class="explain-label">Action:</span>
                <span class="explain-value" style="font-weight: 700; color: #2563eb;">${alert.recommendedAction}</span>
              </div>
            </div>

            <div class="alert-actions-bar">
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem;" onclick="window.locateChild('${alert.childId}')">
                📍 View on Google Map
              </button>
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem;" onclick="window.callChildPhone('${alert.childName}')">
                📞 Call
              </button>
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.35rem 0.75rem;" onclick="window.dismissAlert('${alert.id}')">
                Dismiss
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* -------------------------------------------------------------
     SAFE ZONES TAB CONTENT
     ------------------------------------------------------------- */
  renderSafeZonesContent(state) {
    const zones = state.safeZones;
    return `
      <div class="safe-zones-header">
        <div>
          <h2 class="greeting-title"><span>Safe Zones & Geofences</span></h2>
          <div class="greeting-subtitle">Trusted San Francisco perimeter safe zones and hazard boundaries.</div>
        </div>
        <button class="btn btn-primary" onclick="window.openAddZoneModal()">
          ➕ Add Zone
        </button>
      </div>

      <div class="safe-zones-list">
        ${zones.map(zone => `
          <div class="safe-zone-card">
            <div class="zone-identity">
              <div class="zone-icon-box ${zone.isRestricted ? 'restricted' : ''}">
                <span>${zone.icon}</span>
              </div>
              <div class="zone-details">
                <h4>${zone.name}</h4>
                <p>${zone.address}</p>
                <div>
                  <span class="zone-badge-radius">Radius: ${zone.radius}m (${Math.round(zone.radius * 3.28)} ft)</span>
                  <span class="zone-badge-radius" style="margin-left: 4px;">${zone.activeSchedule}</span>
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 0.4rem;">
              <button class="icon-btn" title="View on Google Map" onclick="window.focusZoneOnMap('${zone.id}')">
                📍
              </button>
              <button class="icon-btn" title="Delete Zone" onclick="window.deleteZoneConfirm('${zone.id}')" style="color: #ef4444;">
                🗑️
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* -------------------------------------------------------------
     CHILDREN TAB CONTENT
     ------------------------------------------------------------- */
  renderChildrenContent(state) {
    const children = state.children;
    return `
      <div class="section-header">
        <div>
          <h2 class="greeting-title"><span>Family Profiles & Devices</span></h2>
          <div class="greeting-subtitle">Verified Apple & Android hardware telemetry & secure pairing.</div>
        </div>
        <button class="btn btn-primary" onclick="window.openPairingModal()">
          📲 Pair Device
        </button>
      </div>

      <div class="children-profiles-container">
        ${children.map(child => `
          <div class="child-profile-card">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 0.85rem;">
                <img src="${child.avatar}" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2.5px solid ${child.color};" />
                <div>
                  <h3 style="font-size: 1.05rem; font-weight: 800;">${child.name}</h3>
                  <div style="font-size: 0.76rem; color: var(--text-muted);">${child.grade}</div>
                  <div style="font-size: 0.72rem; color: var(--text-subtle);">${child.device} &bull; ${child.phone}</div>
                </div>
              </div>
              <button class="btn btn-secondary" style="font-size: 0.74rem; padding: 0.35rem 0.7rem;" onclick="window.openChildHistoryModal('${child.id}')">
                📜 Timeline
              </button>
            </div>

            <div class="profile-stats-grid">
              <div class="profile-stat-tile">
                <span>Battery & Health</span>
                <strong>${child.battery}% (${child.batteryDetail || 'Normal'})</strong>
              </div>
              <div class="profile-stat-tile">
                <span>GNSS Position Fix</span>
                <strong>${child.gpsAccuracy}</strong>
              </div>
              <div class="profile-stat-tile">
                <span>Cellular Carrier</span>
                <strong>${child.carrier}</strong>
              </div>
              <div class="profile-stat-tile">
                <span>Security Pairing PIN</span>
                <strong style="font-family: monospace; letter-spacing: 0.1em; color: var(--primary);">${child.pairingCode}</strong>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* -------------------------------------------------------------
     SETTINGS TAB CONTENT
     ------------------------------------------------------------- */
  renderSettingsContent(state) {
    const settings = state.settings;
    return `
      <div class="greeting-header">
        <h2 class="greeting-title"><span>Settings & Privacy</span></h2>
        <div class="greeting-subtitle">Transparency, notification routing, and data ownership.</div>
      </div>

      <!-- Privacy Transparency Commitment Card -->
      <div class="settings-group" style="border-left: 4px solid #10b981; background: linear-gradient(180deg, var(--bg-surface) 0%, rgba(16, 185, 129, 0.04) 100%);">
        <div class="settings-group-title">
          <span>🛡️ Anti-Surveillance & Privacy Guarantee</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 0.5rem;">
          SafeHaven is built on mutual family trust. We <strong>never</strong> implement covert listening, secret background camera recording, keystroke logging, or hidden tracking.
          Children are always visually notified when their location is shared with guardians.
        </p>
        <div style="font-size: 0.75rem; color: #047857; font-weight: 700;">
          ✓ End-to-end encrypted signals &bull; Explicit consent framework &bull; Zero advertising data brokerage
        </div>
      </div>

      <!-- Notification Preferences -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>🔔 Notification Preferences</span>
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Critical Emergency SOS Alerts</h5>
            <p>Instant siren and override alerts when child presses SOS</p>
          </div>
          <input type="checkbox" class="switch-input" checked disabled title="Always forced ON for safety" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Safe Zone Entry & Departure</h5>
            <p>Alert when child enters or leaves Galileo Academy, Home, or Moscone Center</p>
          </div>
          <input type="checkbox" class="switch-input" ${settings.notifications.safeZoneAlerts ? 'checked' : ''} onchange="window.toggleNotificationSetting('safeZoneAlerts')" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Low Battery Warnings</h5>
            <p>Alert when device battery drops below 15%</p>
          </div>
          <input type="checkbox" class="switch-input" ${settings.notifications.batteryAlerts ? 'checked' : ''} onchange="window.toggleNotificationSetting('batteryAlerts')" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Location Unavailable / Stale GPS Alerts</h5>
            <p>Notify if location updates cease for >10 minutes (e.g. BART transit)</p>
          </div>
          <input type="checkbox" class="switch-input" ${settings.notifications.locationUnavailable ? 'checked' : ''} onchange="window.toggleNotificationSetting('locationUnavailable')" />
        </div>
      </div>

      <!-- Location Data Retention & Privacy -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>🗄️ Location History Retention</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <div class="setting-info">
            <h5>Retention Window</h5>
            <p>Automatically purge location logs older than this duration</p>
          </div>
          <select style="font-size: 0.82rem;" onchange="window.updateRetentionPolicy(this.value)">
            <option value="7" ${settings.privacy.historyRetentionDays === 7 ? 'selected' : ''}>7 Days</option>
            <option value="30" ${settings.privacy.historyRetentionDays === 30 ? 'selected' : ''}>30 Days (Recommended)</option>
            <option value="90" ${settings.privacy.historyRetentionDays === 90 ? 'selected' : ''}>90 Days</option>
            <option value="0" ${settings.privacy.historyRetentionDays === 0 ? 'selected' : ''}>Do Not Store</option>
          </select>
        </div>
        <div style="display: flex; gap: 0.6rem;">
          <button class="btn btn-secondary" style="flex: 1;" onclick="window.exportDataJSON()">
            📥 Export Data (JSON)
          </button>
          <button class="btn btn-danger" style="flex: 1;" onclick="window.purgeLocationHistory()">
            🗑️ Delete All History
          </button>
        </div>
      </div>

      <!-- Emergency Contacts Hierarchy -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>🚨 Emergency Contacts Hierarchy</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${settings.emergencyContacts.map(contact => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light);">
              <div>
                <div style="font-size: 0.85rem; font-weight: 700;">${contact.name}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${contact.phone} &bull; ${contact.relation}</div>
              </div>
              <span class="badge-pill" style="background: ${contact.notifySOS ? 'var(--danger-bg)' : 'var(--bg-subtle)'}; color: ${contact.notifySOS ? 'var(--danger)' : 'var(--text-muted)'};">
                ${contact.notifySOS ? 'SOS Notify' : 'Secondary'}
              </span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Gmail Account & Security Group -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>📧 Guardian Account & Authentication</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem; background: var(--bg-subtle); border-radius: var(--radius-md); margin-bottom: 0.75rem; border: 1px solid var(--border-light);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-sm); font-weight: 900; color: #ea4335; font-size: 1.2rem; border: 1px solid #e2e8f0;">
              G
            </div>
            <div>
              <div style="font-size: 0.9rem; font-weight: 800;">${state.auth ? state.auth.name : state.parent.name} (Father)</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${state.auth ? state.auth.email : state.parent.email}</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.openGmailLoginModal()">
            Switch ID
          </button>
        </div>
        <div style="display: flex; gap: 0.6rem;">
          <button class="btn btn-secondary" style="flex: 1;" onclick="window.openGmailLoginModal()">
            ⚙️ Manage Gmail Auth
          </button>
          <button class="btn btn-secondary" style="flex: 1; color: #dc2626; border-color: rgba(220, 38, 38, 0.3);" onclick="window.logoutCurrentGmail()">
            🚪 Sign Out
          </button>
        </div>
      </div>

      <!-- Security Audit Log -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>📋 Account Security Audit Log</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.45rem;">
          ${settings.auditLog.slice(0, 5).map(log => `
            <div style="font-size: 0.75rem; padding: 0.35rem 0; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between;">
              <div>
                <strong style="color: var(--text-main);">${log.action}:</strong>
                <span style="color: var(--text-muted);">${log.details}</span>
              </div>
              <span style="color: var(--text-subtle); white-space: nowrap; margin-left: 8px;">${this._timeAgo(log.timestamp)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}

export const parentUI = new ParentUI();
