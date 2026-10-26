/* =========================================================
   SafeHaven - entry point
   Live mode (Supabase, real accounts and locations) by default;
   Demo mode (the original prototype with synthetic data) on request.
   ========================================================= */

import { startDemo } from './app.js';
import { startLive } from './live/liveApp.js';

const MODE_KEY = 'safehaven_app_mode';

function readMode() {
  try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; }
}

function setMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* private mode: falls back to live */ }
  window.location.href = window.location.pathname;
}

window.enterDemoMode = () => setMode('demo');
window.leaveDemoMode = () => setMode('live');

function boot() {
  if (readMode() === 'demo') startDemo();
  else startLive();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
