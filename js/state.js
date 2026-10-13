/* =========================================================
   SafeHaven - Central Application State Management
   Authentic Jammu, J&K Family Telemetry & Live GPS Geolocation
   ========================================================= */

const STORAGE_KEY = 'safehaven_state_v8'; // v8 Apple Screen Time UI refreshed schema

const INITIAL_STATE = {

  activeMode: 'parent', // 'parent' or 'child'
  activeParentTab: 'time-allowances', // 'time-allowances' | 'home' | 'map' | 'alerts' | 'zones' | 'children' | 'settings'
  selectedChildId: 'c1',
  isDeviceFrame: true, // Default to true for the iPhone product showcase view
  theme: 'light',
  isAudioMuted: false,
  mapStyle: 'google_streets', // 'google_streets' | 'google_hybrid' | 'google_terrain'

  // Apple Screen Time & Time Allowances
  timeAllowances: {
    activeDayType: 'weekdays', // 'weekdays' | 'weekends'
    c1: {
      weekdays: {
        sharedAllowanceMinutes: 60, // 1 hour
        categories: {
          entertainment: 60, // Up to 1 hour
          games: 60,         // Up to 1 hour
          socialMedia: 30,   // Up to 30m
          education: 120
        }
      },
      weekends: {
        sharedAllowanceMinutes: 120, // 2 hours
        categories: {
          entertainment: 90,
          games: 90,
          socialMedia: 60,
          education: 180
        }
      }
    }
  },

  // Gmail Authentication Session
  auth: {
    isAuthenticated: true,
    email: 'vansh.koul@gmail.com',
    name: 'Vansh Koul',
    role: 'Primary Guardian (Father)',
    provider: 'gmail',
    lastLogin: Date.now()
  },

  // Real-time hardware geolocation from user's browser/phone
  userLiveLocation: null, // { lat, lng, accuracy, timestamp, address }

  parent: {
    name: 'Vansh Koul',
    role: 'Primary Guardian (Father)',
    gender: 'M',
    avatar: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMxZTNhOGEiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMyNTYzZWIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0OCIgZmlsbD0idXJsKCNnKSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjQiLz48dGV4dCB4PSI1MCIgeT0iNjQiIGZvbnQtZmFtaWx5PSJzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNDQiIGZvbnQtd2VpZ2h0PSI5MDAiIGZpbGw9IiNmZmZmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlY8L3RleHQ+PGNpcmNsZSBjeD0iNzgiIGN5PSI3OCIgcj0iMTQiIGZpbGw9IiMxMGI5ODEiIHN0cm9rZT0iI2ZmZmZmZiIHN0cm9rZS13aWR0aD0iMyIvPjxwYXRoIGQ9Ik03NCA3OGwzIDMgNi02IiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMi41IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=',
    phone: '+91 98765 24810',
    email: 'vansh.koul@gmail.com',
    device: 'Apple iPhone 15 Pro Max (iOS 18.2)',
    carrier: 'Jio True 5G (VoNR)',
    lat: 32.7065,
    lng: 74.8785,
    address: 'Bahu Plaza Commercial Hub, Rail Head, Jammu, J&K 180012'
  },

  children: [
    {
      id: 'c1',
      name: 'Anneliese',
      age: 10,
      gender: 'F',
      avatar: 'assets/avatars/anaya.jpg',
      grade: '5th Grade • Delhi Public School (DPS) Jammu',
      color: '#2563eb',
      device: 'Apple iPhone 15 Pro (128GB, Natural Titanium)',
      os: 'iOS 18.2 (22C152)',
      carrier: 'Jio True 5G (VoNR, 850 Mbps)',
      battery: 78,
      batteryStatus: 'good',
      batteryDetail: '-3% in last hour • ~7h 20m remaining',
      signal: '5G (-74 dBm)',
      wifi: 'DPS-Student-Secure',
      gpsAccuracy: 'Dual L1+L5 GNSS (±1.8m)',
      activity: 'In Class (Middle Wing) • Stationary (42 min)',
      speed: 0,
      steps: 4280,
      elevation: '320m',
      lat: 32.7155,
      lng: 74.8672,
      heading: 90,
      lastUpdated: Date.now() - 90000, // 1.5 mins ago
      safetyStatus: 'safe', // 'safe' | 'attention' | 'danger' | 'unknown'
      statusReason: 'Inside DPS Jammu campus safe zone (Residency Road). Classes active until 2:30 PM.',
      currentZoneId: 'z2',
      isOnline: true,
      lastCheckInTime: Date.now() - 1800000,
      pairingCode: '749201',
      phone: '+91 98765 01420'
    },
    {
      id: 'c2',
      name: 'Anaya',
      age: 8,
      gender: 'F',
      avatar: 'assets/avatars/anaya.jpg',
      grade: '3rd Grade • Presentation Convent Sr. Sec. School, Jammu',
      color: '#f59e0b',
      device: 'Google Pixel 8a (Bay Blue, 128GB)',
      os: 'Android 15 (AP4A.241205)',
      carrier: 'Airtel 5G Plus',
      battery: 44,
      batteryStatus: 'mid',
      batteryDetail: 'Normal discharge rate • ~4h 15m remaining',
      signal: '5G (4 of 5 bars)',
      wifi: 'Cellular Data',
      gpsAccuracy: 'GNSS ±2.8m',
      activity: 'Walking on Church Road towards Gole Market (3.2 km/h)',
      speed: 3.2,
      steps: 5820,
      elevation: '315m',
      lat: 32.7052,
      lng: 74.8705,
      heading: 85,
      lastUpdated: Date.now() - 45000, // 45s ago
      safetyStatus: 'attention',
      statusReason: 'Outside safe zones. Walking east along Church Road towards Gole Market, Gandhi Nagar.',
      currentZoneId: null,
      isOnline: true,
      lastCheckInTime: Date.now() - 5400000,
      pairingCode: '318942',
      phone: '+91 98765 01421'
    },
    {
      id: 'c3',
      name: 'Kabir',
      age: 14,
      gender: 'M',
      avatar: 'assets/avatars/kabir.jpg',
      grade: '9th Grade • Model Academy / University Campus, Jammu',
      color: '#10b981',
      device: 'Samsung Galaxy S24 Ultra (Titanium Gray)',
      os: 'Android 15 / One UI 7.0',
      carrier: 'Jio True 5G',
      battery: 88,
      batteryStatus: 'good',
      batteryDetail: 'Fast Charging on 65W Super Fast • 98% in 15 min',
      signal: 'Wi-Fi 6 (Koul-Fiber-5G, 600 Mbps)',
      wifi: 'Koul-Fiber-5G',
      gpsAccuracy: 'Wi-Fi + GNSS ±1.2m',
      activity: 'At Home (Study Room) • Preparing for CBSE Exams',
      speed: 0,
      steps: 5410,
      elevation: '318m',
      lat: 32.7042,
      lng: 74.8690,
      heading: 0,
      lastUpdated: Date.now() - 180000, // 3 mins ago
      safetyStatus: 'safe',
      statusReason: 'Resting inside Home Safe Zone (Sector 3, Gandhi Nagar, Jammu).',
      currentZoneId: 'z1',
      isOnline: true,
      lastCheckInTime: Date.now() - 3600000,
      pairingCode: '592184',
      phone: '+91 98765 01422'
    }
  ],

  safeZones: [
    {
      id: 'z1',
      name: 'Koul Residence (Home)',
      icon: '🏠',
      type: 'home',
      lat: 32.7042,
      lng: 74.8690,
      radius: 180,
      address: 'Sector 3, Gandhi Nagar, Jammu, J&K 180004',
      activeSchedule: 'All-Day (24/7)',
      alertOnEntry: true,
      alertOnExit: true,
      isRestricted: false
    },
    {
      id: 'z2',
      name: 'Delhi Public School (DPS) Jammu',
      icon: '🏫',
      type: 'school',
      lat: 32.7155,
      lng: 74.8672,
      radius: 250,
      address: 'Maharaja Hari Singh Marg, Residency Road, Jammu 180001',
      activeSchedule: 'Mon–Sat 08:00 AM – 02:30 PM',
      alertOnEntry: true,
      alertOnExit: true,
      isRestricted: false
    },
    {
      id: 'z3',
      name: 'Maulana Azad (M.A.) Stadium & Sports Complex',
      icon: '🏟️',
      type: 'sports',
      lat: 32.7230,
      lng: 74.8610,
      radius: 240,
      address: 'Near Jewel Chowk & Prem Nagar, Jammu 180001',
      activeSchedule: 'Tue & Thu 04:00 PM – 06:30 PM',
      alertOnEntry: true,
      alertOnExit: true,
      isRestricted: false
    },
    {
      id: 'z4',
      name: 'Bahu Fort & Bagh-e-Bahu Garden',
      icon: '🏰',
      type: 'family',
      lat: 32.7285,
      lng: 74.8790,
      radius: 220,
      address: 'Bagh-e-Bahu, Near Har-Ki-Pauri, Jammu 180006',
      activeSchedule: 'Weekends & Family Visits',
      alertOnEntry: true,
      alertOnExit: true,
      isRestricted: false
    },
    {
      id: 'z5',
      name: 'Presentation Convent School & Tutoring Center',
      icon: '📚',
      type: 'school',
      lat: 32.7058,
      lng: 74.8715,
      radius: 180,
      address: 'Sector 2, Near Church Road, Gandhi Nagar, Jammu 180004',
      activeSchedule: 'Mon–Fri 08:00 AM – 02:00 PM',
      alertOnEntry: true,
      alertOnExit: true,
      isRestricted: false
    },
    {
      id: 'z6',
      name: 'Tawi River Edge (Gujjar Nagar Waterfront)',
      icon: '⚠️',
      type: 'restricted',
      lat: 32.7270,
      lng: 74.8685,
      radius: 220,
      address: 'Tawi River Bank / Gujjar Nagar Waterfront, Jammu (Restricted Water Shoreline)',
      activeSchedule: 'Always active',
      alertOnEntry: true,
      alertOnExit: false,
      isRestricted: true
    }
  ],

  alerts: [
    {
      id: 'alt-1',
      childId: 'c2',
      childName: 'Anaya',
      title: 'Safe Zone Departure — Presentation Convent',
      type: 'warning',
      timestamp: Date.now() - 720000, // 12 mins ago
      what: 'Anaya departed Presentation Convent School campus after class.',
      evidence: 'L1+L5 GNSS placed device 160m outside school gate onto Church Road towards Gole Market at 3.2 km/h.',
      severity: 'Medium (Warning)',
      recommendedAction: 'Verify Anaya is walking home with guardian or call phone (+91 98765 01421).',
      isRead: false,
      isDismissed: false,
      lat: 32.7052,
      lng: 74.8705
    },
    {
      id: 'alt-2',
      childId: 'c1',
      childName: 'Aarav',
      title: 'Arrived at DPS Jammu',
      type: 'info',
      timestamp: Date.now() - 14400000, // 4 hours ago
      what: 'Aarav verified inside DPS Jammu campus courtyard.',
      evidence: 'Entered school perimeter at 08:18 AM via Maharaja Hari Singh Marg gate. Connected to campus Wi-Fi (DPS-Student-Secure).',
      severity: 'Normal (Verified Arrival)',
      recommendedAction: 'No action needed. Classes active until 2:30 PM.',
      isRead: true,
      isDismissed: false,
      lat: 32.7155,
      lng: 74.8672
    },
    {
      id: 'alt-3',
      childId: 'c3',
      childName: 'Kabir',
      title: "✅ Check-in: I'm Safe",
      type: 'info',
      timestamp: Date.now() - 3600000,
      what: 'Kabir confirmed: "Arrived home in Gandhi Nagar. Starting physics revision ❤️"',
      evidence: 'Manual check-in confirmed on Galaxy S24 at Sector 3, Gandhi Nagar. Battery: 88%. Verified home fiber Wi-Fi.',
      severity: 'Normal (Safe)',
      recommendedAction: 'No action needed.',
      isRead: true,
      isDismissed: false,
      lat: 32.7042,
      lng: 74.8690
    }
  ],

  routes: {
    c1: [
      { lat: 32.7042, lng: 74.8690, time: '07:45 AM', label: 'Sector 3, Gandhi Nagar (Home Departure)' },
      { lat: 32.7102, lng: 74.8686, time: '07:55 AM', label: 'Bikram Chowk Junction' },
      { lat: 32.7135, lng: 74.8675, time: '08:05 AM', label: 'Tawi River Bridge Crossing' },
      { lat: 32.7148, lng: 74.8670, time: '08:12 AM', label: 'Residency Road Turn' },
      { lat: 32.7155, lng: 74.8672, time: '08:18 AM', label: 'DPS Jammu Main Gate' }
    ],
    c2: [
      { lat: 32.7058, lng: 74.8715, time: '03:40 PM', label: 'Presentation Convent (Departure)' },
      { lat: 32.7052, lng: 74.8705, time: '03:52 PM', label: 'Church Road / Apsara Road' },
      { lat: 32.7045, lng: 74.8698, time: '04:05 PM', label: 'Near Gole Market, Gandhi Nagar' }
    ],
    c3: [
      { lat: 32.7042, lng: 74.8690, time: '03:30 PM', label: 'Sector 3, Gandhi Nagar (Desk Study)' }
    ]
  },

  settings: {
    notifications: {
      emergencyAlerts: true, // forced on
      safeZoneAlerts: true,
      batteryAlerts: true,
      arrivalDeparture: true,
      locationUnavailable: true
    },
    privacy: {
      historyRetentionDays: 30,
      explicitConsentGranted: true,
      allowLiveSharing: true,
      noCovertSurveillanceNotice: true
    },
    emergencyContacts: [
      { name: 'Vansh Koul (Father)', phone: '+91 98765 24810', relation: 'Primary Guardian', notifySOS: true },
      { name: 'Sunita Koul (Mother)', phone: '+91 98765 24811', relation: 'Secondary Guardian', notifySOS: true },
      { name: 'Kavita Koul (Aunt)', phone: '+91 98765 89020', relation: 'Trusted Family in Gandhi Nagar', notifySOS: true },
      { name: 'DPS Jammu Main Office', phone: '+91 191 2570480', relation: 'School Administration', notifySOS: false },
      { name: 'National Emergency Helpline (112)', phone: '112', relation: 'Police / Ambulance / Disaster Management', notifySOS: true },
      { name: 'Childline India (1098)', phone: '1098', relation: '24/7 Child Emergency Care', notifySOS: true }
    ],
    auditLog: [
      { timestamp: Date.now() - 3600000, action: 'Safe zone updated', details: 'DPS Jammu perimeter adjusted to 250m' },
      { timestamp: Date.now() - 7200000, action: 'Child linked', details: 'Aarav iPhone 15 Pro paired via biometric guardian approval' },
      { timestamp: Date.now() - 86400000, action: 'Privacy setting confirmed', details: 'End-to-end encrypted telemetry active' }
    ]
  },

  activeSosAlert: null
};

class StateManager {
  constructor() {
    this.listeners = [];
    this.state = this._loadState();
  }

  _loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.children) && parsed.children.length > 0) {
          const merged = {
            ...INITIAL_STATE,
            ...parsed,
            auth: { ...INITIAL_STATE.auth, ...(parsed.auth || {}) },
            parent: { ...INITIAL_STATE.parent, ...(parsed.parent || {}) },
            settings: { ...INITIAL_STATE.settings, ...(parsed.settings || {}) },
            children: parsed.children,
            safeZones: (Array.isArray(parsed.safeZones) && parsed.safeZones.length > 0) ? parsed.safeZones : INITIAL_STATE.safeZones,
            alerts: Array.isArray(parsed.alerts) ? parsed.alerts : INITIAL_STATE.alerts
          };
          merged.parent.avatar = INITIAL_STATE.parent.avatar;
          return merged;
        }
      }
    } catch (e) {
      console.warn('Could not parse saved state, using default:', e);
    }
    return JSON.parse(JSON.stringify(INITIAL_STATE));
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Could not save state to localStorage:', e);
    }
    this._notify();
  }

  get() {
    return this.state;
  }

  update(partial) {
    this.state = { ...this.state, ...partial };
    this.save();
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  _notify() {
    this.listeners.forEach(fn => {
      try {
        fn(this.state);
      } catch (err) {
        console.error('State subscriber error:', err);
      }
    });
  }

  getChild(id) {
    return this.state.children.find(c => c.id === id) || this.state.children[0];
  }

  updateChild(id, partial) {
    this.state.children = this.state.children.map(child => {
      if (child.id === id) {
        return { ...child, ...partial };
      }
      return child;
    });
    this.save();
  }

  addAlert(alert) {
    const newAlert = {
      id: 'alt-' + Date.now(),
      timestamp: Date.now(),
      isRead: false,
      isDismissed: false,
      ...alert
    };
    this.state.alerts.unshift(newAlert);
    this.save();
    return newAlert;
  }

  dismissAlert(alertId) {
    this.state.alerts = this.state.alerts.map(a => {
      if (a.id === alertId) return { ...a, isDismissed: true };
      return a;
    });
    this.save();
  }

  markAlertRead(alertId) {
    this.state.alerts = this.state.alerts.map(a => {
      if (a.id === alertId) return { ...a, isRead: true };
      return a;
    });
    this.save();
  }

  addSafeZone(zone) {
    const newZone = {
      id: 'z' + Date.now(),
      ...zone
    };
    this.state.safeZones.push(newZone);
    this.state.settings.auditLog.unshift({
      timestamp: Date.now(),
      action: 'Safe zone created',
      details: `Created safe zone "${newZone.name}" (${newZone.radius}m radius)`
    });
    this.save();
    return newZone;
  }

  deleteSafeZone(zoneId) {
    const target = this.state.safeZones.find(z => z.id === zoneId);
    this.state.safeZones = this.state.safeZones.filter(z => z.id !== zoneId);
    if (target) {
      this.state.settings.auditLog.unshift({
        timestamp: Date.now(),
        action: 'Safe zone deleted',
        details: `Deleted safe zone "${target.name}"`
      });
    }
    this.save();
  }

  triggerSOS(childId) {
    const child = this.getChild(childId);
    const sosAlert = {
      id: 'sos-' + Date.now(),
      childId: child.id,
      childName: child.name,
      title: '🚨 EMERGENCY SOS ACTIVATED',
      type: 'critical',
      timestamp: Date.now(),
      battery: child.battery,
      lat: child.lat,
      lng: child.lng,
      what: `${child.name} manually activated Emergency SOS on ${child.device}!`,
      evidence: `Hardware emergency trigger at (${child.lat.toFixed(4)}° N, ${child.lng.toFixed(4)}° E). Battery: ${child.battery}%. Dual-frequency GNSS accuracy: ±1.8m. First responders alerted (112 Standby).`,
      severity: 'Critical (Priority 1 Emergency)',
      recommendedAction: `Call ${child.name} immediately (${child.phone}) or contact Jammu 112 emergency dispatch.`
    };

    this.updateChild(child.id, {
      safetyStatus: 'danger',
      statusReason: '🚨 Emergency SOS button activated by child.'
    });

    this.addAlert(sosAlert);
    this.state.activeSosAlert = sosAlert;
    this.save();
    return sosAlert;
  }

  resolveSOS() {
    if (this.state.activeSosAlert) {
      const childId = this.state.activeSosAlert.childId;
      this.updateChild(childId, {
        safetyStatus: 'safe',
        statusReason: 'Emergency resolved by Guardian.'
      });
      this.state.settings.auditLog.unshift({
        timestamp: Date.now(),
        action: 'SOS Resolved',
        details: `Guardian resolved SOS for child ${this.state.activeSosAlert.childName}`
      });
      this.state.activeSosAlert = null;
      this.save();
    }
  }

  recordCheckIn(childId, message = "I'm Safe!") {
    const child = this.getChild(childId);
    const now = Date.now();
    this.updateChild(childId, {
      lastCheckInTime: now,
      lastUpdated: now,
      statusReason: `Check-in received: "${message}"`
    });

    const alert = this.addAlert({
      childId: child.id,
      childName: child.name,
      title: "✅ Check-in: I'm Safe",
      type: 'info',
      what: `${child.name} confirmed safe check-in: "${message}"`,
      evidence: `Manual confirmation sent from ${child.device}. Battery: ${child.battery}%. Cellular: ${child.carrier}. GPS: Live GNSS fix.`,
      severity: 'Normal (Safe)',
      recommendedAction: 'No action required.'
    });

    return alert;
  }

  /* Live Hardware Geolocation Integration */
  updateUserLiveLocation(coords) {
    this.state.userLiveLocation = {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: Math.round(coords.accuracy || 10),
      timestamp: Date.now(),
      address: coords.address || `Live Device GPS (${coords.lat.toFixed(4)}° N, ${coords.lng.toFixed(4)}° E)`
    };
    this.save();
  }

  assignLiveLocationToParent() {
    if (!this.state.userLiveLocation) return false;
    this.state.parent = {
      ...this.state.parent,
      lat: this.state.userLiveLocation.lat,
      lng: this.state.userLiveLocation.lng,
      address: `My Live GPS Location (Accuracy: ±${this.state.userLiveLocation.accuracy}m)`
    };
    this.save();
    return true;
  }

  assignLiveLocationToChild(childId) {
    if (!this.state.userLiveLocation) return false;
    const child = this.getChild(childId);
    this.updateChild(childId, {
      lat: this.state.userLiveLocation.lat,
      lng: this.state.userLiveLocation.lng,
      gpsAccuracy: `Live Device GPS ±${this.state.userLiveLocation.accuracy}m`,
      lastUpdated: Date.now(),
      statusReason: `Live location synced with device GPS (±${this.state.userLiveLocation.accuracy}m).`
    });
    return true;
  }

  /* Gmail Authentication Handlers */
  loginWithGmail(email, name = 'Vansh Koul') {
    this.state.auth = {
      isAuthenticated: true,
      email: email,
      name: name,
      role: 'Primary Guardian (Father)',
      provider: 'gmail',
      lastLogin: Date.now()
    };
    this.state.parent.name = name;
    this.state.parent.email = email;
    this.state.settings.auditLog.unshift({
      timestamp: Date.now(),
      action: 'Guardian Logged In',
      details: `Authenticated via Gmail: ${email}`
    });
    this.save();
  }

  logoutGmail() {
    this.state.auth.isAuthenticated = false;
    this.state.settings.auditLog.unshift({
      timestamp: Date.now(),
      action: 'Guardian Logged Out',
      details: `Session closed for ${this.state.auth.email}`
    });
    this.save();
  }

  /* Apple Screen Time & Time Allowances Handlers */
  setTimeAllowanceDayType(dayType) {
    const current = this.state.timeAllowances || {};
    this.update({
      timeAllowances: {
        ...current,
        activeDayType: dayType
      }
    });
  }

  updateSharedAllowance(childId, minutes) {
    const current = this.state.timeAllowances || {};
    const childIdKey = childId || this.state.selectedChildId || 'c1';
    const childSettings = current[childIdKey] || {
      weekdays: { sharedAllowanceMinutes: 60, categories: { entertainment: 60, games: 60, socialMedia: 30, education: 120 } },
      weekends: { sharedAllowanceMinutes: 120, categories: { entertainment: 90, games: 90, socialMedia: 60, education: 180 } }
    };
    const activeDay = current.activeDayType || 'weekdays';
    if (!childSettings[activeDay]) childSettings[activeDay] = { sharedAllowanceMinutes: 60, categories: {} };
    childSettings[activeDay].sharedAllowanceMinutes = Math.max(0, Math.min(360, parseInt(minutes, 10)));

    this.update({
      timeAllowances: {
        ...current,
        [childIdKey]: childSettings
      }
    });
  }

  updateCategoryAllowance(childId, categoryKey, deltaMinutes) {
    const current = this.state.timeAllowances || {};
    const childIdKey = childId || this.state.selectedChildId || 'c1';
    const childSettings = current[childIdKey] || {
      weekdays: { sharedAllowanceMinutes: 60, categories: { entertainment: 60, games: 60, socialMedia: 30, education: 120 } },
      weekends: { sharedAllowanceMinutes: 120, categories: { entertainment: 90, games: 90, socialMedia: 60, education: 180 } }
    };
    const activeDay = current.activeDayType || 'weekdays';
    if (!childSettings[activeDay]) childSettings[activeDay] = { sharedAllowanceMinutes: 60, categories: {} };
    const cats = childSettings[activeDay].categories || { entertainment: 60, games: 60, socialMedia: 30 };
    const currentVal = cats[categoryKey] !== undefined ? cats[categoryKey] : 60;
    const newVal = Math.max(0, Math.min(360, currentVal + deltaMinutes));
    cats[categoryKey] = newVal;
    childSettings[activeDay].categories = cats;

    this.update({
      timeAllowances: {
        ...current,
        [childIdKey]: childSettings
      }
    });
  }

  resetToDefaults() {
    this.state = JSON.parse(JSON.stringify(INITIAL_STATE));
    this.save();
  }
}

export const store = new StateManager();
