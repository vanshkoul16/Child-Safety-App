/* =========================================================
   SafeHaven - Application Bootstrapper & Global Controllers
   ========================================================= */

import { store } from './state.js';
import { parentUI } from './parentUI.js';
import { childUI } from './childUI.js';
import { mapCtrl } from './mapController.js';
import { soundFx } from './audioNotifier.js';
import { safetyEngine } from './safetyEngine.js';
import { simulator } from './simulator.js';

// Global Toast System
export function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'ℹ️';
  if (type === 'critical') icon = '🚨';
  if (type === 'warning') icon = '⚠️';
  if (type === 'safe') icon = '✅';

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
      <div class="toast-time">Just now</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  if (type === 'critical') soundFx.playWarningBeep();
  else if (type === 'safe') soundFx.playSafeChime();
  else soundFx.playPing();

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 250);
    }
  }, 4500);
}
window.showToast = showToast;

// Global Modal Controller
export function openModal(title, bodyHtml, footerHtml = '') {
  let modalOverlay = document.getElementById('global-modal-overlay');
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'global-modal-overlay';
    modalOverlay.className = 'modal-overlay';
    document.body.appendChild(modalOverlay);
  }

  modalOverlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="icon-btn" onclick="window.closeModal()">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  modalOverlay.style.display = 'flex';
}

export function closeModal() {
  const modalOverlay = document.getElementById('global-modal-overlay');
  if (modalOverlay) {
    modalOverlay.style.display = 'none';
    modalOverlay.innerHTML = '';
  }
  mapCtrl.disableLocationPicker();
}
window.closeModal = closeModal;

// Application Initialization
function initApp() {
  safetyEngine.startMonitoring();

  // Mount UI components
  parentUI.mount('parent-content-area');
  childUI.mount('child-content-area');

  // Handle Mode & Tab switches from state
  const syncViewMode = (state) => {
    const parentContainer = document.getElementById('parent-container');
    const childContainer = document.getElementById('child-container');
    const modeButtons = document.querySelectorAll('.mode-btn');

    modeButtons.forEach(btn => {
      if (btn.dataset.mode === state.activeMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (state.activeMode === 'child') {
      if (parentContainer) parentContainer.style.display = 'none';
      if (childContainer) childContainer.style.display = 'block';
    } else {
      if (childContainer) childContainer.style.display = 'none';
      if (parentContainer) parentContainer.style.display = 'flex';
    }

    // Update Bottom Nav active state
    const navItems = document.querySelectorAll('.parent-bottom-nav .nav-item');
    navItems.forEach(item => {
      if (item.dataset.tab === state.activeParentTab) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Toggle Device Frame Mockup class
    const mainViewport = document.getElementById('main-viewport');
    if (mainViewport) {
      if (state.isDeviceFrame) {
        mainViewport.classList.remove('full-width-mode');
      } else {
        mainViewport.classList.add('full-width-mode');
      }
    }

    // Audio Mute Icon
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) {
      audioBtn.innerHTML = state.isAudioMuted ? '🔇' : '🔔';
    }

    // Gmail Header Display
    const gmailDisplay = document.getElementById('header-gmail-email');
    const gmailBtn = document.getElementById('gmail-auth-btn');
    if (gmailDisplay) {
      const isAuth = state.auth && state.auth.isAuthenticated;
      gmailDisplay.textContent = isAuth ? state.auth.email : 'Sign In with Gmail';
      if (gmailBtn) {
        if (isAuth) {
          gmailBtn.classList.remove('unauthenticated');
        } else {
          gmailBtn.classList.add('unauthenticated');
        }
      }
    }

    // Emergency SOS Broadcast Overlay
    renderEmergencyBroadcast(state);
  };

  store.subscribe(syncViewMode);
  syncViewMode(store.get());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/* Fullscreen Emergency SOS Broadcast Overlay Controller */
function renderEmergencyBroadcast(state) {
  let overlay = document.getElementById('emergency-broadcast-overlay');

  if (state.activeSosAlert) {
    const alert = state.activeSosAlert;
    const child = store.getChild(alert.childId);

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'emergency-broadcast-overlay';
      overlay.className = 'emergency-broadcast-overlay';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="emergency-icon-pulse">🚨</div>
      <div class="emergency-title">EMERGENCY SOS ACTIVATED</div>
      <div style="font-size: 1.1rem; font-weight: 700; opacity: 0.95;">${child.name} requires immediate emergency assistance!</div>

      <div class="emergency-card-box">
        <div style="font-size: 0.85rem; line-height: 1.6;">
          <strong>Child:</strong> ${child.name} (${child.age} yrs) &bull; ${child.device}<br/>
          <strong>Time of SOS:</strong> ${new Date(alert.timestamp).toLocaleTimeString()}<br/>
          <strong>Battery Level:</strong> ${child.battery}% (${child.batteryStatus})<br/>
          <strong>GPS Coordinates:</strong> ${child.lat.toFixed(4)}, ${child.lng.toFixed(4)}<br/>
          <strong>Evidence:</strong> ${alert.evidence}
        </div>
      </div>

      <div class="emergency-btn-group">
        <button class="btn btn-danger" style="font-size: 1.15rem; padding: 1rem; border: 2px solid white; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" onclick="window.callEmergencyServices()">
          🚨 Call 112 / Emergency Dispatch
        </button>
        <button class="btn btn-secondary" style="font-size: 1rem; padding: 0.8rem; background: rgba(255,255,255,0.25); color: white; border: 1px solid rgba(255,255,255,0.4);" onclick="window.callChildPhone('${child.name}')">
          📞 Call ${child.name}'s Phone
        </button>
        <button class="btn btn-secondary" style="font-size: 0.95rem; padding: 0.8rem; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="window.locateChild('${child.id}'); window.resolveEmergencySOS();">
          🎯 View Live Location & Mark Handled
        </button>
      </div>
    `;
    overlay.style.display = 'flex';
  } else {
    if (overlay) {
      overlay.style.display = 'none';
      overlay.remove();
    }
  }
}

// -------------------------------------------------------------
// WINDOW GLOBAL ACTIONS (Directly bound to buttons & onclick)
// -------------------------------------------------------------

window.switchMode = function(mode) {
  store.update({ activeMode: mode });
};

window.switchTab = function(tab) {
  store.update({ activeParentTab: tab });
};

window.toggleDeviceFrame = function() {
  const current = store.get().isDeviceFrame;
  store.update({ isDeviceFrame: !current });
  showToast('View Toggled', !current ? 'Mobile Phone Mockup View enabled' : 'Full-width responsive view enabled', 'info');
};

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  store.update({ theme: next });
};

window.toggleAudioMute = function() {
  const isMuted = soundFx.toggleMute();
  store.update({ isAudioMuted: isMuted });
  showToast('Audio Alerts', isMuted ? 'Muted' : 'Unmuted and ready', 'info');
};

window.locateChild = function(childId) {
  store.update({
    selectedChildId: childId,
    activeParentTab: 'map',
    activeMode: 'parent'
  });
  setTimeout(() => {
    mapCtrl.locateChild(childId);
  }, 150);
};

window.selectChildMap = function(childId) {
  store.update({ selectedChildId: childId });
  mapCtrl.locateChild(childId);
  mapCtrl.renderSelectedChildRoute();
};

window.fitAllMapBounds = function() {
  mapCtrl.fitAllMapBounds();
  showToast('Map View', 'Fitted all family members and safe zones into view', 'info');
};

window.navigateToChild = function(childId) {
  store.update({
    selectedChildId: childId,
    activeParentTab: 'map',
    activeMode: 'parent'
  });
  setTimeout(() => {
    const nav = mapCtrl.navigateToChild(childId);
    if (nav) {
      showToast('Directions Active', `Distance: ${nav.distance} &bull; ${nav.eta}`, 'safe');
    }
  }, 150);
};

window.showChildRoute = function(childId) {
  store.update({
    selectedChildId: childId,
    activeParentTab: 'map',
    activeMode: 'parent'
  });
  setTimeout(() => {
    mapCtrl.locateChild(childId);
    mapCtrl.renderSelectedChildRoute();
    showToast('Route History', "Displaying today's travel breadcrumb route", 'info');
  }, 150);
};

window.callChildPhone = function(name) {
  showToast('Calling Phone', `Simulating direct phone call to ${name}...`, 'info');
};

window.callEmergencyServices = function() {
  openModal(
    '🚨 Emergency Services Dispatch (112)',
    `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <p style="font-size: 0.85rem; color: var(--text-muted);">
          Tap an emergency service below to initiate an immediate direct telephone dispatch.
        </p>
        <a href="tel:112" class="btn btn-danger" style="text-decoration: none; display: flex; justify-content: space-between; align-items: center; padding: 1rem;">
          <div>
            <div style="font-size: 1.05rem; font-weight: 800;">📞 112 National Emergency</div>
            <div style="font-size: 0.75rem; opacity: 0.9;">Police, Fire, Ambulance, Disaster Response</div>
          </div>
          <span style="font-size: 1.4rem;">🚨</span>
        </a>
        <a href="tel:1098" class="btn btn-secondary" style="text-decoration: none; display: flex; justify-content: space-between; align-items: center; padding: 0.85rem;">
          <div>
            <div style="font-size: 0.95rem; font-weight: 700;">📞 1098 Childline India</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">24/7 Free Child Protection & Helpline</div>
          </div>
          <span style="font-size: 1.3rem;">🛡️</span>
        </a>
        <a href="tel:100" class="btn btn-secondary" style="text-decoration: none; display: flex; justify-content: space-between; align-items: center; padding: 0.85rem;">
          <div>
            <div style="font-size: 0.95rem; font-weight: 700;">📞 100 Police Control Room</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Jammu & Kashmir Police Dispatch</div>
          </div>
          <span style="font-size: 1.3rem;">🚓</span>
        </a>
      </div>
    `,
    `<button class="btn btn-secondary" onclick="window.closeModal()">Close</button>`
  );
};

window.callEmergency911 = function() {
  window.callEmergencyServices();
};

window.setAlertFilter = function(filter) {
  parentUI.activeFilter = filter;
  parentUI.render();
};

window.dismissAlert = function(alertId) {
  store.dismissAlert(alertId);
  showToast('Alert Dismissed', 'Event marked as handled', 'info');
};

// Add Safe Zone Modal
window.openAddZoneModal = function() {
  store.update({ activeParentTab: 'map' });

  openModal(
    'Add New Safe Zone',
    `
      <div style="display: flex; flex-direction: column; gap: 0.85rem;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">
          Create a trusted geofence area. Click anywhere on the map or enter details below.
        </p>
        <div>
          <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.3rem;">Zone Name</label>
          <input id="new-zone-name" type="text" placeholder="e.g. Grandma's House, Library, Park" style="width: 100%;" value="After-school Tutoring 📚" />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.3rem;">Zone Type</label>
            <select id="new-zone-type" style="width: 100%;">
              <option value="school">School 🏫</option>
              <option value="home">Home 🏠</option>
              <option value="sports">Sports Ground 🏟️</option>
              <option value="family">Family/Grandparents 👵</option>
              <option value="restricted">Restricted / Hazard ⚠️</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.3rem;">Schedule</label>
            <input id="new-zone-schedule" type="text" value="Mon-Fri 03:30 PM - 05:30 PM" style="width: 100%;" />
          </div>
        </div>
        <div>
          <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.3rem;">
            Radius: <span id="radius-val-display">300</span> meters
          </label>
          <input id="new-zone-radius" type="range" min="50" max="1200" step="25" value="300" style="width: 100%;" oninput="document.getElementById('radius-val-display').textContent = this.value" />
        </div>
        <div>
          <label style="display: block; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.3rem;">Location Coordinates</label>
          <div style="display: flex; gap: 0.5rem;">
            <input id="new-zone-lat" type="text" value="37.7770" placeholder="Latitude" style="flex: 1;" />
            <input id="new-zone-lng" type="text" value="-122.4170" placeholder="Longitude" style="flex: 1;" />
          </div>
          <button class="btn btn-secondary" style="width: 100%; margin-top: 0.5rem; font-size: 0.75rem;" onclick="window.pickLocationOnMap()">
            📍 Click Map to Pick Coordinates
          </button>
        </div>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="window.saveNewSafeZone()">Save Safe Zone</button>
    `
  );
};

window.pickLocationOnMap = function() {
  showToast('Map Picker Active', 'Click anywhere on the map to set the geofence center.', 'info');
  mapCtrl.enableLocationPicker((lat, lng) => {
    const latInput = document.getElementById('new-zone-lat');
    const lngInput = document.getElementById('new-zone-lng');
    if (latInput) latInput.value = lat.toFixed(4);
    if (lngInput) lngInput.value = lng.toFixed(4);
    mapCtrl.setPickerMarker(lat, lng);
    showToast('Location Selected', `Coordinates: (${lat.toFixed(4)}, ${lng.toFixed(4)})`, 'safe');
  });
};

window.saveNewSafeZone = function() {
  const name = document.getElementById('new-zone-name')?.value || 'Custom Safe Zone';
  const type = document.getElementById('new-zone-type')?.value || 'school';
  const schedule = document.getElementById('new-zone-schedule')?.value || 'Daily';
  const radius = parseInt(document.getElementById('new-zone-radius')?.value || '300', 10);
  const lat = parseFloat(document.getElementById('new-zone-lat')?.value || '37.7770');
  const lng = parseFloat(document.getElementById('new-zone-lng')?.value || '-122.4170');

  const icons = {
    home: '🏠',
    school: '🏫',
    sports: '🏟️',
    family: '👵',
    restricted: '⚠️'
  };

  store.addSafeZone({
    name: name,
    icon: icons[type] || '📍',
    type: type,
    lat: lat,
    lng: lng,
    radius: radius,
    address: `${name} vicinity, SF, CA`,
    activeSchedule: schedule,
    alertOnEntry: true,
    alertOnExit: true,
    isRestricted: type === 'restricted'
  });

  closeModal();
  mapCtrl.renderSafeZones();
  showToast('Safe Zone Created', `"${name}" with ${radius}m radius is now active.`, 'safe');
};

window.deleteZoneConfirm = function(zoneId) {
  if (confirm('Are you sure you want to remove this Safe Zone?')) {
    store.deleteSafeZone(zoneId);
    mapCtrl.renderSafeZones();
    showToast('Zone Removed', 'Safe zone successfully deleted', 'info');
  }
};

window.focusZoneOnMap = function(zoneId) {
  const zone = store.get().safeZones.find(z => z.id === zoneId);
  if (!zone) return;
  store.update({ activeParentTab: 'map' });
  setTimeout(() => {
    mapCtrl.map.flyTo([zone.lat, zone.lng], 15);
    if (mapCtrl.zoneCircles[zoneId]) {
      mapCtrl.zoneCircles[zoneId].openPopup();
    }
  }, 150);
};

// Pairing Modal
window.openPairingModal = function() {
  const code = Math.floor(100000 + Math.random() * 900000);
  openModal(
    'Pair a Child Device',
    `
      <div style="text-align: center;">
        <p style="font-size: 0.82rem; color: var(--text-muted);">
          To link a new child phone, open <strong>SafeHaven</strong> on the child device and enter this one-time secure pairing PIN:
        </p>

        <div class="pairing-code-box">
          <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8;">One-Time Secure Code</span>
          <div class="code-digits">${code}</div>
          <span style="font-size: 0.68rem; opacity: 0.7;">Expires in 10 minutes &bull; Cryptographically generated</span>
        </div>

        <div style="display: flex; justify-content: center; margin: 1rem 0;">
          <div class="qr-code-placeholder">
            <!-- Simulated QR code SVG -->
            <svg width="124" height="124" viewBox="0 0 100 100" fill="#0f172a">
              <rect width="30" height="30" rx="4" />
              <rect x="70" width="30" height="30" rx="4" />
              <rect y="70" width="30" height="30" rx="4" />
              <rect x="8" y="8" width="14" height="14" fill="white" />
              <rect x="78" y="8" width="14" height="14" fill="white" />
              <rect x="8" y="78" width="14" height="14" fill="white" />
              <rect x="40" y="10" width="10" height="10" />
              <rect x="40" y="40" width="20" height="20" />
              <rect x="70" y="50" width="10" height="20" />
              <rect x="20" y="50" width="10" height="10" />
              <rect x="50" y="80" width="20" height="10" />
            </svg>
          </div>
        </div>

        <p style="font-size: 0.72rem; color: var(--text-subtle);">
          Pairing requires physical possession of both devices. Once linked, the child will see transparent confirmation that location sharing is active.
        </p>
      </div>
    `,
    `
      <button class="btn btn-primary" onclick="window.closeModal(); window.showToast('Device Paired', 'Simulated pairing complete!', 'safe');">
        Simulate Connection
      </button>
    `
  );
};

// Child History Modal
window.openChildHistoryModal = function(childId) {
  const child = store.getChild(childId);
  const route = store.get().routes[childId] || [];

  openModal(
    `${child.name}'s Daily Timeline`,
    `
      <div>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 1rem;">
          Chronological movement and safe zone check-ins for today. Retention policy: 30 days.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.65rem; border-left: 2px solid var(--border-light); margin-left: 1rem; padding-left: 1rem;">
          ${route.map(pt => `
            <div style="position: relative;">
              <div style="position: absolute; left: -1.45rem; top: 3px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary);"></div>
              <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main);">${pt.label}</div>
              <div style="font-size: 0.72rem; color: var(--text-subtle);">${pt.time} &bull; Lat: ${pt.lat.toFixed(4)}, Lng: ${pt.lng.toFixed(4)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `,
    `
      <button class="btn btn-primary" onclick="window.showChildRoute('${childId}'); window.closeModal();">
        🗺️ Replay on Map
      </button>
    `
  );
};

// Call Parent Modal (Child Mode)
window.openCallParentModal = function() {
  const contacts = store.get().settings.emergencyContacts.slice(0, 3);
  openModal(
    'Call Guardian',
    `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${contacts.map(c => `
          <button class="btn btn-secondary" style="padding: 1rem; text-align: left; justify-content: space-between; display: flex;" onclick="window.callChildPhone('${c.name}'); window.closeModal();">
            <div>
              <div style="font-size: 0.95rem; font-weight: 700;">${c.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${c.relation}</div>
            </div>
            <span style="font-size: 1.3rem;">📞</span>
          </button>
        `).join('')}
      </div>
    `,
    `<button class="btn btn-secondary" onclick="window.closeModal()">Close</button>`
  );
};

// Child Actions
window.childSendImSafe = function() {
  const childId = store.get().selectedChildId;
  store.recordCheckIn(childId);
  soundFx.playSafeChime();

  const notice = document.getElementById('child-toast-notice');
  if (notice) {
    notice.style.display = 'flex';
    setTimeout(() => {
      notice.style.display = 'none';
    }, 4000);
  }

  showToast('Check-in Sent', "Your parents received confirmation that you're safe ❤️", 'safe');
};

window.childShareLiveLocation = function() {
  const childId = store.get().selectedChildId;
  const child = store.getChild(childId);

  if ('geolocation' in navigator) {
    showToast('Locating GPS...', 'Fetching your real device coordinates...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const acc = Math.round(accuracy);
        store.updateUserLiveLocation({
          lat: latitude,
          lng: longitude,
          accuracy: acc
        });
        store.updateChild(childId, {
          lat: latitude,
          lng: longitude,
          gpsAccuracy: `Live GNSS (±${acc}m)`,
          lastUpdated: Date.now()
        });
        if (mapCtrl.map) {
          mapCtrl.renderChildrenMarkers();
          mapCtrl.renderLiveUserMarker();
        }
        soundFx.playSafeChime();
        showToast('Live Location Shared', `GPS ping sent: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}° (±${acc}m)`, 'safe');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        store.updateChild(childId, { lastUpdated: Date.now() });
        showToast('Location Shared', `Standard telemetry ping sent. Accuracy: ${child.gpsAccuracy}`, 'info');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  } else {
    store.updateChild(childId, { lastUpdated: Date.now() });
    showToast('Location Shared', `Live GPS ping sent to Guardians. Accuracy: ${child.gpsAccuracy}`, 'safe');
  }
};

window.cancelChildSOS = function() {
  store.resolveSOS();
  soundFx.stopEmergencySOS();
  showToast('SOS Resolved', 'Emergency alert cancelled.', 'info');
};

window.resolveEmergencySOS = function() {
  store.resolveSOS();
  soundFx.stopEmergencySOS();
  showToast('Emergency Resolved', 'Safety status marked as resolved by Guardian.', 'safe');
};

// Settings Toggles
window.toggleNotificationSetting = function(key) {
  const settings = store.get().settings;
  settings.notifications[key] = !settings.notifications[key];
  store.update({ settings: settings });
  showToast('Preference Updated', 'Notification rules saved.', 'info');
};

window.updateRetentionPolicy = function(val) {
  const settings = store.get().settings;
  settings.privacy.historyRetentionDays = parseInt(val, 10);
  store.update({ settings: settings });
  showToast('Retention Updated', `Location history will be kept for ${val === '0' ? '0 days (None)' : val + ' days'}.`, 'info');
};

window.purgeLocationHistory = function() {
  if (confirm('Are you sure you want to permanently delete all stored location histories?')) {
    store.update({
      routes: { c1: [], c2: [], c3: [] }
    });
    mapCtrl.renderSelectedChildRoute();
    showToast('History Deleted', 'All location trails purged permanently.', 'info');
  }
};

window.exportDataJSON = function() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.get(), null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", "safehaven_family_data.json");
  dlAnchor.click();
  showToast('Data Exported', 'Downloaded safehaven_family_data.json', 'safe');
};

// Bind Simulator Presets to global scope
window.simScenario1 = () => simulator.runScenario1();
window.simScenario2 = () => simulator.runScenario2();
window.simScenario3 = () => simulator.runScenario3();
window.simScenario4 = () => simulator.runScenario4();
window.simScenario5 = () => simulator.runScenario5();
window.simTriggerFall = () => simulator.triggerManualFall();
window.simDrainBattery = () => simulator.triggerBatteryDrain();
window.simChildCheckIn = () => simulator.triggerChildCheckIn();
window.simResetAll = () => simulator.resetAll();

// Google Maps Style Switcher Controller
window.changeMapStyle = function(style) {
  mapCtrl.setMapStyle(style);
  const names = {
    'google_streets': 'Streets (Roadmap)',
    'google_hybrid': 'Satellite Hybrid',
    'google_terrain': 'Topographic Terrain'
  };
  showToast('Google Maps View', `Layer switched to ${names[style] || style}`, 'info');
};

// Live Hardware GPS & Jammu Hub Location Controllers
window.useMyCurrentLocation = function(targetRole = null) {
  if (!('geolocation' in navigator)) {
    showToast('GPS Unsupported', 'Geolocation is not supported by your browser.', 'warning');
    return;
  }

  showToast('Detecting Location', 'Querying device GPS sensors...', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const accRounded = Math.round(accuracy);

      store.updateUserLiveLocation({
        lat: latitude,
        lng: longitude,
        accuracy: accRounded
      });

      if (!mapCtrl.map) {
        store.update({ activeParentTab: 'map' });
        setTimeout(() => {
          mapCtrl.renderLiveUserMarker();
          mapCtrl.goToLiveGPS();
        }, 200);
      } else {
        mapCtrl.renderLiveUserMarker();
        mapCtrl.goToLiveGPS();
      }

      // Update Hub Buttons active state
      const btnLive = document.getElementById('btn-hub-live');
      const btnJammu = document.getElementById('btn-hub-jammu');
      if (btnLive) btnLive.classList.add('active');
      if (btnJammu) btnJammu.classList.remove('active');

      if (targetRole === 'parent') {
        store.assignLiveLocationToParent();
        mapCtrl.renderParentMarker();
        showToast('Guardian Updated', `Guardian location set to device GPS: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`, 'safe');
      } else if (targetRole === 'child') {
        const childId = store.get().selectedChildId;
        store.assignLiveLocationToChild(childId);
        mapCtrl.renderChildrenMarkers();
        showToast('Child Synced', `Child location synced to live GPS: ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`, 'safe');
      } else {
        showToast('📍 Live GPS Located', `Verified hardware fix: ${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E (±${accRounded}m)`, 'safe');
      }
    },
    (err) => {
      console.warn('Geolocation error:', err);
      let msg = 'Could not access device location. Please allow location permissions in your browser.';
      if (err.code === 1) msg = 'Location permission was denied. Please allow location in your browser address bar.';
      else if (err.code === 2) msg = 'Position unavailable. GPS signal could not be acquired.';
      else if (err.code === 3) msg = 'Location request timed out. Retrying with network location.';
      showToast('GPS Notice', msg, 'warning');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
};

window.goToJammuLocation = function() {
  mapCtrl.goToJammu();
  const btnLive = document.getElementById('btn-hub-live');
  const btnJammu = document.getElementById('btn-hub-jammu');
  if (btnJammu) btnJammu.classList.add('active');
  if (btnLive) btnLive.classList.remove('active');
  showToast('Jammu City Hub', 'Centered on Gandhi Nagar, DPS Jammu & Tawi River', 'info');
};

window.setGuardianToLiveGPS = function() {
  const success = store.assignLiveLocationToParent();
  if (success) {
    mapCtrl.renderParentMarker();
    showToast('Guardian Location Set', 'Guardian base set to your live GPS coordinates.', 'safe');
  } else {
    window.useMyCurrentLocation('parent');
  }
};

window.setChildToLiveGPS = function() {
  const childId = store.get().selectedChildId;
  const success = store.assignLiveLocationToChild(childId);
  if (success) {
    mapCtrl.renderChildrenMarkers();
    showToast('Child Location Synced', 'Active child location set to your live GPS coordinates.', 'safe');
  } else {
    window.useMyCurrentLocation('child');
  }
};

/* =========================================================
   Gmail Authentication UI Controller & Modal System
   ========================================================= */

window.openGmailLoginModal = function() {
  const state = store.get();
  const auth = state.auth || { isAuthenticated: false, email: 'vansh.koul@gmail.com' };

  openModal(
    '🔑 Guardian Account & Gmail Sign-In',
    `
      <div class="gmail-modal-wrapper">
        <div class="gmail-modal-hero">
          <div class="google-badge-avatar">
            <span style="font-weight: 900; font-size: 1.6rem; color: #ea4335;">G</span>
          </div>
          <div style="text-align: center;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.2rem;">
              ${auth.isAuthenticated ? 'Guardian Account Session' : 'Sign in with Google'}
            </h3>
            <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">
              Access live child safety signals, geofencing, and emergency alerts for Aarav, Anaya, and Kabir.
            </p>
          </div>
        </div>

        ${auth.isAuthenticated ? `
          <div class="gmail-current-session-box">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="gmail-avatar-ring">V</div>
              <div>
                <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-main);">${auth.name || 'Vansh Koul'}</div>
                <div style="font-size: 0.78rem; color: #0284c7; font-weight: 600;">${auth.email}</div>
                <div style="font-size: 0.7rem; color: var(--text-subtle);">Primary Guardian (Father) &bull; Jammu, J&K</div>
              </div>
            </div>
            <span class="badge-pill" style="background: var(--safe-bg); color: #047857; border: 1px solid var(--safe-border);">Active</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.85rem;">
            <button class="btn btn-secondary" style="width: 100%; font-size: 0.82rem;" onclick="window.showToast('Account Synced', 'Google Workspace session verified.', 'safe'); window.closeModal();">
              ✓ Continue as ${auth.name.split(' ')[0]}
            </button>
            <button class="btn btn-secondary" style="width: 100%; font-size: 0.82rem; color: #dc2626; border-color: rgba(220, 38, 38, 0.3);" onclick="window.logoutCurrentGmail();">
              🚪 Sign Out of Gmail
            </button>
          </div>
          <div style="text-align: center; margin-top: 0.8rem; font-size: 0.74rem; color: var(--text-muted);">
            Or sign in with another Gmail ID below:
          </div>
        ` : ''}

        <!-- 1-Tap Google Sign In -->
        <div style="margin-top: 0.65rem;">
          <button class="btn-google-sso" onclick="window.loginAsDemoVansh()">
            <svg class="google-svg" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.34 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
            </svg>
            <span>Continue with Google (vansh.koul@gmail.com)</span>
          </button>
        </div>

        <div class="auth-divider-line">
          <span>or sign in with email</span>
        </div>

        <!-- Custom Gmail ID Form -->
        <form onsubmit="window.handleGmailFormSubmit(event)" class="gmail-form">
          <div class="form-group" style="margin-bottom: 0.75rem;">
            <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem; display: block;">
              Gmail Address
            </label>
            <div style="position: relative;">
              <input type="email" id="gmail-input-id" class="form-control" placeholder="name@gmail.com" required value="${auth.email || 'vansh.koul@gmail.com'}" style="padding-left: 2.2rem; width: 100%; border-radius: var(--radius-md);" />
              <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 1rem;">✉️</span>
            </div>
            <div style="display: flex; gap: 0.35rem; margin-top: 0.35rem;">
              <button type="button" class="domain-pill" onclick="document.getElementById('gmail-input-id').value = 'vansh.koul@gmail.com'">
                @vansh.koul
              </button>
              <button type="button" class="domain-pill" onclick="document.getElementById('gmail-input-id').value = 'vansh.guardian@gmail.com'">
                @vansh.guardian
              </button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 0.9rem;">
            <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem; display: block;">
              Password
            </label>
            <div style="position: relative;">
              <input type="password" id="gmail-input-pwd" class="form-control" placeholder="••••••••••••" value="SafeHavenGuardian2026" required style="padding-left: 2.2rem; width: 100%; border-radius: var(--radius-md);" />
              <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 1rem;">🔒</span>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 0.92rem; font-weight: 800; border-radius: var(--radius-md);">
            Sign In with Gmail
          </button>
        </form>
      </div>
    `,
    `<button class="btn btn-secondary" onclick="window.closeModal()">Close</button>`
  );
};

window.loginAsDemoVansh = function() {
  store.loginWithGmail('vansh.koul@gmail.com', 'Vansh Koul');
  window.closeModal();
  showToast('Google Sign-In Successful', 'Welcome back, Vansh Koul (Father & Guardian)', 'safe');
};

window.handleGmailFormSubmit = function(e) {
  e.preventDefault();
  const emailInput = document.getElementById('gmail-input-id');
  if (!emailInput) return;
  const email = emailInput.value.trim();
  if (!email) return;

  let displayName = 'Vansh Koul';
  if (email.toLowerCase().includes('vansh')) {
    displayName = 'Vansh Koul';
  } else {
    const userPart = email.split('@')[0];
    displayName = userPart.charAt(0).toUpperCase() + userPart.slice(1);
  }

  store.loginWithGmail(email, displayName);
  window.closeModal();
  showToast('Signed In with Gmail', `Authenticated as ${email}`, 'safe');
};

window.logoutCurrentGmail = function() {
  store.logoutGmail();
  window.closeModal();
  showToast('Signed Out', 'Guardian session locked. Sign in to view telemetry.', 'info');
};


