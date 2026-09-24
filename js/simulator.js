/* =========================================================
   SafeHaven - Scenario Simulator & Demo Controller
   Jammu, J&K Realistic Demonstration Scenarios
   ========================================================= */

import { store } from './state.js';
import { safetyEngine } from './safetyEngine.js';
import { soundFx } from './audioNotifier.js';
import { mapCtrl } from './mapController.js';

export class ScenarioSimulator {
  constructor() {
    this.activeScenario = '1';
  }

  /* -------------------------------------------------------------
     PRESET SCENARIOS
     ------------------------------------------------------------- */

  /* Scenario 1: Normal Routine */
  runScenario1() {
    this.activeScenario = '1';
    soundFx.stopEmergencySOS();

    store.updateChild('c1', {
      lat: 32.7155,
      lng: 74.8672,
      safetyStatus: 'safe',
      statusReason: 'Inside designated DPS Jammu Safe Zone during scheduled school hours.',
      battery: 78,
      batteryStatus: 'good',
      isOnline: true,
      lastUpdated: Date.now() - 60000,
      currentZoneId: 'z2'
    });

    store.addAlert({
      childId: 'c1',
      childName: 'Aarav',
      title: '🟢 Normal Status Restored',
      type: 'info',
      what: 'Aarav is inside Delhi Public School (DPS) Jammu safe zone (Residency Road).',
      evidence: 'GPS coordinates verified within 250m school geofence on Maharaja Hari Singh Marg.',
      severity: 'Normal',
      recommendedAction: 'No action needed.'
    });

    soundFx.playSafeChime();
    mapCtrl.locateChild('c1');
    this.showSimulatorToast('Scenario 1 Active: Normal School Day at DPS Jammu (Safe)');
  }

  /* Scenario 2: Safe Zone Exit */
  runScenario2() {
    this.activeScenario = '2';
    soundFx.stopEmergencySOS();

    // Move child ~550m west of DPS Jammu onto Jewel Chowk / Prem Nagar
    store.updateChild('c1', {
      lat: 32.7215,
      lng: 74.8635,
      safetyStatus: 'attention',
      statusReason: '⚠️ Exited DPS Jammu Safe Zone unexpectedly during school hours.',
      activity: 'Walking (3.8 km/h) heading towards Jewel Chowk',
      speed: 3.8,
      currentZoneId: null,
      lastUpdated: Date.now()
    });

    const alert = store.addAlert({
      childId: 'c1',
      childName: 'Aarav',
      title: '⚠️ Safe Zone Departure',
      type: 'warning',
      what: 'Aarav has left the DPS Jammu safe zone before dismissal.',
      evidence: 'Current location is 550m outside school geofence near Prem Nagar / Jewel Chowk. Scheduled dismissal is 02:30 PM (current: 01:15 PM).',
      severity: 'Medium (Warning)',
      recommendedAction: 'Contact Aarav (+91 98765 01420) or call DPS Jammu front desk (+91 191 2570480).',
      lat: 32.7215,
      lng: 74.8635
    });

    soundFx.playWarningBeep();
    mapCtrl.locateChild('c1');
    this.showSimulatorToast('Scenario 2 Active: Safe Zone Exit (Jewel Chowk)');
  }

  /* Scenario 3: Route Deviation & Low Battery (Multi-Signal Escalation) */
  runScenario3() {
    this.activeScenario = '3';
    soundFx.stopEmergencySOS();

    store.updateChild('c1', {
      lat: 32.7265,
      lng: 74.8710,
      safetyStatus: 'attention',
      statusReason: '⚠️ Significant route deviation + Critically low battery (9%).',
      battery: 9,
      batteryStatus: 'low',
      activity: 'In Vehicle (~35 km/h)',
      speed: 35,
      currentZoneId: null,
      lastUpdated: Date.now()
    });

    store.addAlert({
      childId: 'c1',
      childName: 'Aarav',
      title: '⚠️ Route Deviation & Low Battery',
      type: 'warning',
      what: 'Aarav has deviated 1.2 km off Gandhi Nagar home corridor towards Circular Road; battery at 9%.',
      evidence: 'Vehicle speed detected (35 km/h) heading along Circular Road instead of Bikram Chowk home route. Battery dropped to 9%. Cell tower: Jio 5G Old City.',
      severity: 'High (Elevated Multi-Signal Warning)',
      recommendedAction: 'Call Aarav immediately (+91 98765 01420) or check with driver.',
      lat: 32.7265,
      lng: 74.8710
    });

    soundFx.playWarningBeep();
    mapCtrl.locateChild('c1');
    this.showSimulatorToast('Scenario 3 Active: Route Deviation near Circular Road & Low Battery');
  }

  /* Scenario 4: Emergency SOS Triggered */
  runScenario4() {
    this.activeScenario = '4';
    store.triggerSOS('c1');
    soundFx.playEmergencySOS();
    mapCtrl.locateChild('c1');
    this.showSimulatorToast('Scenario 4 Active: 🚨 EMERGENCY SOS TRIGGERED');
  }

  /* Scenario 5: GPS Signal Lost / Subway / Tunnel */
  runScenario5() {
    this.activeScenario = '5';
    soundFx.stopEmergencySOS();

    store.updateChild('c1', {
      safetyStatus: 'unknown',
      statusReason: '⚪ Location unavailable. No GPS ping received for 14 minutes.',
      isOnline: false,
      lastUpdated: Date.now() - 840000, // 14 mins ago
      signal: 'No Signal',
      gpsAccuracy: 'Signal Lost'
    });

    store.addAlert({
      childId: 'c1',
      childName: 'Aarav',
      title: '⚪ Location Unavailable',
      type: 'warning',
      what: 'Aarav\'s phone has ceased transmitting location data for >10 minutes.',
      evidence: 'Last ping recorded at 03:10 PM near Bikram Chowk Flyover underpass. Device offline or battery drained.',
      severity: 'Medium (Notice)',
      recommendedAction: 'Wait 5 minutes for child to exit underpass area or call their phone directly (+91 98765 01420).'
    });

    soundFx.playWarningBeep();
    this.showSimulatorToast('Scenario 5 Active: Location Unavailable (Bikram Chowk Underpass)');
  }

  /* -------------------------------------------------------------
     MANUAL SENSOR INJECTIONS
     ------------------------------------------------------------- */
  triggerManualFall() {
    safetyEngine.simulateFallDetection(store.get().selectedChildId);
    this.showSimulatorToast('💥 Sensor Alert: Fall / Sudden Impact Detected');
  }

  triggerBatteryDrain() {
    const childId = store.get().selectedChildId;
    const child = store.getChild(childId);
    store.updateChild(childId, {
      battery: 6,
      batteryStatus: 'low'
    });

    store.addAlert({
      childId: child.id,
      childName: child.name,
      title: '🔋 Critical Battery (<10%)',
      type: 'warning',
      what: `${child.name}'s phone battery has dropped to 6%.`,
      evidence: 'Device telemetry reported battery level at 6%. Ultra power saving triggered.',
      severity: 'Medium',
      recommendedAction: 'Remind child to plug phone in or activate battery saver mode.'
    });

    soundFx.playWarningBeep();
    this.showSimulatorToast('🔋 Battery drained to 6%');
  }

  triggerChildCheckIn() {
    const childId = store.get().selectedChildId;
    store.recordCheckIn(childId, 'All good! Finished badminton practice at M.A. Stadium ❤️');
    soundFx.playSafeChime();
    this.showSimulatorToast('✅ Child check-in received: "I\'m Safe"');
  }

  resetAll() {
    store.resetToDefaults();
    soundFx.stopEmergencySOS();
    mapCtrl.renderSafeZones();
    mapCtrl.renderChildrenMarkers();
    mapCtrl.renderSelectedChildRoute();
    mapCtrl.renderLiveUserMarker();
    this.showSimulatorToast('🔄 Reset to default Jammu family state');
  }

  showSimulatorToast(message) {
    if (window.showToast) {
      window.showToast('Simulator', message, 'info');
    }
  }
}

export const simulator = new ScenarioSimulator();
