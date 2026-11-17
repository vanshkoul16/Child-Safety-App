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

// Returning from Google or an email link always lands in live mode, even if this browser was in demo
function isAuthReturn() {
  const q = new URLSearchParams(window.location.search);
  return q.has('auth') || q.has('code') || /(^#|&)(access_token|error)=/.test(window.location.hash);
}

function setModeTag(mode) {
  const tag = document.getElementById('app-mode-tag');
  if (!tag) return;
  tag.hidden = false;
  tag.textContent = mode === 'demo' ? 'Demo mode' : 'Live mode';
  tag.className = `pill pill--xs app-mode-tag ${mode === 'demo' ? 'app-mode-tag--demo' : 'app-mode-tag--live'}`;
  tag.title = mode === 'demo' ? 'Synthetic sample family. Nothing is real.' : 'Real accounts and real locations';
}

function boot() {
  if (isAuthReturn() && readMode() === 'demo') {
    try { localStorage.setItem(MODE_KEY, 'live'); } catch (e) { /* ignore */ }
  }
  if (readMode() === 'demo') {
    setModeTag('demo');
    startDemo();
  } else {
    setModeTag('live');
    startLive();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
