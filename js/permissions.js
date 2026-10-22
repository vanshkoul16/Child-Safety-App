/* =========================================================
   SafeHaven - Device Permissions, SOS Capture & Fall Detection
   One setup sheet for every permission the app relies on.
   Camera and microphone are only ever used while an SOS is active.
   ========================================================= */

import { store } from './state.js';
import { icon } from './icons.js';

const SETUP_KEY = 'safehaven_permissions_setup_v1';
const SOS_CLIP_MS = 60000;
const FALL_THRESHOLD = 30; // m/s², roughly 3 g

const PERMISSIONS = [
  { id: 'location', icon: 'pin', title: 'Location', desc: 'Shows where you are on the family map and is sent with every SOS.' },
  { id: 'notifications', icon: 'bell', title: 'Notifications', desc: 'Safety alerts even when SafeHaven is in the background.' },
  { id: 'media', icon: 'camera', title: 'Camera & microphone', desc: 'Only used while an SOS is active, to record what is happening. Never otherwise.' },
  { id: 'motion', icon: 'activity', title: 'Motion sensors', desc: 'Lets SafeHaven notice a hard fall and offer help.' },
  { id: 'storage', icon: 'hardDrive', title: 'Keep data on this device', desc: 'Stops the browser from clearing safety data when space runs low.' }
];

// Order for "Allow all": prompts that need a fresh tap (iOS motion, Safari notifications) go first
const ALLOW_ALL_ORDER = ['motion', 'notifications', 'location', 'media', 'storage'];

let motionAnswer = null; // iOS cannot be queried, so remember this session's answer
let storageAnswer = null; // Chrome decides persistence silently; a refusal cannot be re-asked

async function queryState(name) {
  try {
    const status = await navigator.permissions.query({ name });
    return status.state;
  } catch (e) {
    return 'prompt';
  }
}

async function statusOf(id) {
  switch (id) {
    case 'location':
      if (!('geolocation' in navigator)) return 'unsupported';
      return queryState('geolocation');
    case 'notifications':
      if (typeof Notification === 'undefined') return 'unsupported';
      return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    case 'media': {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unsupported';
      const [cam, mic] = await Promise.all([queryState('camera'), queryState('microphone')]);
      if (cam === 'denied' || mic === 'denied') return 'denied';
      return cam === 'granted' && mic === 'granted' ? 'granted' : 'prompt';
    }
    case 'motion':
      if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
      if (typeof DeviceMotionEvent.requestPermission === 'function') return motionAnswer || 'prompt';
      return matchMedia('(pointer: coarse)').matches ? 'granted' : 'unsupported';
    case 'storage':
      if (!navigator.storage || !navigator.storage.persist) return 'unsupported';
      return (await navigator.storage.persisted()) ? 'granted' : storageAnswer || 'prompt';
  }
  return 'unsupported';
}

async function requestPermission(id) {
  try {
    switch (id) {
      case 'location':
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            store.updateUserLiveLocation({ lat: latitude, lng: longitude, accuracy });
            resolve();
          }, resolve, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        });
        break;
      case 'notifications':
        if ((await Notification.requestPermission()) === 'granted') {
          const settings = store.get().settings;
          settings.notifications.push = true;
          store.update({ settings });
        }
        break;
      case 'media': {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach((t) => t.stop());
        break;
      }
      case 'motion':
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          motionAnswer = await DeviceMotionEvent.requestPermission();
        }
        startFallDetection();
        break;
      case 'storage':
        storageAnswer = (await navigator.storage.persist()) ? 'granted' : 'denied';
        break;
    }
  } catch (e) {
    console.warn(`Permission request failed (${id}):`, e);
  }
}

/* ---------- Setup sheet ---------- */

function statusControl(id, state) {
  if (state === 'granted') return `<span class="pill pill--safe">${icon('check', 13)} Allowed</span>`;
  if (state === 'denied') return id === 'storage' ? `<span class="pill pill--neutral">Not granted</span>` : `<span class="pill pill--danger">Blocked</span>`;
  if (state === 'unsupported') return `<span class="pill pill--neutral">Not on this device</span>`;
  return `<button class="btn btn--soft btn--sm" onclick="window.allowPermission('${id}')">Allow</button>`;
}

async function renderSheet() {
  const body = document.querySelector('#global-modal-overlay .modal__body');
  const foot = document.querySelector('#global-modal-overlay .modal__foot');
  if (!body || !body.querySelector('[data-permission-sheet]')) return;

  const states = await Promise.all(PERMISSIONS.map((p) => statusOf(p.id)));
  const rows = PERMISSIONS.map((p, i) => `
    <div class="row">
      <span class="row__icon">${icon(p.icon, 18)}</span>
      <div class="row__body">
        <div class="row__title">${p.title}</div>
        <div class="row__sub">${p.desc}</div>
      </div>
      <div class="row__actions">${statusControl(p.id, states[i])}</div>
    </div>
  `).join('');

  body.querySelector('[data-permission-rows]').innerHTML = rows;
  const pending = states.some((s) => s === 'prompt');
  foot.innerHTML = pending
    ? `<button class="btn btn--ghost" onclick="window.closeModal()">Not now</button>
       <button class="btn btn--primary" onclick="window.allowAllPermissions()">Allow all</button>`
    : `<button class="btn btn--primary" onclick="window.closeModal()">Done</button>`;
}

export function needsPermissionSetup() {
  try {
    return !localStorage.getItem(SETUP_KEY);
  } catch (e) {
    return false;
  }
}

export function openPermissionSetup({ openModal, onClose } = {}) {
  openModal(
    'Allow safety permissions',
    `<div data-permission-sheet>
      <p class="modal__lede">SafeHaven needs a few permissions to keep your family safe. Your browser will ask you to confirm each one.</p>
      <div class="card card--flush" data-permission-rows></div>
      <p class="fine">The screen also stays on during an SOS. Blocked permissions can be turned back on from the icon next to the address bar.</p>
    </div>`,
    `<button class="btn btn--primary" disabled>Checking…</button>`,
    {
      onClose: () => {
        try { localStorage.setItem(SETUP_KEY, String(Date.now())); } catch (e) { /* private mode */ }
        if (onClose) onClose();
      }
    }
  );
  renderSheet();
}

window.allowPermission = async function(id) {
  await requestPermission(id);
  renderSheet();
};

window.allowAllPermissions = async function() {
  for (const id of ALLOW_ALL_ORDER) {
    if ((await statusOf(id)) === 'prompt') await requestPermission(id);
  }
  renderSheet();
};

/* ---------- Fall detection ---------- */

let fallListening = false;
let lastFall = 0;

export function startFallDetection() {
  if (fallListening || typeof DeviceMotionEvent === 'undefined') return;
  fallListening = true;
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const state = store.get();
    if (Math.hypot(a.x, a.y, a.z) < FALL_THRESHOLD || state.activeMode !== 'child' || state.activeSosAlert) return;
    if (Date.now() - lastFall < 30000) return;
    lastFall = Date.now();
    window.showToast('Hard fall detected', 'Are you okay? Press and hold SOS if you need help.', 'critical');
  });
}

/* ---------- SOS capture: screen wake lock + time-limited recording ---------- */

let active = false;
let recorder = null;
let stopTimer = null;
let wakeLock = null;

async function keepScreenOn() {
  try {
    if (navigator.wakeLock && active && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* not supported or battery saver */ }
}
document.addEventListener('visibilitychange', () => { if (active && !wakeLock) keepScreenOn(); });

export const sosCapture = {
  clips: {}, // alertId -> object URL, kept in memory for this session only

  async start(alert, { record }) {
    if (active) return;
    active = true;
    keepScreenOn();
    if (!record || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'environment' } });
    } catch (e) {
      return; // permission refused: the SOS still goes out without a recording
    }
    if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }

    const chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (chunks.length) {
        this.clips[alert.id] = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      }
      recorder = null;
      store.update({ sosRecording: false });
    };
    recorder.start(1000);
    store.update({ sosRecording: true });
    stopTimer = setTimeout(() => this.stopRecording(), SOS_CLIP_MS);
  },

  stopRecording() {
    clearTimeout(stopTimer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  },

  stop() {
    active = false;
    this.stopRecording();
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
};
