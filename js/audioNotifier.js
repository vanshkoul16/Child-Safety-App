/* =========================================================
   SafeHaven - Audio Notification Synthesizer (Web Audio API)
   Generates crisp, dependency-free audio alerts
   ========================================================= */

class AudioNotifier {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.sosInterval = null;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEmergencySOS();
    }
    return this.isMuted;
  }

  /* Play gentle pleasant notification ping */
  playPing() {
    if (this.isMuted) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.36);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /* Play sweet ascending chime for "I'm Safe" check-in or safe zone arrival */
  playSafeChime() {
    if (this.isMuted) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (C Major)
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = this.ctx.currentTime + idx * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.42);
      });
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /* Play caution/warning double-beep */
  playWarningBeep() {
    if (this.isMuted) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      [0, 0.18].forEach(offset => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = this.ctx.currentTime + offset;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(587.33, startTime); // D5
        osc.frequency.exponentialRampToValueAtTime(440, startTime + 0.12);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.15);
      });
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /* Start repeating dual-tone emergency SOS siren */
  playEmergencySOS() {
    if (this.isMuted || this.sosInterval) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      let toggle = false;
      const playPulse = () => {
        if (!this.ctx || this.isMuted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(toggle ? 980 : 720, this.ctx.currentTime);
        toggle = !toggle;

        gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.29);
      };

      playPulse();
      this.sosInterval = setInterval(playPulse, 320);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /* Stop emergency SOS siren */
  stopEmergencySOS() {
    if (this.sosInterval) {
      clearInterval(this.sosInterval);
      this.sosInterval = null;
    }
  }
}

export const soundFx = new AudioNotifier();
