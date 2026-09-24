/* =========================================================
   SafeHaven - Child App UI ("My Safety")
   Child-friendly, calm, straightforward interface
   ========================================================= */

import { store } from './state.js';
import { soundFx } from './audioNotifier.js';

export class ChildUI {
  constructor() {
    this.container = null;
    this.holdTimer = null;
    this.holdProgress = 0;
  }

  mount(containerId = 'child-content-area') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.render();
    store.subscribe(() => {
      this.render();
    });
  }

  render() {
    if (!this.container) return;
    const state = store.get();
    const child = store.getChild(state.selectedChildId);
    const zone = state.safeZones.find(z => z.id === child.currentZoneId);

    const isSOSActive = state.activeSosAlert && state.activeSosAlert.childId === child.id;

    let heroStatusClass = 'safe';
    let heroIcon = '🛡️';
    let heroTitle = "You're in a Safe Zone";
    let heroDesc = zone ? `You are at ${zone.name} (${zone.address}). Dad (${state.parent.name}) knows you're safe here.` : `You're safe. Location is being shared with Dad (${state.parent.name}).`;

    if (child.safetyStatus === 'attention') {
      heroStatusClass = 'attention';
      heroIcon = '📍';
      heroTitle = 'Outside Safe Zone';
      heroDesc = `You're outside your usual safe areas. If you need a ride or help, call Dad (${state.parent.name})!`;
    } else if (child.safetyStatus === 'danger' || isSOSActive) {
      heroStatusClass = 'danger';
      heroIcon = '🚨';
      heroTitle = 'EMERGENCY MODE ACTIVE';
      heroDesc = 'Dad and emergency dispatch (112) are notified of your location. Stay calm and stay where you are.';
    }

    this.container.innerHTML = `
      <div class="child-view">
        <!-- Child Header -->
        <div class="child-top-bar">
          <div class="child-profile-mini">
            <div class="child-avatar-lg" style="background: ${child.color};">
              ${child.name.charAt(0)}
            </div>
            <div class="child-profile-text">
              <h2>${child.name}'s Safety</h2>
              <p>Protected by Dad (${state.parent.name})</p>
            </div>
          </div>
          <div class="child-device-status-badge">
            <span>🔋 ${child.battery}%</span>
            <span>&bull;</span>
            <span>📶 ${child.signal}</span>
          </div>
        </div>

        <!-- Privacy Transparency Badge -->
        <div class="privacy-transparency-pill">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Location sharing is active with Dad (${state.parent.name}). Zero secret listening or camera tracking.</span>
        </div>

        <!-- Safety Status Hero Card -->
        <div class="child-safety-hero-card ${heroStatusClass}">
          <div class="safety-hero-icon">${heroIcon}</div>
          <div class="safety-hero-title">${heroTitle}</div>
          <div class="safety-hero-desc">${heroDesc}</div>
          <div style="font-size: 0.72rem; color: var(--text-subtle); margin-top: 0.25rem;">
            Last location sync: Just now &bull; Accuracy: ${child.gpsAccuracy}
          </div>
        </div>

        <!-- SOS Trigger Section -->
        <div class="sos-section">
          ${isSOSActive ? `
            <div style="text-align: center; width: 100%;">
              <button class="btn btn-danger" style="width: 100%; padding: 1rem; font-size: 1.1rem; margin-bottom: 0.75rem;" onclick="window.callEmergencyServices()">
                🚨 Call 112 Emergency Direct
              </button>
              <button class="btn btn-secondary" style="width: 100%;" onclick="window.cancelChildSOS()">
                Cancel False Alarm
              </button>
            </div>
          ` : `
            <div id="sos-button" class="sos-hold-button" title="Hold for 3 seconds to trigger emergency">
              <span class="sos-text-main">SOS</span>
              <span class="sos-text-sub">Hold 3s</span>
            </div>
            <div class="sos-instruction-text">
              Press and hold for 3 seconds in an emergency
            </div>
          `}
        </div>

        <!-- Secondary Action Buttons -->
        <div class="child-actions-grid">
          <button class="child-big-btn btn-im-safe" onclick="window.childSendImSafe()">
            <div class="child-btn-icon-box safe-bg">✅</div>
            <div class="child-btn-label">I'm Safe</div>
            <div class="child-btn-hint">Notify parents with 1 tap</div>
          </button>

          <button class="child-big-btn" onclick="window.openCallParentModal()">
            <div class="child-btn-icon-box phone-bg">📞</div>
            <div class="child-btn-label">Call Dad</div>
            <div class="child-btn-hint">Dad (${state.parent.name.split(' ')[0]})</div>
          </button>

          <button class="child-big-btn" onclick="window.childShareLiveLocation()">
            <div class="child-btn-icon-box pin-bg">📍</div>
            <div class="child-btn-label">Share Location</div>
            <div class="child-btn-hint">Send live GPS ping</div>
          </button>

          <button class="child-big-btn" onclick="window.switchTab('map')">
            <div class="child-btn-icon-box" style="background: #e0f2fe; color: #0284c7;">🗺️</div>
            <div class="child-btn-label">View Safe Zones</div>
            <div class="child-btn-hint">See nearby approved places</div>
          </button>
        </div>

        <div id="child-toast-notice" style="display: none;" class="im-safe-notification">
          <span>❤️ Mom & Dad have been notified that you're safe!</span>
        </div>
      </div>
    `;

    this.bindSOSEvents();
  }

  bindSOSEvents() {
    const sosBtn = document.getElementById('sos-button');
    if (!sosBtn) return;

    let holdStartTime = 0;
    let holdInterval = null;

    const startHold = (e) => {
      e.preventDefault();
      holdStartTime = Date.now();
      sosBtn.classList.add('holding');

      holdInterval = setInterval(() => {
        const elapsed = (Date.now() - holdStartTime) / 1000;
        if (elapsed >= 2.5) {
          clearInterval(holdInterval);
          sosBtn.classList.remove('holding');
          this.triggerSOS();
        } else {
          const remaining = (3 - elapsed).toFixed(1);
          const subText = sosBtn.querySelector('.sos-text-sub');
          if (subText) subText.textContent = `${remaining}s...`;
        }
      }, 100);
    };

    const endHold = (e) => {
      if (holdInterval) {
        clearInterval(holdInterval);
        holdInterval = null;
      }
      sosBtn.classList.remove('holding');
      const subText = sosBtn.querySelector('.sos-text-sub');
      if (subText) subText.textContent = 'Hold 3s';
    };

    sosBtn.addEventListener('mousedown', startHold);
    sosBtn.addEventListener('mouseup', endHold);
    sosBtn.addEventListener('mouseleave', endHold);

    sosBtn.addEventListener('touchstart', startHold, { passive: false });
    sosBtn.addEventListener('touchend', endHold);
    sosBtn.addEventListener('touchcancel', endHold);
  }

  triggerSOS() {
    const state = store.get();
    store.triggerSOS(state.selectedChildId);
    soundFx.playEmergencySOS();
  }
}

export const childUI = new ChildUI();
