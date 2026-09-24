/* =========================================================
   SafeHaven - Safety Intelligence Engine
   Explainable multi-signal danger detection & geofencing
   ========================================================= */

import { store } from './state.js';
import { soundFx } from './audioNotifier.js';

/* Calculate real distance between two GPS coordinates in meters using Haversine */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class SafetyEngine {
  constructor() {
    this.checkInterval = null;
  }

  startMonitoring() {
    if (this.checkInterval) return;
    // Periodically re-evaluate status signals
    this.checkInterval = setInterval(() => {
      this.evaluateAllChildren();
    }, 15000);
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /* Evaluate a child's location and sensor signals against safe zones and rules */
  evaluateChildSignals(child) {
    const state = store.get();
    const safeZones = state.safeZones;
    const now = Date.now();

    // 1. Check Offline / Stale GPS (>10 min)
    const minutesSinceUpdate = (now - child.lastUpdated) / 60000;
    if (!child.isOnline || minutesSinceUpdate >= 10) {
      return {
        status: 'unknown',
        zone: null,
        reason: `⚪ Location unavailable. Last known update was ${Math.round(minutesSinceUpdate)} minutes ago.`,
        alertType: 'warning',
        triggerAlert: minutesSinceUpdate >= 10 && child.isOnline,
        alertDetails: {
          title: '⚠️ Location Unavailable',
          what: `Child device has stopped transmitting location updates for ${Math.round(minutesSinceUpdate)} minutes.`,
          evidence: `Last GPS ping at ${new Date(child.lastUpdated).toLocaleTimeString()}. GPS accuracy signal lost.`,
          severity: 'Medium (Warning)',
          recommendedAction: 'Check child cell service, verify if device is powered off or inside a tunnel.'
        }
      };
    }

    // 2. Check Emergency SOS
    if (child.safetyStatus === 'danger' && state.activeSosAlert && state.activeSosAlert.childId === child.id) {
      return {
        status: 'danger',
        zone: null,
        reason: '🚨 ACTIVE EMERGENCY SOS IN PROGRESS!',
        triggerAlert: false
      };
    }

    // 3. Geofence evaluation
    let matchedZone = null;
    let inRestrictedZone = false;
    let minDistanceToSafeZone = Infinity;

    for (const zone of safeZones) {
      const dist = calculateDistance(child.lat, child.lng, zone.lat, zone.lng);
      if (dist <= zone.radius) {
        if (zone.isRestricted) {
          inRestrictedZone = true;
          matchedZone = zone;
          break;
        } else {
          matchedZone = zone;
        }
      }
      if (!zone.isRestricted && dist < minDistanceToSafeZone) {
        minDistanceToSafeZone = dist;
      }
    }

    // 4. Restricted Zone Intrusion (High Danger)
    if (inRestrictedZone) {
      return {
        status: 'danger',
        zone: matchedZone,
        reason: `🔴 Entered parent-restricted hazard zone: ${matchedZone.name}`,
        alertType: 'critical',
        triggerAlert: true,
        alertDetails: {
          title: '🚨 Restricted Zone Entry',
          what: `${child.name} entered a designated high-risk area (${matchedZone.name}).`,
          evidence: `Device location is within ${Math.round(matchedZone.radius)}m of ${matchedZone.address}.`,
          severity: 'Critical (Immediate Attention)',
          recommendedAction: 'Contact child immediately and ask them to move to a safe street.'
        }
      };
    }

    // 5. Multi-signal Escalation: Outside safe zone + critically low battery
    const isOutsideSafeZone = !matchedZone;
    const isBatteryCritical = child.battery <= 15;

    if (isOutsideSafeZone && isBatteryCritical) {
      return {
        status: 'attention',
        zone: null,
        reason: `🟡 Outside safe zones with critically low battery (${child.battery}%). Risk of losing connection soon.`,
        alertType: 'warning',
        triggerAlert: true,
        alertDetails: {
          title: '⚠️ Low Battery Outside Safe Zone',
          what: `${child.name} is in an unapproved zone with only ${child.battery}% battery remaining.`,
          evidence: `Battery is ${child.battery}%. Nearest safe zone is ${Math.round(minDistanceToSafeZone)}m away.`,
          severity: 'High (Warning)',
          recommendedAction: `Call ${child.name} to confirm their whereabouts before phone shuts down.`
        }
      };
    }

    // 6. Outside Safe Zone alone
    if (isOutsideSafeZone) {
      return {
        status: 'attention',
        zone: null,
        reason: `🟡 Outside designated safe zones (~${Math.round(minDistanceToSafeZone)}m from nearest safe zone).`,
        alertType: 'warning',
        triggerAlert: false
      };
    }

    // 7. Inside Safe Zone
    return {
      status: 'safe',
      zone: matchedZone,
      reason: `🟢 In Safe Zone: ${matchedZone.name} (${matchedZone.icon})`,
      triggerAlert: false
    };
  }

  /* Evaluate all children and update state */
  evaluateAllChildren() {
    const state = store.get();
    state.children.forEach(child => {
      const evaluation = this.evaluateChildSignals(child);
      const updates = {
        safetyStatus: evaluation.status,
        statusReason: evaluation.reason,
        currentZoneId: evaluation.zone ? evaluation.zone.id : null
      };

      store.updateChild(child.id, updates);

      if (evaluation.triggerAlert && evaluation.alertDetails) {
        // Prevent duplicate alerts within 5 minutes
        const existing = state.alerts.find(
          a => a.childId === child.id &&
               a.title === evaluation.alertDetails.title &&
               (Date.now() - a.timestamp) < 300000
        );

        if (!existing) {
          store.addAlert({
            childId: child.id,
            childName: child.name,
            type: evaluation.alertType,
            lat: child.lat,
            lng: child.lng,
            ...evaluation.alertDetails
          });

          if (evaluation.alertType === 'critical') {
            soundFx.playWarningBeep();
          }
        }
      }
    });
  }

  /* Trigger simulated Fall / Sudden Impact Event */
  simulateFallDetection(childId) {
    const child = store.getChild(childId);
    store.updateChild(childId, {
      safetyStatus: 'attention',
      statusReason: '⚠️ Sudden impact / potential fall detected by device accelerometer.'
    });

    const alert = store.addAlert({
      childId: child.id,
      childName: child.name,
      title: '⚠️ Impact / Fall Detected',
      type: 'warning',
      what: `Sudden high deceleration detected on ${child.name}'s phone.`,
      evidence: `Sensor recorded 3.8G impact spike followed by no motion for 45 seconds. Location: (${child.lat.toFixed(4)}, ${child.lng.toFixed(4)}).`,
      severity: 'Medium (Warning - Check Status)',
      recommendedAction: `Call ${child.name} to ensure they haven't tripped or dropped their phone.`
    });

    soundFx.playWarningBeep();
    return alert;
  }
}

export const safetyEngine = new SafetyEngine();
