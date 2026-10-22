/* =========================================================
   SafeHaven - Line Icon Set
   One consistent 24px stroke icon family used across the UI
   ========================================================= */

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  map: '<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4z"/><path d="M9 4v13.5M15 6.5V20"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8.5 3 8.5H3S6 15 6 8"/><path d="M10.3 20a1.94 1.94 0 0 0 3.4 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6l-7-3z"/>',
  shieldCheck: '<path d="M12 3 5 6v5.5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  phone: '<path d="M21 16.4v2.8a1.9 1.9 0 0 1-2.1 1.9 18.8 18.8 0 0 1-8.2-2.9 18.5 18.5 0 0 1-5.7-5.7A18.8 18.8 0 0 1 2.1 4.2 1.9 1.9 0 0 1 4 2.1h2.8a1.9 1.9 0 0 1 1.9 1.6c.1.9.3 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L7.8 9.6a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.3 1.8.6 2.7.7a1.9 1.9 0 0 1 1.6 2z"/>',
  navigation: '<path d="M3 11 21 3l-8 18-2-8-8-2z"/>',
  pin: '<path d="M12 21s-7-5.6-7-11.5a7 7 0 0 1 14 0C19 15.4 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  signal: '<path d="M4 20v-3M9 20v-6M14 20v-9M19 20V5"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 19.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14v-3H5zM12 2v1.5M20.5 5.5l-1 1M3.5 5.5l1 1M22 12h-1.5M3.5 12H2"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userPlus: '<circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 13.3-6M19 14v6M16 17h6"/>',
  smartphone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  camera: '<path d="M14.5 5h-5L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-1.5-2z"/><circle cx="12" cy="13" r="3.5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  hardDrive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5.5 13 8 5h8l2.5 8"/><path d="M7 16.5h.01M10.5 16.5h.01"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 4.5 10 6-.5.8-1.6 2.2-3.1 3.5M6.6 6.6C4.4 8 2.8 10.1 2 12c1 1.5 5 6 10 6 1.7 0 3.3-.5 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
  school: '<path d="M22 9 12 4 2 9l10 5 10-5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  heart: '<path d="M19.5 12.6 12 20l-7.5-7.4A4.8 4.8 0 0 1 12 6.3a4.8 4.8 0 0 1 7.5 6.3z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12"/>',
  volumeX: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 11v2"/>',
  message: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-5.3A8.5 8.5 0 1 1 21 12z"/>',
  turnLeft: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  turnRight: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0-6 6v5"/>',
  straight: '<path d="M12 20V4M6 10l6-6 6 6"/>',
  flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
  car: '<path d="M5 17h14M6 17v2M18 17v2M4 13l2-5.5A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.5L20 13v4H4v-4z"/><path d="M4 13h16"/><path d="M7.5 15h.01M16.5 15h.01"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>'
};

export function icon(name, size = 18, extraClass = '') {
  const d = PATHS[name] || PATHS.info;
  return `<svg class="ic ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* Safe-zone type → icon */
export function zoneIcon(type, size = 18) {
  const map = { home: 'home', school: 'school', sports: 'trophy', family: 'heart', restricted: 'ban' };
  return icon(map[type] || 'pin', size);
}

/* Strip decorative emoji from data strings so copy stays typographically clean */
export function clean(str) {
  if (str == null) return '';
  return String(str)
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]\uFE0F?/gu, '')
    .replace(/\u200D/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/^[\s\-–—:•]+/, '')
    .trim();
}

/* "Wi-Fi 6 (Koul-Fiber-5G, 600 Mbps)" → "Wi-Fi 6" */
export function short(str) {
  return clean(str).split(' (')[0];
}

export function timeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const STATUS = {
  safe: { label: 'Safe', tone: 'safe', icon: 'shieldCheck' },
  attention: { label: 'Needs attention', tone: 'attention', icon: 'alert' },
  danger: { label: 'Emergency', tone: 'danger', icon: 'siren' },
  unknown: { label: 'Offline', tone: 'offline', icon: 'signal' }
};

export function statusOf(child) {
  return STATUS[child && child.safetyStatus] || STATUS.unknown;
}

/* Signal strength → 0-4 bars, parsed from strings like "5G (-74 dBm)", "5G (4 of 5 bars)", "Wi-Fi 6 (...)" */
export function signalLevel(signal) {
  const str = String(signal || '');
  const ofBars = str.match(/(\d)\s*of\s*(\d)/i);
  if (ofBars) return Math.max(0, Math.min(4, Math.round((Number(ofBars[1]) / Number(ofBars[2])) * 4)));
  const dbm = str.match(/-(\d{2,3})\s*dBm/i);
  if (dbm) {
    const v = -Number(dbm[1]);
    return v >= -80 ? 4 : v >= -90 ? 3 : v >= -100 ? 2 : 1;
  }
  if (/wi-?fi/i.test(str)) return 4;
  if (/no signal|offline/i.test(str)) return 0;
  return 3;
}

export function signalBars(signal) {
  const level = signalLevel(signal);
  return `<span class="bars bars--${level}" aria-label="Signal ${level} of 4">${[1, 2, 3, 4].map(i => `<i class="${i <= level ? 'on' : ''}"></i>`).join('')}</span>`;
}

/* "Dual L1+L5 GNSS (±1.8m)" → 1.8 (metres) */
export function accuracyMeters(str) {
  const m = String(str || '').match(/±\s*([\d.]+)\s*m/);
  return m ? Number(m[1]) : null;
}

/* Small battery meter: fill level + colour driven by CSS */
export function batteryMeter(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const level = p <= 15 ? 'low' : p <= 35 ? 'mid' : 'ok';
  return `<span class="batt batt--${level}" aria-label="${p}% battery"><span class="batt__fill" style="width:${p}%"></span></span>`;
}
