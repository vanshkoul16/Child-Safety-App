/* =========================================================
   SafeHaven - Application Bootstrapper & Global Controllers
   ========================================================= */

import { store } from './state.js';
import { parentUI } from './parentUI.js';
import { childUI } from './childUI.js';
import { mapCtrl } from './mapController.js';
import { soundFx } from './audioNotifier.js';
import { safetyEngine } from './safetyEngine.js';
import { icon, zoneIcon, clean } from './icons.js';
import { needsPermissionSetup, openPermissionSetup, startFallDetection, sosCapture } from './permissions.js';

const TOAST_ICONS = { info: 'info', critical: 'siren', warning: 'alert', safe: 'checkCircle' };

const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* System (push) notification for new alerts, when the guardian has turned it on */
function pushNotify(title, body, tag) {
  const n = store.get().settings.notifications;
  if (!n.push || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const opts = { body, tag, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png' };
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(() => {});
  } else {
    try { new Notification(title, opts); } catch (e) { /* some browsers only allow SW notifications */ }
  }
}

// Global Toast System
export function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'critical' ? 'alert' : 'status');
  toast.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICONS[type] || 'info', 17)}</span>
    <div class="toast__body">
      <div class="toast__title">${clean(title)}</div>
      <div class="toast__msg">${clean(message)}</div>
    </div>
    <button class="toast__close" aria-label="Dismiss notification">${icon('x', 15)}</button>
  `;

  const dismiss = () => {
    if (!toast.parentElement) return;
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  };
  toast.querySelector('.toast__close').addEventListener('click', dismiss);

  container.appendChild(toast);
  while (container.children.length > 4) container.firstElementChild.remove();

  if (type === 'critical') soundFx.playWarningBeep();
  else if (type === 'safe') soundFx.playSafeChime();
  else soundFx.playPing();

  setTimeout(dismiss, 4500);
}
window.showToast = showToast;

// Global Modal Controller
let modalOnClose = null;

export function openModal(title, bodyHtml, footerHtml = '', opts = {}) {
  modalOnClose = opts.onClose || null;
  let overlay = document.getElementById('global-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'global-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal ${opts.size ? `modal--${opts.size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__head">
        <h3 class="modal__title" id="modal-title">${title}</h3>
        <button class="icon-btn" onclick="window.closeModal()" aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal__foot">${footerHtml}</div>` : ''}
    </div>
  `;
  overlay.classList.add('is-open');
  document.body.classList.add('has-modal');
  const focusTarget = overlay.querySelector('.modal__body input, .modal__body button, .modal__foot button') || overlay.querySelector('.icon-btn');
  if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), 30);
}

export function closeModal() {
  const overlay = document.getElementById('global-modal-overlay');
  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.innerHTML = '';
  }
  document.body.classList.remove('has-modal');
  mapCtrl.disableLocationPicker();
  const onClose = modalOnClose;
  modalOnClose = null;
  if (onClose) onClose();
}
window.closeModal = closeModal;

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('has-modal')) closeModal();
});

// Application Initialization
function initApp() {
  const initial = store.get();
  document.documentElement.setAttribute('data-theme', initial.theme === 'dark' ? 'dark' : 'light');
  if (initial.isAudioMuted && !soundFx.isMuted) soundFx.toggleMute();

  safetyEngine.startMonitoring();

  parentUI.mount('parent-content-area');
  childUI.mount('child-content-area');

  let lastMode = null;
  const syncViewMode = (state) => {
    const parentContainer = document.getElementById('parent-container');
    const childContainer = document.getElementById('child-container');

    document.querySelectorAll('.mode-btn').forEach(btn => {
      const active = btn.dataset.mode === state.activeMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active);
    });

    const isChild = state.activeMode === 'child';
    // The map is hidden in child mode: pause it, and resume (replaying queued moves) on return
    if (lastMode && lastMode !== state.activeMode) {
      if (isChild) mapCtrl.onTabDeactivated();
      else if (state.activeParentTab === 'map') setTimeout(() => mapCtrl.onTabActivated(), 0);
    }
    lastMode = state.activeMode;
    if (parentContainer) parentContainer.hidden = isChild;
    if (childContainer) childContainer.hidden = !isChild;
    document.body.dataset.mode = isChild ? 'child' : 'parent';
    document.body.dataset.tab = state.activeParentTab || 'home';

    document.querySelectorAll('.nav-item').forEach(item => {
      const active = item.dataset.tab === state.activeParentTab;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    const unread = (state.alerts || []).filter(a => !a.isDismissed && (a.type === 'critical' || a.type === 'warning')).length;
    document.querySelectorAll('[data-alert-count]').forEach(el => {
      el.textContent = unread;
      el.hidden = unread === 0;
    });

    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) {
      audioBtn.innerHTML = icon(state.isAudioMuted ? 'volumeX' : 'volume', 18);
      audioBtn.setAttribute('aria-label', state.isAudioMuted ? 'Unmute sound alerts' : 'Mute sound alerts');
    }

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeBtn.innerHTML = icon(dark ? 'sun' : 'moon', 18);
      themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    }

    const isAuth = state.auth && state.auth.isAuthenticated;
    const gmailDisplay = document.getElementById('header-gmail-email');
    const gmailInitial = document.getElementById('header-gmail-initial');
    const gmailBtn = document.getElementById('gmail-auth-btn');
    if (gmailDisplay) gmailDisplay.textContent = isAuth ? (state.auth.name || state.auth.email) : 'Sign in';
    if (gmailInitial) gmailInitial.textContent = isAuth ? (state.auth.name || state.auth.email || 'V').charAt(0).toUpperCase() : '?';
    if (gmailBtn) gmailBtn.classList.toggle('unauthenticated', !isAuth);

    renderEmergencyBroadcast(state);
  };

  store.subscribe(syncViewMode);
  syncViewMode(store.get());

  // Push a system notification for every newly raised alert; confirm SMS dispatch on SOS
  const seenAlerts = new Set((store.get().alerts || []).map(a => a.id));
  let lastSosTs = store.get().activeSosAlert ? store.get().activeSosAlert.timestamp : null;
  store.subscribe((state) => {
    (state.alerts || []).forEach(a => {
      if (seenAlerts.has(a.id)) return;
      seenAlerts.add(a.id);
      if (a.type === 'critical' || a.type === 'warning') {
        const name = (store.getChild(a.childId) || {}).name || a.childName;
        pushNotify(clean(a.title), `${name}: ${clean(a.what)}`, a.id);
      }
    });

    const sos = state.activeSosAlert;
    if (sos && sos.timestamp !== lastSosTs) {
      lastSosTs = sos.timestamp;
      if (state.settings.notifications.sms !== false) {
        const count = state.settings.emergencyContacts.filter(c => c.notifySOS).length;
        setTimeout(() => showToast('SMS sent', `Live location texted to ${count} SOS contacts.`, 'info'), 600);
      }
    } else if (!sos) {
      lastSosTs = null;
    }
  });

  // During an SOS keep the screen on; a child-raised SOS also records a short clip on the child's device
  store.update({ sosRecording: false });
  const syncSosCapture = (state) => {
    const sos = state.activeSosAlert;
    if (sos) sosCapture.start(sos, { record: sos.raisedBy !== 'guardian' });
    else sosCapture.stop();
  };
  store.subscribe(syncSosCapture);
  syncSosCapture(store.get());

  initBackendSync();
  startFallDetection();
  if (needsPermissionSetup()) openPermissionSetup({ openModal, onClose: requestLocationOnOpen });
  else requestLocationOnOpen();
}

window.openPermissionSetup = () => openPermissionSetup({ openModal });

window.playSosRecording = function(alertId) {
  const url = sosCapture.clips[alertId];
  if (!url) return;
  openModal(
    'SOS recording',
    `<p class="modal__lede">Recorded on the child's phone while the SOS was active. It is kept only until this page is closed.</p>
     <video class="sos-clip" src="${url}" controls playsinline autoplay></video>`,
    `<a class="btn btn--soft" href="${url}" download="safehaven-sos-${alertId}.webm">${icon('download', 16)} Save copy</a>
     <button class="btn btn--primary" onclick="window.closeModal()">Close</button>`
  );
};

// Ask for location access as soon as the site opens (the browser only prompts while the choice is undecided)
async function requestLocationOnOpen() {
  if (!('geolocation' in navigator)) return;

  let firstAsk = true;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    firstAsk = status.state === 'prompt';
  } catch (e) {
    // Permissions API unavailable: treat as a first request
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      store.updateUserLiveLocation({ lat: latitude, lng: longitude, accuracy });
      if (mapCtrl.map) mapCtrl.renderLiveUserMarker();
      if (firstAsk) showToast('Location on', `Accurate to ${Math.round(accuracy)} m`, 'safe');
    },
    (err) => {
      if (err.code === 1 && firstAsk) {
        showToast('Location off', 'You can allow location later from the address bar.', 'warning');
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

async function initBackendSync() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      console.log('SafeHaven backend connected:', data);
    }
  } catch (err) {
    // Standalone client / offline PWA mode
  }
}

window.syncToBackend = async function(endpoint, payload) {
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return null;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/* Fullscreen Emergency SOS Broadcast Overlay */
function renderEmergencyBroadcast(state) {
  let overlay = document.getElementById('emergency-broadcast-overlay');

  if (state.activeSosAlert && state.activeMode === 'parent') {
    const alert = state.activeSosAlert;
    const child = store.getChild(alert.childId);

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'emergency-broadcast-overlay';
      overlay.className = 'sos-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-labelledby', 'sos-overlay-title');
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div class="sos-overlay__inner">
        <div class="sos-overlay__pulse">${icon('siren', 34)}</div>
        <p class="sos-overlay__eyebrow">Emergency SOS · ${new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        <h2 class="sos-overlay__title" id="sos-overlay-title">${child.name} needs help now</h2>
        <p class="sos-overlay__lede">${alert.raisedBy === 'guardian' ? `You raised an SOS for ${child.name}.` : `${child.name} pressed SOS.`} Emergency contacts have been notified${state.settings.notifications.sms !== false ? ' by push and SMS' : ''}.</p>

        <div class="sos-overlay__card">
          <img class="sos-overlay__avatar" src="${child.avatar}" alt="" />
          <dl>
            <div><dt>Location</dt><dd class="mono">${child.lat.toFixed(4)}, ${child.lng.toFixed(4)}</dd></div>
            <div><dt>Battery</dt><dd>${child.battery}%</dd></div>
            <div><dt>Device</dt><dd>${clean(child.device).split(' (')[0]}</dd></div>
            <div><dt>Evidence</dt><dd>${clean(alert.evidence)}</dd></div>
            ${alert.raisedBy !== 'guardian' ? `<div><dt>Recording</dt><dd>${state.sosRecording ? 'Recording audio and video on the child\'s phone (up to 60 s)' : sosCapture.clips[alert.id] ? 'Clip saved — play it from Alerts' : 'No recording (camera or microphone not allowed)'}</dd></div>` : ''}
          </dl>
        </div>

        <div class="sos-overlay__actions">
          <button class="btn btn--white btn--lg btn--block" onclick="window.callEmergencyServices()">${icon('phone', 18)} Call 112 emergency</button>
          <div class="sos-overlay__row">
            <button class="btn btn--glass-dark btn--block" onclick="window.callChildPhone('${child.name}')">${icon('phone', 16)} Call ${child.name}</button>
            <button class="btn btn--glass-dark btn--block" onclick="window.locateChild('${child.id}'); window.resolveEmergencySOS();">${icon('locate', 16)} View & mark handled</button>
          </div>
        </div>
      </div>
    `;
    overlay.classList.add('is-open');
  } else if (overlay) {
    overlay.remove();
  }
}

// -------------------------------------------------------------
// WINDOW GLOBAL ACTIONS (bound to buttons via onclick)
// -------------------------------------------------------------

window.switchMode = function(mode) {
  store.update({ activeMode: mode });
};

window.switchTab = function(tab) {
  store.update({ activeParentTab: tab, activeMode: 'parent' });
};

window.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.classList.add('theme-switching');
  document.documentElement.setAttribute('data-theme', next);
  store.update({ theme: next });
  mapCtrl.refreshTheme && mapCtrl.refreshTheme();
  setTimeout(() => document.documentElement.classList.remove('theme-switching'), 300);
};

window.toggleAudioMute = function() {
  const isMuted = soundFx.toggleMute();
  store.update({ isAudioMuted: isMuted });
  showToast('Sound alerts', isMuted ? 'Muted' : 'On', 'info');
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

window.locateSelectedChild = function() {
  window.locateChild(store.get().selectedChildId);
};

window.navigateToSelectedChild = function() {
  window.navigateToChild(store.get().selectedChildId);
};

window.mapZoom = function(delta) {
  if (!mapCtrl.map) return;
  if (delta > 0) mapCtrl.map.zoomIn();
  else mapCtrl.map.zoomOut();
};

window.selectChildMap = function(childId) {
  store.update({ selectedChildId: childId });
  mapCtrl.locateChild(childId);
  mapCtrl.renderSelectedChildRoute();
};

window.fitAllMapBounds = function() {
  mapCtrl.fitAllMapBounds();
};

window.navigateToChild = function(childId) {
  store.update({
    selectedChildId: childId,
    activeParentTab: 'map',
    activeMode: 'parent'
  });
  const panel = document.getElementById('map-directions');
  const child = store.getChild(childId);
  if (panel && child) {
    panel.hidden = false;
    panel.innerHTML = `
      <div class="dir__head">
        <span class="dir__icon">${icon('car', 18)}</span>
        <div class="dir__sum"><strong>Finding the fastest route…</strong><span>To ${esc(child.name)}</span></div>
        <button class="icon-btn" onclick="window.closeDirections()" aria-label="Close directions">${icon('x', 16)}</button>
      </div>
      <div class="dir__loading"><span></span><span></span><span></span></div>
    `;
  }
  setTimeout(async () => {
    const nav = await mapCtrl.navigateToChild(childId);
    if (!nav || !panel) return;
    panel.innerHTML = `
      <div class="dir__head">
        <span class="dir__icon">${icon('car', 18)}</span>
        <div class="dir__sum"><strong>${esc(nav.eta)}</strong><span>${esc(nav.distance)} to ${esc(child.name)}</span></div>
        <button class="icon-btn" onclick="window.closeDirections()" aria-label="Close directions">${icon('x', 16)}</button>
      </div>
      <ol class="dir__steps">
        ${nav.steps.map((st, i) => `
          <li class="dir__step ${i === nav.steps.length - 1 ? 'is-last' : ''}">
            <span class="dir__step-icon">${icon(st.icon, 16)}</span>
            <span class="dir__text">${esc(st.text)}</span>
            <span class="dir__dist">${esc(st.dist)}</span>
          </li>
        `).join('')}
      </ol>
      <div class="dir__foot">
        ${nav.source === 'approx' ? `<p class="dir__note">${icon('info', 13)} Approximate route — live routing is unavailable right now.</p>` : ''}
        <a class="btn btn--primary btn--sm btn--block" href="${nav.gmapsUrl}" target="_blank" rel="noopener">${icon('navigation', 15)} Start in Google Maps</a>
      </div>
    `;
  }, 150);
};

window.closeDirections = function() {
  const panel = document.getElementById('map-directions');
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  mapCtrl.clearNavigation();
};

// Guardian-raised SOS for a child (from the child card quick action)
window.parentSOSAlert = function(childId) {
  const child = store.getChild(childId);
  if (!child) return;
  const contacts = store.get().settings.emergencyContacts.filter(c => c.notifySOS).length;
  openModal(
    `Raise an SOS for ${child.name}?`,
    `
      <p class="modal__lede">Use this if you believe ${child.name} is in danger and can't press SOS themselves.</p>
      <ul class="sos-effects">
        <li>${icon('siren', 16)} ${child.name}'s phone switches to emergency mode and shares live location continuously</li>
        <li>${icon('message', 16)} ${contacts} SOS contacts are alerted${store.get().settings.notifications.sms !== false ? ' by push and SMS' : ''}</li>
        <li>${icon('bell', 16)} The emergency siren sounds on this device</li>
      </ul>
    `,
    `
      <a class="btn btn--ghost" href="tel:112">${icon('phone', 15)} Call 112</a>
      <button class="btn btn--ghost" onclick="window.closeModal()">Cancel</button>
      <button class="btn btn--danger" onclick="window.confirmParentSOS('${childId}')">${icon('siren', 15)} Raise SOS</button>
    `,
    { size: 'sm' }
  );
};

window.confirmParentSOS = function(childId) {
  closeModal();
  store.triggerSOS(childId, 'guardian');
  soundFx.playEmergencySOS();
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
    showToast('Route', "Showing today's route", 'info');
  }, 150);
};

window.callChildPhone = function(name) {
  showToast('Calling', `Calling ${name}…`, 'info');
};

const choice = (href, title, sub, ic, tone = '') => `
  <a href="${href}" class="choice ${tone ? `choice--${tone}` : ''}">
    <span class="choice__icon">${icon(ic, 18)}</span>
    <span class="choice__body">
      <span class="choice__title">${title}</span>
      <span class="choice__sub">${sub}</span>
    </span>
    ${icon('chevronRight', 16, 'choice__chev')}
  </a>
`;

window.callEmergencyServices = function() {
  openModal(
    'Call emergency services',
    `
      <p class="modal__lede">Tap a number to start the call immediately.</p>
      <div class="choices">
        ${choice('tel:112', '112 · National emergency', 'Police, fire, ambulance and disaster response', 'siren', 'danger')}
        ${choice('tel:1098', '1098 · Childline India', 'Free 24/7 child protection helpline', 'shield')}
        ${choice('tel:100', '100 · Police control room', 'Jammu & Kashmir Police dispatch', 'building')}
      </div>
    `,
    `<button class="btn btn--soft" onclick="window.closeModal()">Close</button>`
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
  showToast('Alert dismissed', 'Marked as handled', 'info');
};

// Add Safe Zone Modal
window.openAddZoneModal = function() {
  store.update({ activeParentTab: 'map', activeMode: 'parent' });
  const center = mapCtrl.map ? mapCtrl.map.getCenter() : { lat: 32.7155, lng: 74.8672 };

  openModal(
    'New safe zone',
    `
      <p class="modal__lede">Create a trusted area. You'll be alerted when a child enters or leaves it.</p>
      <div class="form">
        <label class="field">
          <span class="field__label">Name</span>
          <input id="new-zone-name" class="input" type="text" placeholder="e.g. Grandma's house, library, park" value="After-school tutoring" />
        </label>
        <div class="form__row">
          <label class="field">
            <span class="field__label">Type</span>
            <span class="select-wrap select-wrap--full">
              <select id="new-zone-type" class="select">
                <option value="school">School</option>
                <option value="home">Home</option>
                <option value="sports">Sports ground</option>
                <option value="family">Family</option>
                <option value="restricted">Restricted area</option>
              </select>
              ${icon('chevronDown', 15)}
            </span>
          </label>
          <label class="field">
            <span class="field__label">Schedule</span>
            <input id="new-zone-schedule" class="input" type="text" value="Mon–Fri 3:30 – 5:30 PM" />
          </label>
        </div>
        <label class="field">
          <span class="field__label">Radius <output id="radius-val-display" class="field__value">300 m</output></span>
          <input id="new-zone-radius" class="range" type="range" min="50" max="1200" step="25" value="300" oninput="document.getElementById('radius-val-display').textContent = this.value + ' m'" />
        </label>
        <div class="field">
          <span class="field__label">Centre point</span>
          <div class="form__row">
            <input id="new-zone-lat" class="input mono" type="text" value="${center.lat.toFixed(4)}" placeholder="Latitude" aria-label="Latitude" />
            <input id="new-zone-lng" class="input mono" type="text" value="${center.lng.toFixed(4)}" placeholder="Longitude" aria-label="Longitude" />
          </div>
          <button class="btn btn--soft btn--sm btn--block" onclick="window.pickLocationOnMap()">${icon('pin', 15)} Pick on map</button>
        </div>
      </div>
    `,
    `
      <button class="btn btn--ghost" onclick="window.closeModal()">Cancel</button>
      <button class="btn btn--primary" onclick="window.saveNewSafeZone()">Save zone</button>
    `
  );
};

window.pickLocationOnMap = function() {
  showToast('Pick a point', 'Click anywhere on the map to set the zone centre.', 'info');
  mapCtrl.enableLocationPicker((lat, lng) => {
    const latInput = document.getElementById('new-zone-lat');
    const lngInput = document.getElementById('new-zone-lng');
    if (latInput) latInput.value = lat.toFixed(4);
    if (lngInput) lngInput.value = lng.toFixed(4);
    mapCtrl.setPickerMarker(lat, lng);
    showToast('Point selected', `${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'safe');
  });
};

window.saveNewSafeZone = function() {
  const name = document.getElementById('new-zone-name')?.value || 'Custom safe zone';
  const type = document.getElementById('new-zone-type')?.value || 'school';
  const schedule = document.getElementById('new-zone-schedule')?.value || 'Daily';
  const radius = parseInt(document.getElementById('new-zone-radius')?.value || '300', 10);
  const lat = parseFloat(document.getElementById('new-zone-lat')?.value || '32.7155');
  const lng = parseFloat(document.getElementById('new-zone-lng')?.value || '74.8672');

  store.addSafeZone({
    name: name,
    icon: '',
    type: type,
    lat: lat,
    lng: lng,
    radius: radius,
    address: `${name}, Jammu`,
    activeSchedule: schedule,
    alertOnEntry: true,
    alertOnExit: true,
    isRestricted: type === 'restricted'
  });

  closeModal();
  mapCtrl.renderSafeZones();
  showToast('Safe zone created', `"${name}" (${radius} m) is now active.`, 'safe');
};

window.deleteZoneConfirm = function(zoneId) {
  const zone = store.get().safeZones.find(z => z.id === zoneId);
  openModal(
    'Remove safe zone?',
    `<p class="modal__lede">${zone ? `<strong>${clean(zone.name)}</strong> will be removed and` : 'This zone will be removed and'} you'll stop receiving entry and exit alerts for it.</p>`,
    `
      <button class="btn btn--ghost" onclick="window.closeModal()">Cancel</button>
      <button class="btn btn--danger" onclick="window.confirmDeleteZone('${zoneId}')">Remove zone</button>
    `,
    { size: 'sm' }
  );
};

window.confirmDeleteZone = function(zoneId) {
  store.deleteSafeZone(zoneId);
  mapCtrl.renderSafeZones();
  closeModal();
  showToast('Zone removed', 'The safe zone was deleted.', 'info');
};

window.focusZoneOnMap = function(zoneId) {
  const zone = store.get().safeZones.find(z => z.id === zoneId);
  if (!zone) return;
  store.update({ activeParentTab: 'map', activeMode: 'parent' });
  setTimeout(() => {
    if (!mapCtrl.map) return;
    mapCtrl._move(m => m.flyTo([zone.lat, zone.lng], 15));
    if (mapCtrl.zoneCircles[zoneId]) {
      mapCtrl.zoneCircles[zoneId].openPopup();
    }
  }, 250);
};

// Pairing Modal
window.openPairingModal = function() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  openModal(
    'Pair a child’s device',
    `
      <p class="modal__lede">Open SafeHaven on your child's phone and enter this one-time code, or scan the QR code.</p>
      <div class="pair">
        <div class="pair__code" aria-label="Pairing code ${code}">
          ${code.split('').map(d => `<span>${d}</span>`).join('')}
        </div>
        <p class="pair__hint">${icon('clock', 13)} Expires in 10 minutes</p>
        <div class="pair__qr">
          <svg width="132" height="132" viewBox="0 0 100 100" aria-hidden="true">
            <rect width="30" height="30" rx="6" />
            <rect x="70" width="30" height="30" rx="6" />
            <rect y="70" width="30" height="30" rx="6" />
            <rect x="8" y="8" width="14" height="14" rx="3" class="qr-hole" />
            <rect x="78" y="8" width="14" height="14" rx="3" class="qr-hole" />
            <rect x="8" y="78" width="14" height="14" rx="3" class="qr-hole" />
            <rect x="40" y="6" width="10" height="10" rx="2" />
            <rect x="54" y="18" width="8" height="8" rx="2" />
            <rect x="40" y="40" width="20" height="20" rx="3" />
            <rect x="70" y="44" width="10" height="20" rx="2" />
            <rect x="86" y="70" width="10" height="10" rx="2" />
            <rect x="20" y="44" width="10" height="10" rx="2" />
            <rect x="6" y="54" width="8" height="8" rx="2" />
            <rect x="50" y="80" width="20" height="10" rx="2" />
            <rect x="76" y="86" width="8" height="10" rx="2" />
          </svg>
        </div>
      </div>
      <p class="fine">Pairing needs both phones in hand. Once linked, your child will always see that location sharing is on.</p>
    `,
    `
      <button class="btn btn--ghost" onclick="window.closeModal()">Cancel</button>
      <button class="btn btn--primary" onclick="window.closeModal(); window.showToast('Device paired', 'The new device is now linked.', 'safe');">Simulate connection</button>
    `,
    { size: 'sm' }
  );
};

// Child History Modal
window.openChildHistoryModal = function(childId) {
  const child = store.getChild(childId);
  const route = store.get().routes[childId] || [];

  openModal(
    `${child.name}'s day`,
    `
      <p class="modal__lede">Today's movements and safe-zone check-ins. History is kept for 30 days.</p>
      ${route.length ? `
        <ol class="timeline">
          ${route.map((pt, i) => `
            <li class="timeline__item ${i === route.length - 1 ? 'is-last' : ''}">
              <span class="timeline__time">${pt.time}</span>
              <span class="timeline__dot"></span>
              <div class="timeline__body">
                <div class="timeline__title">${clean(pt.label)}</div>
                <div class="timeline__sub mono">${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}</div>
              </div>
            </li>
          `).join('')}
        </ol>
      ` : `<div class="empty empty--compact"><span class="empty__icon">${icon('history', 22)}</span><p>No history recorded yet.</p></div>`}
    `,
    `
      <button class="btn btn--ghost" onclick="window.closeModal()">Close</button>
      <button class="btn btn--primary" onclick="window.showChildRoute('${childId}'); window.closeModal();">${icon('map', 15)} Replay on map</button>
    `
  );
};

// Call Parent Modal (Child Mode)
window.openCallParentModal = function() {
  const contacts = store.get().settings.emergencyContacts.slice(0, 3);
  openModal(
    'Who do you want to call?',
    `
      <div class="choices">
        ${contacts.map(c => `
          <button class="choice" onclick="window.callChildPhone('${clean(c.name).split(' (')[0]}'); window.closeModal();">
            <span class="choice__icon">${icon('phone', 18)}</span>
            <span class="choice__body">
              <span class="choice__title">${clean(c.name)}</span>
              <span class="choice__sub">${clean(c.relation)}</span>
            </span>
            ${icon('chevronRight', 16, 'choice__chev')}
          </button>
        `).join('')}
      </div>
    `,
    `<button class="btn btn--soft btn--block" onclick="window.closeModal()">Close</button>`,
    { size: 'sm' }
  );
};

// Safe places list (Child Mode)
window.openChildZonesModal = function() {
  const zones = store.get().safeZones.filter(z => !z.isRestricted);
  openModal(
    'Your safe places',
    `
      <p class="modal__lede">When you're at one of these places, Dad automatically knows you've arrived safely.</p>
      <div class="choices">
        ${zones.map(z => `
          <div class="choice choice--static">
            <span class="choice__icon choice__icon--safe">${zoneIcon(z.type, 18)}</span>
            <span class="choice__body">
              <span class="choice__title">${clean(z.name)}</span>
              <span class="choice__sub">${clean(z.activeSchedule)}</span>
            </span>
          </div>
        `).join('')}
      </div>
    `,
    `<button class="btn btn--soft btn--block" onclick="window.closeModal()">Close</button>`,
    { size: 'sm' }
  );
};

// Child Actions
window.childSendImSafe = function() {
  const childId = store.get().selectedChildId;
  store.recordCheckIn(childId);
  soundFx.playSafeChime();

  const notice = document.getElementById('child-toast-notice');
  if (notice) {
    notice.hidden = false;
    setTimeout(() => { notice.hidden = true; }, 4000);
  }

  showToast('Check-in sent', "Your parents know you're safe.", 'safe');
};

window.childShareLiveLocation = function() {
  const childId = store.get().selectedChildId;
  const child = store.getChild(childId);

  if ('geolocation' in navigator) {
    showToast('Finding you…', 'Getting your location', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const acc = Math.round(accuracy);
        store.updateUserLiveLocation({ lat: latitude, lng: longitude, accuracy: acc });
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
        showToast('Location shared', `Sent to Dad · accurate to ${acc} m`, 'safe');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        store.updateChild(childId, { lastUpdated: Date.now() });
        showToast('Location shared', `Sent your last known location (${clean(child.gpsAccuracy)})`, 'info');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  } else {
    store.updateChild(childId, { lastUpdated: Date.now() });
    showToast('Location shared', 'Sent to your guardians', 'safe');
  }
};

window.cancelChildSOS = function() {
  store.resolveSOS();
  soundFx.stopEmergencySOS();
  showToast('SOS cancelled', 'Your guardians were told it was a false alarm.', 'info');
};

window.resolveEmergencySOS = function() {
  store.resolveSOS();
  soundFx.stopEmergencySOS();
  showToast('Emergency resolved', 'Marked as handled.', 'safe');
};

// Settings
window.toggleNotificationSetting = function(key) {
  const settings = store.get().settings;
  // Settings added later may be missing from saved data: every alert type defaults to on (push defaults to off)
  const current = key === 'push' ? !!settings.notifications[key] : settings.notifications[key] !== false;
  settings.notifications[key] = !current;
  store.update({ settings: settings });
  showToast('Saved', 'Notification preferences updated.', 'info');
};

window.setLocationSharingMode = function(mode) {
  const settings = store.get().settings;
  settings.privacy.locationSharingMode = mode;
  store.update({ settings: settings });
  const labels = { always: 'Always on — continuous live tracking.', moving: 'While moving — updates when walking or travelling.', sos: 'Emergency only — shared when SOS is pressed.' };
  showToast('Location sharing', labels[mode] || 'Updated', 'info');
};

window.togglePushNotifications = async function(input) {
  const settings = store.get().settings;
  if (!input.checked) {
    settings.notifications.push = false;
    store.update({ settings });
    showToast('Push notifications off', 'You will still see alerts inside SafeHaven.', 'info');
    return;
  }
  if (typeof Notification === 'undefined') {
    input.checked = false;
    showToast('Not supported', 'This browser does not support notifications.', 'warning');
    return;
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  settings.notifications.push = permission === 'granted';
  store.update({ settings });
  if (permission === 'granted') {
    showToast('Push notifications on', 'You will be alerted even when SafeHaven is in the background.', 'safe');
    pushNotify('SafeHaven notifications are on', 'This is how safety alerts will appear on this device.', 'push-test');
  } else {
    showToast('Notifications blocked', 'Allow notifications for this site in your browser settings.', 'warning');
  }
};

window.childCallGuardian = function() {
  const parent = store.get().parent;
  showToast('Calling Dad', `Calling ${parent.name.split(' ')[0]} on ${parent.phone}…`, 'info');
};

window.updateRetentionPolicy = function(val) {
  const settings = store.get().settings;
  settings.privacy.historyRetentionDays = parseInt(val, 10);
  store.update({ settings: settings });
  const label = val === '0' ? 'History will not be kept.' : val === '1' ? 'History will be kept for 24 hours.' : `History will be kept for ${val} days.`;
  showToast('Saved', label, 'info');
};

window.purgeLocationHistory = function() {
  openModal(
    'Delete all location history?',
    `<p class="modal__lede">Every stored route and location trail for all children will be permanently deleted. This can't be undone.</p>`,
    `
      <button class="btn btn--ghost" onclick="window.closeModal()">Cancel</button>
      <button class="btn btn--danger" onclick="window.confirmPurgeHistory()">Delete history</button>
    `,
    { size: 'sm' }
  );
};

window.confirmPurgeHistory = function() {
  store.update({ routes: { c1: [], c2: [], c3: [] } });
  mapCtrl.renderSelectedChildRoute();
  closeModal();
  showToast('History deleted', 'All location trails were removed.', 'info');
};

window.exportDataJSON = function() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.get(), null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", "safehaven_family_data.json");
  dlAnchor.click();
  showToast('Export ready', 'Downloaded safehaven_family_data.json', 'safe');
};

// Map Style Switcher
window.changeMapStyle = function(style) {
  mapCtrl.setMapStyle(style);
};

// Live Hardware GPS & Jammu Hub Location Controllers
window.useMyCurrentLocation = function(targetRole = null) {
  if (!('geolocation' in navigator)) {
    showToast('Location unavailable', 'This browser does not support location.', 'warning');
    return;
  }

  showToast('Finding your location', 'Checking device GPS…', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const accRounded = Math.round(accuracy);

      store.updateUserLiveLocation({ lat: latitude, lng: longitude, accuracy: accRounded });

      if (!mapCtrl.map) {
        store.update({ activeParentTab: 'map', activeMode: 'parent' });
        setTimeout(() => {
          mapCtrl.renderLiveUserMarker();
          mapCtrl.goToLiveGPS();
        }, 200);
      } else {
        mapCtrl.renderLiveUserMarker();
        mapCtrl.goToLiveGPS();
      }

      if (targetRole === 'parent') {
        store.assignLiveLocationToParent();
        mapCtrl.renderParentMarker();
        showToast('Guardian location updated', `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'safe');
      } else if (targetRole === 'child') {
        const childId = store.get().selectedChildId;
        store.assignLiveLocationToChild(childId);
        mapCtrl.renderChildrenMarkers();
        showToast('Child location synced', `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'safe');
      } else {
        showToast('Location found', `${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E · ±${accRounded} m`, 'safe');
      }
    },
    (err) => {
      console.warn('Geolocation error:', err);
      let msg = 'Could not access your location. Allow location access in your browser.';
      if (err.code === 1) msg = 'Location permission was denied. Allow it from the address bar.';
      else if (err.code === 2) msg = 'GPS signal could not be acquired.';
      else if (err.code === 3) msg = 'Location request timed out. Try again.';
      showToast('Location unavailable', msg, 'warning');
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
};

window.goToJammuLocation = function() {
  mapCtrl.goToJammu();
};

window.setGuardianToLiveGPS = function() {
  const success = store.assignLiveLocationToParent();
  if (success) {
    mapCtrl.renderParentMarker();
    showToast('Guardian location set', 'Using your live GPS position.', 'safe');
  } else {
    window.useMyCurrentLocation('parent');
  }
};

window.setChildToLiveGPS = function() {
  const childId = store.get().selectedChildId;
  const success = store.assignLiveLocationToChild(childId);
  if (success) {
    mapCtrl.renderChildrenMarkers();
    showToast('Child location synced', 'Using your live GPS position.', 'safe');
  } else {
    window.useMyCurrentLocation('child');
  }
};

/* =========================================================
   Guardian Account (Google sign-in) Modal
   ========================================================= */

const GOOGLE_G = `
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.34 24 12 24z"/>
    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
  </svg>
`;

window.openGmailLoginModal = function() {
  const state = store.get();
  const auth = state.auth || { isAuthenticated: false, email: 'vansh.koul@gmail.com' };
  const name = auth.name || 'Vansh Koul';

  openModal(
    auth.isAuthenticated ? 'Guardian account' : 'Sign in',
    `
      ${auth.isAuthenticated ? `
        <div class="account">
          <span class="account__avatar">${name.charAt(0)}</span>
          <div class="account__body">
            <div class="account__name">${name}</div>
            <div class="account__email">${auth.email}</div>
            <div class="account__role">Primary guardian · Jammu, J&K</div>
          </div>
          <span class="pill pill--safe pill--xs"><i class="dot"></i>Active</span>
        </div>
        <button class="btn btn--danger-soft btn--block" onclick="window.logoutCurrentGmail();">${icon('logOut', 16)} Sign out</button>
        <div class="divider"><span>or switch account</span></div>
      ` : `
        <div class="signin-hero">
          <span class="signin-hero__mark">${icon('shieldCheck', 24)}</span>
          <p class="modal__lede">Sign in to see live locations, safe zones and alerts for your family.</p>
        </div>
      `}

      <button class="btn btn--google btn--block" onclick="window.loginAsDemoVansh()">
        ${GOOGLE_G}
        <span>Continue with Google</span>
      </button>

      <div class="divider"><span>or use email</span></div>

      <form onsubmit="window.handleGmailFormSubmit(event)" class="form">
        <label class="field">
          <span class="field__label">Email</span>
          <span class="input-wrap">
            ${icon('mail', 16)}
            <input type="email" id="gmail-input-id" class="input" placeholder="name@gmail.com" required value="${auth.email || 'vansh.koul@gmail.com'}" autocomplete="email" />
          </span>
        </label>
        <label class="field">
          <span class="field__label">Password</span>
          <span class="input-wrap">
            ${icon('lock', 16)}
            <input type="password" id="gmail-input-pwd" class="input" placeholder="Password" value="SafeHavenGuardian2026" required autocomplete="current-password" />
          </span>
        </label>
        <button type="submit" class="btn btn--primary btn--block btn--lg">Sign in</button>
      </form>
    `,
    '',
    { size: 'sm' }
  );
};

window.loginAsDemoVansh = function() {
  store.loginWithGmail('vansh.koul@gmail.com', 'Vansh Koul');
  window.closeModal();
  showToast('Signed in', 'Welcome back, Vansh.', 'safe');
};

window.handleGmailFormSubmit = function(e) {
  e.preventDefault();
  const emailInput = document.getElementById('gmail-input-id');
  if (!emailInput) return;
  const email = emailInput.value.trim();
  if (!email) return;

  let displayName = 'Vansh Koul';
  if (!email.toLowerCase().includes('vansh')) {
    const userPart = email.split('@')[0];
    displayName = userPart.charAt(0).toUpperCase() + userPart.slice(1);
  }

  store.loginWithGmail(email, displayName);
  window.closeModal();
  showToast('Signed in', email, 'safe');
};

window.logoutCurrentGmail = function() {
  store.logoutGmail();
  window.closeModal();
  showToast('Signed out', 'Sign in again to view your family.', 'info');
};

/* =========================================================
   PWA Installation & Service Worker Registration
   ========================================================= */

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.hidden = false;
});

window.promptPWAInstall = async function() {
  let prompted = false;
  if (deferredInstallPrompt) {
    try {
      await deferredInstallPrompt.prompt();
      prompted = true;
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('Installed', 'SafeHaven is now on your device.', 'safe');
      }
      deferredInstallPrompt = null;
    } catch (err) {
      // Browser refused the native prompt (e.g. no user gesture) — fall back to manual instructions
      console.warn('Install prompt unavailable:', err.message);
    }
  }
  if (!prompted) {
    openModal(
      'Install SafeHaven',
      `
        <p class="modal__lede">Install SafeHaven as an app for instant launch, offline support and background alerts.</p>
        <ol class="steps">
          <li><strong>Chrome or Edge (desktop)</strong><span>Click the install icon at the right of the address bar.</span></li>
          <li><strong>Safari (iPhone)</strong><span>Tap Share, then “Add to Home Screen”.</span></li>
          <li><strong>Chrome (Android)</strong><span>Open the ⋮ menu and choose “Install app”.</span></li>
        </ol>
      `,
      `<button class="btn btn--primary btn--block" onclick="window.closeModal()">Got it</button>`,
      { size: 'sm' }
    );
  }
};

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.hidden = true;
  showToast('Installed', 'SafeHaven is running as an app.', 'safe');
});

if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[SafeHaven] Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[SafeHaven] Service Worker registration skipped or failed:', err);
      });
  });
}

// -------------------------------------------------------------
// PROFILE PICKER
// -------------------------------------------------------------

window.selectChildProfile = function(childId) {
  store.update({ selectedChildId: childId });
  closeModal();
  const c = store.getChild(childId);
  if (c) showToast('Profile switched', `Now showing ${c.name}`, 'info');
};

window.openChildPickerModal = function() {
  const state = store.get();
  openModal(
    'Choose a child',
    `
      <div class="choices">
        ${state.children.map(c => `
          <button class="choice ${c.id === state.selectedChildId ? 'is-selected' : ''}" onclick="window.selectChildProfile('${c.id}')">
            <span class="avatar avatar--sm"><img src="${c.avatar}" alt="" /></span>
            <span class="choice__body">
              <span class="choice__title">${c.name}</span>
              <span class="choice__sub">${clean(c.grade) || `${c.age} years old`}</span>
            </span>
            ${c.id === state.selectedChildId ? icon('check', 18, 'choice__check') : ''}
          </button>
        `).join('')}
      </div>
    `,
    `<button class="btn btn--soft btn--block" onclick="window.closeModal()">Cancel</button>`,
    { size: 'sm' }
  );
};
