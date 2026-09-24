// Automated Node verification script for SafeHaven logic
const assert = require('assert');

// Mock browser globals for testing
global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, val) { this.data[key] = String(val); },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

async function runTests() {
  console.log('--- Starting SafeHaven Logic Test Suite ---');

  // Test 1: Distance calculation (Haversine)
  const { calculateDistance } = await import('./js/safetyEngine.js');
  // Distance in Jammu between Gandhi Nagar and DPS Jammu (~1.2 - 1.4 km)
  const dist = calculateDistance(32.7042, 74.8690, 32.7155, 74.8672);
  console.log(`[PASS] Haversine distance in Jammu: ${Math.round(dist)} meters`);
  assert(dist > 1000 && dist < 1600, 'Distance should be ~1260 meters');

  // Test 2: State manager initialized with children and safe zones in Jammu
  const { store } = await import('./js/state.js');
  const state = store.get();
  assert(state.children.length === 3, 'Should have 3 default children');
  assert(state.safeZones.length >= 6, 'Should have at least 6 default safe zones');
  console.log(`[PASS] State initialized with ${state.children.length} children and ${state.safeZones.length} safe zones in Jammu.`);

  // Test 3: Safety engine evaluation for Aarav at DPS Jammu
  const { safetyEngine } = await import('./js/safetyEngine.js');
  const aarav = store.getChild('c1');
  const evalResult = safetyEngine.evaluateChildSignals(aarav);
  console.log(`[PASS] Aarav evaluation status: ${evalResult.status}, reason: ${evalResult.reason}`);
  assert(evalResult.status === 'safe', 'Aarav should be safe at DPS Jammu');

  // Test 4: SOS Activation
  const sos = store.triggerSOS('c1');
  assert(sos.type === 'critical', 'SOS alert should have critical type');
  assert(store.get().activeSosAlert !== null, 'activeSosAlert should be set');
  console.log(`[PASS] SOS Triggered: ${sos.title} for ${sos.childName}`);

  // Test 5: Resolve SOS
  store.resolveSOS();
  assert(store.get().activeSosAlert === null, 'activeSosAlert should be cleared');
  console.log(`[PASS] SOS Resolved successfully.`);

  // Test 6: Check-in ("I'm Safe")
  const checkinAlert = store.recordCheckIn('c2', "Reached Gandhi Nagar safely!");
  assert(checkinAlert.type === 'info', 'Check-in should be info type');
  console.log(`[PASS] Check-in recorded: ${checkinAlert.title}`);

  // Test 7: Safe zone addition in Jammu
  const newZone = store.addSafeZone({
    name: 'Jammu Club & Sports Wing 🏸',
    icon: '🏸',
    type: 'sports',
    lat: 32.7120,
    lng: 74.8650,
    radius: 200,
    address: 'Near Tawi Bridge, Jammu',
    activeSchedule: 'Weekends',
    alertOnEntry: true,
    alertOnExit: true,
    isRestricted: false
  });
  assert(store.get().safeZones.some(z => z.id === newZone.id), 'New zone should be in safeZones list');
  console.log(`[PASS] Safe zone created: "${newZone.name}" with radius ${newZone.radius}m.`);

  // Test 8: Safe zone deletion
  store.deleteSafeZone(newZone.id);
  assert(!store.get().safeZones.some(z => z.id === newZone.id), 'Deleted zone should no longer exist');
  console.log(`[PASS] Safe zone deleted successfully.`);

  // Test 9: Live hardware GPS update & assignment
  store.updateUserLiveLocation({ lat: 32.7266, lng: 74.8570, accuracy: 8 });
  assert(store.get().userLiveLocation !== null, 'userLiveLocation should be set');
  assert(store.get().userLiveLocation.accuracy === 8, 'accuracy should be 8m');
  const assigned = store.assignLiveLocationToParent();
  assert(assigned === true, 'Should assign live GPS to parent');
  assert(store.get().parent.lat === 32.7266, 'Parent lat should match live GPS');
  console.log(`[PASS] Live GPS location updated and assigned to Guardian successfully.`);

  // Test 10: Guardian identity verification (Vansh Koul - Male / Father)
  const currentParent = store.get().parent;
  assert(currentParent.name === 'Vansh Koul', `Parent name should be 'Vansh Koul', got ${currentParent.name}`);
  assert(currentParent.gender === 'M', `Parent gender should be 'M', got ${currentParent.gender}`);
  assert(currentParent.role === 'Primary Guardian (Father)', `Parent role should be 'Primary Guardian (Father)', got ${currentParent.role}`);
  assert(currentParent.avatar.startsWith('data:image/svg+xml'), 'Parent avatar should be zero-upload inline SVG');
  console.log(`[PASS] Guardian correctly configured as male Father: "${currentParent.name}" with inline SVG avatar.`);

  // Test 11: Gmail Authentication Flow
  assert(store.get().auth.isAuthenticated === true, 'Default session should be authenticated');
  assert(store.get().auth.email === 'vansh.koul@gmail.com', 'Default session should be vansh.koul@gmail.com');
  
  // Test Logout
  store.logoutGmail();
  assert(store.get().auth.isAuthenticated === false, 'State should be unauthenticated after logout');
  console.log(`[PASS] Gmail Logout successfully clears auth session.`);

  // Test Custom Gmail Login
  store.loginWithGmail('custom.guardian@gmail.com', 'Custom Guardian');
  assert(store.get().auth.isAuthenticated === true, 'State should be authenticated after custom login');
  assert(store.get().auth.email === 'custom.guardian@gmail.com', 'State email should match logged in email');
  console.log(`[PASS] Custom Gmail login succeeded for custom.guardian@gmail.com`);

  // Restore Vansh Koul session
  store.loginWithGmail('vansh.koul@gmail.com', 'Vansh Koul');
  assert(store.get().parent.name === 'Vansh Koul', 'Parent should be restored to Vansh Koul');
  console.log(`[PASS] Restored session to Vansh Koul (vansh.koul@gmail.com).`);

  console.log('--- ALL 11 TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
