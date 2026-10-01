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

          <!-- Route Deviation Indicator Banner (Top of Map) -->
          <div id="map-route-deviation-banner" style="display: none;"></div>

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

    // Route deviation indicator banner on map
    const routeDevBanner = document.getElementById('map-route-deviation-banner');
    const deviatingChild = state.children.find(c => c.safetyStatus === 'attention' || c.safetyStatus === 'danger');
    if (routeDevBanner) {
      if (deviatingChild) {
        routeDevBanner.style.display = 'flex';
        routeDevBanner.className = 'map-route-deviation-banner';
        routeDevBanner.innerHTML = `
          <span class="deviation-icon">⚠️</span>
          <div class="deviation-text">
            <div class="deviation-title">Route Deviation: ${deviatingChild.name}</div>
            <div class="deviation-desc">${deviatingChild.statusReason}</div>
          </div>
          <button class="btn-deviation-focus" onclick="window.locateChild('${deviatingChild.id}')">Focus</button>
        `;
      } else {
        routeDevBanner.style.display = 'none';
      }
    }

    const bottomSheet = document.getElementById('map-bottom-sheet');
    const activeChild = store.getChild(state.selectedChildId);
    if (bottomSheet && activeChild) {
      const zone = state.safeZones.find(z => z.id === activeChild.currentZoneId);
      const locText = zone ? `Inside ${zone.name}` : (activeChild.activity || 'Outside Safe Zones');
      bottomSheet.innerHTML = `
        <div class="sheet-drag-handle"></div>
        <div class="sheet-details">
          <div style="display: flex; gap: 0.75rem; align-items: center;">
            <img src="${activeChild.avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #2563eb;" />
            <div>
              <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-main);">
                ${activeChild.name} &bull; ${activeChild.safetyStatus === 'safe' ? '🟢 Safe' : activeChild.safetyStatus === 'attention' ? '🟡 Attention' : activeChild.safetyStatus === 'danger' ? '🔴 Emergency' : '⚪ Unknown'}
              </div>
              <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 1px;">
                ${locText} &bull; 📍 Updated ${this._timeAgo(activeChild.lastUpdated)}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-subtle); margin-top: 2px;">
                🔋 ${activeChild.battery}% &bull; 📶 ${activeChild.signal} &bull; ${activeChild.gpsAccuracy}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-primary" style="font-size: 0.78rem; padding: 0.5rem 0.9rem;" onclick="window.navigateToChild('${activeChild.id}')" title="Directions from Guardian">
              🧭 Navigate to Child
            </button>
            <button class="btn btn-secondary" style="font-size: 0.78rem; padding: 0.5rem 0.75rem;" onclick="window.callChildPhone('${activeChild.name}')" title="Call child">
              📞 Call
            </button>
          </div>
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
    const unknownCount = children.filter(c => c.safetyStatus === 'unknown').length;

    // Dynamic greeting based on time of day
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const guardianName = (state.parent.name || 'Vansh').split(' ')[0];

    // Priority Attention / Urgent item check
    const activeAttentionAlert = (state.alerts || []).find(a => !a.isDismissed && (a.type === 'critical' || a.type === 'warning'));
    const attentionChild = children.find(c => c.safetyStatus === 'danger' || c.safetyStatus === 'attention');

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
      <!-- 1. Apple Health Style Greeting & Subtitle -->
      <div class="home-health-header">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 class="home-health-greeting">${timeGreeting} 👋</h1>
            <p class="home-health-subtitle">Here's your family's safety</p>
          </div>
          <button class="gmail-pill-account-btn" onclick="window.openGmailLoginModal()" title="Gmail Guardian Account">
            <span class="gmail-g-tag">G</span>
            <span class="gmail-switch-label">${guardianName}</span>
          </button>
        </div>

        <!-- Family Safety Summary Pills (Fintech Dashboard Badges) -->
        <div class="safety-summary-pills-row">
          <div class="safety-summary-pill safe" onclick="window.switchTab('children')" title="View safe children">
            <span>🟢</span>
            <span>${safeCount} Safe</span>
          </div>
          <div class="safety-summary-pill attention" onclick="window.switchTab('alerts')" title="View attention alerts">
            <span>🟡</span>
            <span>${attentionCount} Attention</span>
          </div>
          ${dangerCount > 0 ? `
            <div class="safety-summary-pill danger" onclick="window.switchTab('alerts')" title="Emergency alerts active">
              <span>🔴</span>
              <span>${dangerCount} Emergency</span>
            </div>
          ` : ''}
          ${unknownCount > 0 ? `
            <div class="safety-summary-pill unknown" onclick="window.switchTab('children')" title="Offline devices">
              <span>⚪</span>
              <span>${unknownCount} Offline</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 2. Most Important Screen: Does anything need my attention? -->
      ${(activeAttentionAlert || attentionChild) ? `
        <div class="urgent-attention-card ${dangerCount > 0 ? 'danger' : 'attention'}">
          <div class="urgent-badge-row">
            <span class="urgent-tag">${dangerCount > 0 ? '🔴 Emergency' : '⚠️ Attention'}</span>
            <span class="urgent-time">${this._timeAgo(activeAttentionAlert ? activeAttentionAlert.timestamp : (attentionChild ? attentionChild.lastUpdated : Date.now()))}</span>
          </div>
          <div class="urgent-message">
            ${activeAttentionAlert ? activeAttentionAlert.title : `${attentionChild.name} requires your attention`}
          </div>
          <div class="urgent-subtext">
            ${activeAttentionAlert ? activeAttentionAlert.what : attentionChild.statusReason}
          </div>
          <div class="urgent-card-actions">
            <button class="btn btn-urgent-primary" onclick="window.switchTab('alerts')">View Alert</button>
            <button class="btn btn-urgent-secondary" onclick="window.locateChild('${(activeAttentionAlert && activeAttentionAlert.childId) || (attentionChild && attentionChild.id) || 'c1'}')">View on Map</button>
            <button class="btn btn-urgent-secondary" onclick="window.callChildPhone('${(activeAttentionAlert && activeAttentionAlert.childName) || (attentionChild && attentionChild.name) || 'Aarav'}')">Call</button>
          </div>
        </div>
      ` : `
        <div class="all-clear-banner">
          <span class="all-clear-icon">✨</span>
          <div>
            <div class="all-clear-title">All Children Are Safe</div>
            <div class="all-clear-desc">Every family member is inside verified safe zones with strong battery.</div>
          </div>
        </div>
      `}

      <!-- 3. Soft Rounded Child Cards -->
      <div class="children-card-list">
        ${children.map(child => this._renderChildCard(child, state)).join('')}
      </div>

      <!-- 4. Quick Live Hardware GPS Banner -->
      <div class="live-gps-banner ${state.userLiveLocation ? 'active' : ''}" style="margin-top: 0.5rem;">
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
      statusBadgeText = '🔴 Emergency';
    } else if (child.safetyStatus === 'unknown') {
      statusClass = 'unknown';
      statusBadgeText = '⚪ Offline';
    }

    const zone = state.safeZones.find(z => z.id === child.currentZoneId);
    const locationCategory = zone ? (zone.type === 'school' ? '🏫 At School' : zone.type === 'home' ? '🏠 At Home' : '🛡️ In Safe Zone') : '📍 Outside Safe Zone';
    const locationName = zone ? zone.name : (child.activity || 'Outside Safe Zones');
    const childGenderIcon = child.gender === 'F' ? '👧' : '👦';

    return `
      <div class="child-card-clean border-${statusClass}">
        <!-- Top: Name + Avatar + Status Badge -->
        <div class="child-card-header">
          <div class="child-card-title-group">
            <div class="child-avatar-wrap">
              <div class="status-pulse-ring ${statusClass}"></div>
              <img src="${child.avatar}" alt="${child.name}" class="child-card-avatar" />
            </div>
            <div>
              <div class="child-card-name">${childGenderIcon} ${child.name}</div>
              <div class="child-card-grade">${child.grade}</div>
            </div>
          </div>
          <span class="status-pill ${statusClass}">${statusBadgeText}</span>
        </div>

        <!-- Middle: Where are they? -->
        <div class="child-location-hero">
          <div>
            <div class="child-location-main">${locationCategory} &bull; ${locationName}</div>
            <div class="child-location-detail">${child.statusReason}</div>
          </div>
        </div>

        <!-- Telemetry: Battery + Last Update -->
        <div class="child-telemetry-strip">
          <span title="${child.batteryDetail || ''}">🔋 ${child.battery}%</span>
          <span>&bull;</span>
          <span>📍 Updated ${this._timeAgo(child.lastUpdated)}</span>
          <span>&bull;</span>
          <span>📶 ${child.signal}</span>
          <span>&bull;</span>
          <span>🛰️ ${child.gpsAccuracy}</span>
        </div>

        <!-- Actions: [ View Map ] [ Call ] [ SOS / Alert ] -->
        <div class="child-card-btn-row">
          <button class="btn-card-action primary" onclick="window.locateChild('${child.id}')" title="View child on Google Maps">
            🗺️ View Map
          </button>
          <button class="btn-card-action" onclick="window.callChildPhone('${child.name}')" title="Call child's phone">
            📞 Call
          </button>
          <button class="btn-card-action" onclick="window.navigateToChild('${child.id}')" title="Driving directions from Guardian">
            🧭 Directions
          </button>
        </div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     ALERTS TAB CONTENT (3. Alerts: Emergency, Safe-zone, Route, Battery, Device)
     ------------------------------------------------------------- */
  renderAlertsContent(state) {
    let alerts = (state.alerts || []).filter(a => !a.isDismissed);
    if (this.activeFilter === 'emergency') {
      alerts = alerts.filter(a => a.type === 'critical' || a.title.toLowerCase().includes('emergency') || a.title.toLowerCase().includes('sos'));
    } else if (this.activeFilter === 'safezone') {
      alerts = alerts.filter(a => a.title.toLowerCase().includes('safe zone') || a.title.toLowerCase().includes('departure') || a.title.toLowerCase().includes('exit') || a.title.toLowerCase().includes('arrived'));
    } else if (this.activeFilter === 'route') {
      alerts = alerts.filter(a => a.title.toLowerCase().includes('route') || a.title.toLowerCase().includes('deviation') || a.what.toLowerCase().includes('route'));
    } else if (this.activeFilter === 'battery') {
      alerts = alerts.filter(a => a.title.toLowerCase().includes('battery') || a.what.toLowerCase().includes('battery'));
    } else if (this.activeFilter === 'device') {
      alerts = alerts.filter(a => a.title.toLowerCase().includes('gps') || a.title.toLowerCase().includes('signal') || a.title.toLowerCase().includes('offline') || a.what.toLowerCase().includes('signal'));
    }

    const totalCount = (state.alerts || []).filter(a => !a.isDismissed).length;
    const emergencyCount = (state.alerts || []).filter(a => !a.isDismissed && (a.type === 'critical' || a.title.toLowerCase().includes('sos'))).length;
    const safeZoneCount = (state.alerts || []).filter(a => !a.isDismissed && (a.title.toLowerCase().includes('safe zone') || a.title.toLowerCase().includes('departure'))).length;
    const routeCount = (state.alerts || []).filter(a => !a.isDismissed && (a.title.toLowerCase().includes('route') || a.what.toLowerCase().includes('route'))).length;
    const batteryCount = (state.alerts || []).filter(a => !a.isDismissed && a.what.toLowerCase().includes('battery')).length;

    return `
      <div class="alerts-tab-header">
        <h2 class="home-health-greeting" style="font-size: 1.6rem;">Safety Alerts 🔔</h2>
        <div class="home-health-subtitle">Real-time danger detection, geofence departures, and explainable safety AI.</div>

        <!-- Filter Chips: Emergency, Safe-zone exits, Route deviations, Low battery, Offline -->
        <div class="filter-chips-row">
          <button class="filter-chip ${this.activeFilter === 'all' ? 'active' : ''}" onclick="window.setAlertFilter('all')">
            All (${totalCount})
          </button>
          <button class="filter-chip ${this.activeFilter === 'emergency' ? 'active' : ''}" onclick="window.setAlertFilter('emergency')">
            🔴 Emergency (${emergencyCount})
          </button>
          <button class="filter-chip ${this.activeFilter === 'safezone' ? 'active' : ''}" onclick="window.setAlertFilter('safezone')">
            🟡 Safe-Zone Exits (${safeZoneCount})
          </button>
          <button class="filter-chip ${this.activeFilter === 'route' ? 'active' : ''}" onclick="window.setAlertFilter('route')">
            ⚠️ Route Deviations (${routeCount})
          </button>
          <button class="filter-chip ${this.activeFilter === 'battery' ? 'active' : ''}" onclick="window.setAlertFilter('battery')">
            🔋 Low Battery (${batteryCount})
          </button>
          <button class="filter-chip ${this.activeFilter === 'device' ? 'active' : ''}" onclick="window.setAlertFilter('device')">
            ⚪ Offline / Issues
          </button>
        </div>
      </div>

      <div class="alerts-timeline-feed">
        ${alerts.length === 0 ? `
          <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); background: var(--bg-surface); border-radius: 22px; border: 1px solid var(--border-light);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛡️</div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text-main);">No alerts found</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">All children are operating within verified safety parameters.</div>
          </div>
        ` : alerts.map(alert => `
          <div class="alert-item-card ${alert.type}">
            <div class="alert-top-meta">
              <span class="alert-type-pill ${alert.type}">${alert.type === 'critical' ? '🔴 Emergency' : alert.type === 'warning' ? '🟡 Attention' : '🔵 Notice'}</span>
              <span class="alert-timestamp">${this._timeAgo(alert.timestamp)} &bull; ${new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div class="alert-title-main">
              <span>${alert.title}</span>
              <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted);">— ${alert.childName}</span>
            </div>

            <!-- Requested "Why did I receive this?" Explanation Card -->
            <div class="why-received-card">
              <div class="why-received-header">
                <span>💡 Why did I receive this?</span>
              </div>
              <div class="why-row">
                <span class="why-label">Trigger Rule:</span>
                <span class="why-text">${alert.what}</span>
              </div>
              <div class="why-row">
                <span class="why-label">Sensor Telemetry:</span>
                <span class="why-text">${alert.evidence}</span>
              </div>
              <div class="why-row">
                <span class="why-label">Severity Level:</span>
                <span class="why-text">${alert.severity}</span>
              </div>
              <div class="why-row">
                <span class="why-label">Action Advice:</span>
                <span class="why-text" style="font-weight: 700; color: #2563eb;">${alert.recommendedAction}</span>
              </div>
            </div>

            <div class="alert-actions-bar">
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;" onclick="window.locateChild('${alert.childId}')">
                📍 View on Map
              </button>
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;" onclick="window.callChildPhone('${alert.childName}')">
                📞 Call
              </button>
              <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;" onclick="window.dismissAlert('${alert.id}')">
                Dismiss
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /* -------------------------------------------------------------
     SAFE ZONES TAB CONTENT (Grounded in Jammu, J&K)
     ------------------------------------------------------------- */
  renderSafeZonesContent(state) {
    const zones = state.safeZones;
    return `
      <div class="safe-zones-header">
        <div>
          <h2 class="home-health-greeting" style="font-size: 1.6rem;">Safe Zones & Geofences 🛡️</h2>
          <div class="home-health-subtitle">Trusted perimeter safe zones and hazard boundaries across Jammu.</div>
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
              <button class="icon-btn" title="View on Map" onclick="window.focusZoneOnMap('${zone.id}')">
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
     CHILDREN TAB CONTENT (4. Children: Profiles, Devices, Zones, Routes, Contacts)
     ------------------------------------------------------------- */
  renderChildrenContent(state) {
    const children = state.children;
    const zones = state.safeZones;
    const settings = state.settings;

    return `
      <div class="section-header" style="margin-bottom: 1.25rem;">
        <div>
          <h2 class="home-health-greeting" style="font-size: 1.6rem;">Children & Family 👨‍👩‍👧</h2>
          <div class="home-health-subtitle">Child profiles, device telemetry, safe zones, routes, and emergency contacts.</div>
        </div>
        <button class="btn btn-primary" onclick="window.openPairingModal()">
          📲 Pair Device
        </button>
      </div>

      <!-- Sub-section 1: Child Profiles & Device Status -->
      <div class="kids-section-card">
        <div class="kids-section-title">
          <span>👦 Child Profiles & Telemetry</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">${children.length} devices linked</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${children.map(child => `
            <div style="border: 1px solid var(--border-light); border-radius: 18px; padding: 1rem; background: var(--bg-surface);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <img src="${child.avatar}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2.5px solid ${child.color};" />
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 800;">${child.name} (${child.age} yrs)</h3>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">${child.grade}</div>
                  </div>
                </div>
                <span class="status-pill ${child.safetyStatus === 'safe' ? 'safe' : child.safetyStatus === 'attention' ? 'attention' : child.safetyStatus === 'danger' ? 'danger' : 'unknown'}">
                  ${child.safetyStatus === 'safe' ? '🟢 Safe' : child.safetyStatus === 'attention' ? '🟡 Attention' : child.safetyStatus === 'danger' ? '🔴 Emergency' : '⚪ Offline'}
                </span>
              </div>

              <!-- Device Status Grid -->
              <div class="profile-stats-grid">
                <div class="profile-stat-tile">
                  <span>Device Hardware</span>
                  <strong>${child.device}</strong>
                </div>
                <div class="profile-stat-tile">
                  <span>Battery Health</span>
                  <strong>🔋 ${child.battery}% (${child.batteryDetail || 'Normal'})</strong>
                </div>
                <div class="profile-stat-tile">
                  <span>Cellular Network</span>
                  <strong>📶 ${child.carrier} &bull; ${child.signal}</strong>
                </div>
                <div class="profile-stat-tile">
                  <span>GNSS Accuracy</span>
                  <strong>🛰️ ${child.gpsAccuracy}</strong>
                </div>
                <div class="profile-stat-tile">
                  <span>Operating System</span>
                  <strong>${child.os}</strong>
                </div>
                <div class="profile-stat-tile">
                  <span>Pairing PIN</span>
                  <strong style="font-family: monospace; letter-spacing: 0.1em; color: var(--primary);">${child.pairingCode}</strong>
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                <button class="btn btn-secondary" style="flex: 1; font-size: 0.76rem;" onclick="window.locateChild('${child.id}')">
                  🗺️ Locate on Map
                </button>
                <button class="btn btn-secondary" style="flex: 1; font-size: 0.76rem;" onclick="window.callChildPhone('${child.name}')">
                  📞 Call (${child.phone})
                </button>
                <button class="btn btn-secondary" style="flex: 1; font-size: 0.76rem;" onclick="window.openChildHistoryModal('${child.id}')">
                  📜 Timeline
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Sub-section 2: Safe Zones -->
      <div class="kids-section-card">
        <div class="kids-section-title">
          <span>🛡️ Safe Zones & Geofences</span>
          <button class="btn btn-primary btn-sm" onclick="window.openAddZoneModal()">➕ Add Zone</button>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          Geofenced boundaries in Jammu with automated entry and departure notifications.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
          ${zones.map(zone => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.9rem; border: 1px solid var(--border-light); border-radius: 14px; background: var(--bg-subtle);">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.4rem;">${zone.icon}</span>
                <div>
                  <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">${zone.name}</div>
                  <div style="font-size: 0.74rem; color: var(--text-muted);">${zone.address}</div>
                  <div style="font-size: 0.7rem; color: var(--text-subtle); margin-top: 2px;">
                    Radius: ${zone.radius}m &bull; ${zone.activeSchedule}
                  </div>
                </div>
              </div>
              <div style="display: flex; gap: 0.35rem;">
                <button class="icon-btn" title="View on Map" onclick="window.focusZoneOnMap('${zone.id}')">📍</button>
                <button class="icon-btn" title="Delete Zone" onclick="window.deleteZoneConfirm('${zone.id}')" style="color: #ef4444;">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Sub-section 3: Assigned Routes -->
      <div class="kids-section-card">
        <div class="kids-section-title">
          <span>🛣️ Assigned Routes & Corridors</span>
          <span style="font-size: 0.75rem; color: #10b981; font-weight: 700;">✓ Active AI Deviation Monitoring</span>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          Approved travel paths between home, schools, and tutoring in Jammu.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
          <div style="border: 1px solid var(--border-light); border-radius: 14px; padding: 0.85rem; background: var(--bg-subtle);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 0.88rem;">DPS Jammu School Bus Route (Aarav)</strong>
              <span class="badge-pill" style="background: var(--safe-bg); color: #047857;">Verified Corridor</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem;">
              Gandhi Nagar Sector 3 ➔ Bikram Chowk ➔ Tawi River Bridge ➔ Residency Road (DPS Gate)
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button class="btn btn-secondary btn-sm" onclick="window.showChildRoute('c1')">📍 Preview Route on Map</button>
            </div>
          </div>

          <div style="border: 1px solid var(--border-light); border-radius: 14px; padding: 0.85rem; background: var(--bg-subtle);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 0.88rem;">Presentation Convent Walking Route (Anaya)</strong>
              <span class="badge-pill" style="background: var(--attention-bg); color: #b45309;">Pedestrian Path</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.3rem;">
              Presentation Convent School ➔ Sector 2 Church Road ➔ Gole Market, Gandhi Nagar
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
              <button class="btn btn-secondary btn-sm" onclick="window.showChildRoute('c2')">📍 Preview Route on Map</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sub-section 4: Emergency Contacts -->
      <div class="kids-section-card">
        <div class="kids-section-title">
          <span>📞 Emergency Contacts Directory</span>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          Direct-dial helpline and trusted guardian contacts notified during emergency SOS.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${settings.emergencyContacts.map(contact => `
            <div class="emergency-contact-item">
              <div>
                <div style="font-size: 0.88rem; font-weight: 800; color: var(--text-main);">${contact.name}</div>
                <div style="font-size: 0.74rem; color: var(--text-muted);">${contact.phone} &bull; ${contact.relation}</div>
              </div>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                <span class="badge-pill" style="background: ${contact.notifySOS ? 'var(--danger-bg)' : 'var(--bg-subtle)'}; color: ${contact.notifySOS ? 'var(--danger)' : 'var(--text-muted)'}; font-size: 0.7rem;">
                  ${contact.notifySOS ? '🚨 SOS' : 'Secondary'}
                </span>
                <a href="tel:${contact.phone.replace(/\\s+/g, '')}" class="btn btn-secondary btn-sm" style="text-decoration: none; padding: 0.35rem 0.65rem;" title="Call">
                  📞
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* -------------------------------------------------------------
     SETTINGS TAB CONTENT (5. Settings: Sharing, History, Guardians, Notifications, Devices, Security)
     ------------------------------------------------------------- */
  renderSettingsContent(state) {
    const settings = state.settings;
    return `
      <div class="greeting-header">
        <h2 class="home-health-greeting" style="font-size: 1.6rem;">Settings & Privacy ⚙️</h2>
        <div class="home-health-subtitle">Location sharing, history retention, authorized guardians, and security controls.</div>
      </div>

      <!-- 1. Location Sharing -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>📍 Location Sharing Mode</span>
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Always On (Continuous 24/7 Live Tracking)</h5>
            <p>Real-time dual L1+L5 GNSS positioning with ±1.8m accuracy</p>
          </div>
          <input type="radio" name="loc-share-mode" checked title="Continuous Live Tracking active" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>While Moving (Power Saving Mode)</h5>
            <p>Pings only when child accelerometer detects walking or driving</p>
          </div>
          <input type="radio" name="loc-share-mode" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Emergency Only (Stealth Mode)</h5>
            <p>Shares location only when SOS button is triggered</p>
          </div>
          <input type="radio" name="loc-share-mode" />
        </div>
      </div>

      <!-- 2. Location History Retention -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>🗄️ Location History Retention</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <div class="setting-info">
            <h5>Retention Window</h5>
            <p>Automatically purge location logs older than selected duration</p>
          </div>
          <select style="font-size: 0.82rem;" onchange="window.updateRetentionPolicy(this.value)">
            <option value="1">24 Hours</option>
            <option value="7" ${settings.privacy.historyRetentionDays === 7 ? 'selected' : ''}>7 Days</option>
            <option value="30" ${settings.privacy.historyRetentionDays === 30 ? 'selected' : ''}>30 Days (Recommended)</option>
            <option value="0" ${settings.privacy.historyRetentionDays === 0 ? 'selected' : ''}>Do Not Retain</option>
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

      <!-- 3. Authorized Guardians -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>👨‍👩‍👧 Authorized Guardians</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; background: var(--bg-subtle); border-radius: 12px; border: 1px solid var(--border-light);">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <span style="font-size: 1.4rem;">👨</span>
              <div>
                <strong style="font-size: 0.88rem;">Vansh Koul (Father)</strong>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Primary Guardian &bull; vansh.koul@gmail.com</div>
              </div>
            </div>
            <span class="badge-pill" style="background: var(--safe-bg); color: #047857;">Primary</span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; background: var(--bg-subtle); border-radius: 12px; border: 1px solid var(--border-light);">
            <div style="display: flex; align-items: center; gap: 0.65rem;">
              <span style="font-size: 1.4rem;">👩</span>
              <div>
                <strong style="font-size: 0.88rem;">Sunita Koul (Mother)</strong>
                <div style="font-size: 0.72rem; color: var(--text-muted);">Secondary Guardian &bull; +91 98765 24811</div>
              </div>
            </div>
            <span class="badge-pill" style="background: var(--bg-surface); color: var(--text-muted);">Secondary</span>
          </div>
        </div>
        <button class="btn btn-secondary" style="width: 100%;" onclick="window.showToast('Guardian Added', 'Invitation link sent', 'safe')">
          ➕ Add Authorized Guardian
        </button>
      </div>

      <!-- 4. Notification Settings -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>🔔 Notification Preferences</span>
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Critical Emergency SOS Siren</h5>
            <p>Instant siren override when child presses SOS (Always forced ON)</p>
          </div>
          <input type="checkbox" class="switch-input" checked disabled title="Always forced ON for safety" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Safe Zone Entry & Departure</h5>
            <p>Alerts when child enters or departs DPS Jammu or Home</p>
          </div>
          <input type="checkbox" class="switch-input" ${settings.notifications.safeZoneAlerts ? 'checked' : ''} onchange="window.toggleNotificationSetting('safeZoneAlerts')" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Route Deviation Warnings</h5>
            <p>Notify if child deviates >150m from designated school corridor</p>
          </div>
          <input type="checkbox" class="switch-input" checked onchange="window.showToast('Route Alerts', 'Sensitivity set to 150m', 'info')" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Low Battery Warnings (< 20%)</h5>
            <p>Alert when phone battery drops below 20%</p>
          </div>
          <input type="checkbox" class="switch-input" ${settings.notifications.batteryAlerts ? 'checked' : ''} onchange="window.toggleNotificationSetting('batteryAlerts')" />
        </div>
        <div class="setting-toggle-row">
          <div class="setting-info">
            <h5>Offline & Disconnection Alerts</h5>
            <p>Alert if GPS signal ceases for >10 minutes</p>
          </div>
          <input type="checkbox" class="switch-input" ${settings.notifications.locationUnavailable ? 'checked' : ''} onchange="window.toggleNotificationSetting('locationUnavailable')" />
        </div>
      </div>

      <!-- 5. Connected Devices -->
      <div class="settings-group">
        <div class="settings-group-title">
          <span>📱 Connected Devices</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
          <div style="padding: 0.75rem; background: var(--bg-subtle); border-radius: 12px; border: 1px solid var(--border-light);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Aarav's iPhone 15 Pro (128GB, Natural Titanium)</strong>
              <span style="color: #10b981; font-size: 0.75rem; font-weight: 700;">● Connected</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
              iOS 18.2 &bull; Jio True 5G &bull; End-to-end encrypted &bull; PIN: 749201
            </div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-subtle); border-radius: 12px; border: 1px solid var(--border-light);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Anaya's Google Pixel 8a (Bay Blue)</strong>
              <span style="color: #10b981; font-size: 0.75rem; font-weight: 700;">● Connected</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
              Android 15 &bull; Airtel 5G Plus &bull; End-to-end encrypted &bull; PIN: 318942
            </div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-subtle); border-radius: 12px; border: 1px solid var(--border-light);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>Kabir's Galaxy S24 Ultra (Titanium Gray)</strong>
              <span style="color: #10b981; font-size: 0.75rem; font-weight: 700;">● Connected</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
              Android 15 / One UI 7.0 &bull; Jio 5G &bull; End-to-end encrypted &bull; PIN: 592184
            </div>
          </div>
        </div>
        <button class="btn btn-secondary" style="width: 100%; margin-top: 0.75rem;" onclick="window.openPairingModal()">
          ➕ Pair New Child Device
        </button>
      </div>

      <!-- 6. Security & Privacy Transparency -->
      <div class="settings-group" style="border-left: 4px solid #10b981; background: linear-gradient(180deg, var(--bg-surface) 0%, rgba(16, 185, 129, 0.04) 100%);">
        <div class="settings-group-title">
          <span>🛡️ Anti-Surveillance & Privacy Guarantee</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 0.5rem;">
          SafeHaven is built on family safety and mutual trust. We <strong>never</strong> implement covert listening, secret background camera recording, keystroke logging, or covert tracking.
          Children are always visually notified when their location is shared.
        </p>
        <div style="font-size: 0.75rem; color: #047857; font-weight: 700;">
          ✓ 256-bit AES encryption &bull; Explicit consent framework &bull; Zero advertising data broker sales
        </div>
      </div>
    `;
  }
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
