/* =========================================================
   SafeHaven - Child App UI ("My Safety")
   Child-friendly, calm, straightforward interface
   ========================================================= */

import { store } from './state.js';
import { soundFx } from './audioNotifier.js';
import { icon, clean, short, batteryMeter } from './icons.js';

const SOS_HOLD_SECONDS = 3;

export class ChildUI {
  constructor() {
    this.container = null;
    this.isHolding = false;
  }

  mount(containerId = 'child-content-area') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.render();
    store.subscribe(() => {
      // Don't rebuild the SOS button out from under a finger that's holding it
      if (!this.isHolding) this.render();
    });
  }

  render() {
    if (!this.container) return;
    const state = store.get();
    const child = store.getChild(state.selectedChildId);
    const zone = state.safeZones.find(z => z.id === child.currentZoneId);
    const guardian = state.parent.name.split(' ')[0];

    const isSOSActive = state.activeSosAlert && state.activeSosAlert.childId === child.id;

    let tone = 'safe';
    let heroIcon = 'shieldCheck';
    let heroTitle = "You're in a safe zone";
    let heroDesc = zone
      ? `You're at ${clean(zone.name)}. Dad knows you're safe here.`
      : `You're safe. Your location is being shared with Dad.`;

    if (child.safetyStatus === 'attention') {
      tone = 'attention';
      heroIcon = 'pin';
      heroTitle = "You're outside your safe zones";
      heroDesc = `That's okay — if you need a ride or any help, call Dad straight away.`;
    }
    if (child.safetyStatus === 'danger' || isSOSActive) {
      tone = 'danger';
      heroIcon = 'siren';
      heroTitle = 'Help is on the way';
      heroDesc = 'Dad and emergency services (112) can see where you are. Stay calm and stay where you are if it is safe.';
    }

    const ringR = 54;
    const ringC = (2 * Math.PI * ringR).toFixed(1);

    this.container.innerHTML = `
      <div class="kid">
        <header class="kid-head">
          <span class="avatar avatar--lg ring-${tone}"><img src="${child.avatar}" alt="" /></span>
          <div class="kid-head__text">
            <p class="eyebrow">My safety</p>
            <h1 class="kid-head__title">Hi, ${child.name}</h1>
            <span class="zone-badge tone-${tone}">${icon(tone === 'safe' ? 'shieldCheck' : tone === 'danger' ? 'siren' : 'pin', 13)}${
              tone === 'danger' ? 'Emergency mode' : zone ? `Safe zone — ${clean(zone.name)}` : 'Outside safe zones'}</span>
          </div>
          <div class="kid-device">
            <span>${batteryMeter(child.battery)} ${child.battery}%</span>
            <span>${icon('signal', 13)} ${short(child.signal)}</span>
          </div>
        </header>

        <div class="kid-privacy">
          ${icon('lock', 15)}
          <span>Dad (${guardian}) can see your location. Nothing else — no microphone, no camera.</span>
        </div>

        <section class="kid-status tone-${tone}">
          <span class="kid-status__icon">${icon(heroIcon, 26)}</span>
          <h2 class="kid-status__title">${heroTitle}</h2>
          <p class="kid-status__desc">${heroDesc}</p>
          <p class="kid-status__meta">Updated just now · ${clean(child.gpsAccuracy)}</p>
        </section>

        <section class="sos-zone">
          ${isSOSActive ? `
            <div class="sos-active">
              <button class="btn btn--danger btn--lg btn--block" onclick="window.callEmergencyServices()">${icon('phone', 18)} Call 112 now</button>
              <button class="btn btn--soft btn--block" onclick="window.cancelChildSOS()">It was a mistake — cancel SOS</button>
            </div>
          ` : `
            <button id="sos-button" class="sos" aria-label="Emergency SOS. Press and hold for ${SOS_HOLD_SECONDS} seconds." style="--hold:${SOS_HOLD_SECONDS}s">
              <svg class="sos__ring" viewBox="0 0 120 120" aria-hidden="true">
                <circle class="sos__track" cx="60" cy="60" r="${ringR}" />
                <circle class="sos__progress" cx="60" cy="60" r="${ringR}" stroke-dasharray="${ringC}" stroke-dashoffset="${ringC}" style="--c:${ringC}" />
              </svg>
              <span class="sos__label">SOS</span>
              <span class="sos__sub">Hold ${SOS_HOLD_SECONDS}s</span>
            </button>
            <p class="sos-hint">Press and hold in an emergency. Dad and 112 will be alerted.</p>
          `}
        </section>

        <div class="kid-actions">
          <button class="kid-action tone-safe" onclick="window.childSendImSafe()">
            <span class="kid-action__icon">${icon('checkCircle', 22)}</span>
            <span class="kid-action__label">I'm safe</span>
            <span class="kid-action__hint">Let Dad know</span>
          </button>
          <a class="kid-action tone-accent" href="tel:${(state.parent.phone || '').replace(/\s+/g, '')}" onclick="window.childCallGuardian()">
            <span class="kid-action__icon">${icon('phone', 22)}</span>
            <span class="kid-action__label">Call Dad (${guardian})</span>
            <span class="kid-action__hint">One tap to call</span>
          </a>
          <button class="kid-action tone-info" onclick="window.childShareLiveLocation()">
            <span class="kid-action__icon">${icon('locate', 22)}</span>
            <span class="kid-action__label">Share location</span>
            <span class="kid-action__hint">Send a live update</span>
          </button>
          <button class="kid-action tone-neutral" onclick="window.openChildZonesModal()">
            <span class="kid-action__icon">${icon('shield', 22)}</span>
            <span class="kid-action__label">Safe places</span>
            <span class="kid-action__hint">Where you're covered</span>
          </button>
        </div>

        <button class="link-btn kid-more" onclick="window.openCallParentModal()">Call someone else ${icon('chevronRight', 14)}</button>

        <div id="child-toast-notice" class="kid-notice" hidden>
          ${icon('heart', 16)}
          <span>Mom and Dad know you're safe.</span>
        </div>
      </div>
    `;

    this.bindSOSEvents();
  }

  bindSOSEvents() {
    const sosBtn = document.getElementById('sos-button');
    if (!sosBtn) return;

    let holdStart = 0;
    let holdInterval = null;
    const sub = sosBtn.querySelector('.sos__sub');

    const startHold = (e) => {
      e.preventDefault();
      if (holdInterval) return;
      this.isHolding = true;
      holdStart = Date.now();
      sosBtn.classList.add('holding');

      holdInterval = setInterval(() => {
        const elapsed = (Date.now() - holdStart) / 1000;
        if (elapsed >= SOS_HOLD_SECONDS) {
          clearInterval(holdInterval);
          holdInterval = null;
          this.isHolding = false;
          sosBtn.classList.remove('holding');
          this.triggerSOS();
        } else if (sub) {
          sub.textContent = `${Math.ceil(SOS_HOLD_SECONDS - elapsed)}…`;
        }
      }, 100);
    };

    const endHold = () => {
      if (holdInterval) {
        clearInterval(holdInterval);
        holdInterval = null;
      }
      const wasHolding = this.isHolding;
      this.isHolding = false;
      sosBtn.classList.remove('holding');
      if (sub) sub.textContent = `Hold ${SOS_HOLD_SECONDS}s`;
      if (wasHolding) this.render();
    };

    sosBtn.addEventListener('mousedown', startHold);
    sosBtn.addEventListener('mouseup', endHold);
    sosBtn.addEventListener('mouseleave', endHold);
    sosBtn.addEventListener('touchstart', startHold, { passive: false });
    sosBtn.addEventListener('touchend', endHold);
    sosBtn.addEventListener('touchcancel', endHold);
    sosBtn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startHold(e); });
    sosBtn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') endHold(); });
  }

  triggerSOS() {
    const state = store.get();
    store.triggerSOS(state.selectedChildId);
    soundFx.playEmergencySOS();
  }
}

export const childUI = new ChildUI();
