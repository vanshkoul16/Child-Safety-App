/* =========================================================
   SafeHaven Live - Sign in / create account screen
   ========================================================= */

import { sb, esc, friendlyError, isLiveConfigured } from './api.js';
import { icon } from '../icons.js';

const SCENE_SECONDS = 9;

// Embed an icon from the shared set inside the scene SVG, centred on (x, y)
const sceneIcon = (name, x, y, size = 16) => `<g transform="translate(${x - size / 2} ${y - size / 2})">${icon(name, size)}</g>`;

/* Illustrative animated scene: a child walks from Home to School and the
   safe-zone alert appears on arrival. Decorative only — no real data. */
function authShowcase() {
  return `
    <aside class="auth-showcase" aria-hidden="true">
      <div class="auth-showcase__copy">
        <p class="eyebrow">Peace of mind, not surveillance</p>
        <h2 class="auth-showcase__title">Know they got there safely.</h2>
        <p class="auth-showcase__lede">Live location your child can always see and pause, safe-zone alerts that ignore GPS noise, and an SOS that reaches every guardian.</p>
      </div>

      <div class="auth-scene">
        <svg class="auth-scene__map" viewBox="0 0 520 360" preserveAspectRatio="xMidYMid slice">
          <rect class="as-bg" width="520" height="360" />
          <rect class="as-park" x="292" y="214" width="120" height="70" rx="14" />
          <g class="as-blocks">
            <rect x="24" y="22" width="92" height="64" rx="10" /><rect x="136" y="22" width="120" height="64" rx="10" />
            <rect x="24" y="108" width="92" height="76" rx="10" /><rect x="136" y="108" width="54" height="76" rx="10" />
            <rect x="436" y="214" width="70" height="70" rx="10" /><rect x="190" y="214" width="82" height="52" rx="10" />
            <rect x="440" y="22" width="66" height="54" rx="10" />
          </g>
          <path class="as-river" d="M-20 322 C 90 286, 170 350, 280 318 S 440 286, 540 306" />
          <g class="as-roads">
            <path d="M0 98 H520" /><path d="M0 200 H520" /><path d="M126 0 V360" /><path d="M276 0 V300" /><path d="M424 0 V300" />
          </g>
          <g class="as-roads as-roads--minor">
            <path d="M200 98 V200" /><path d="M276 150 H424" /><path d="M24 260 H180" />
          </g>

          <circle class="as-zone as-zone--home" cx="96" cy="250" r="44" />
          <circle class="as-zone as-zone--school" cx="372" cy="128" r="50">
            <animate attributeName="fill-opacity" values="0.1;0.1;0.32;0.1" keyTimes="0;0.68;0.76;1" dur="${SCENE_SECONDS}s" repeatCount="indefinite" />
          </circle>
          <g class="as-zone-icon">${sceneIcon('home', 96, 250)}${sceneIcon('school', 372, 128)}</g>

          <path id="auth-route" class="as-route" d="M96 250 C 150 238, 176 206, 216 200 S 270 160, 300 150 S 350 134, 372 128" />

          <g class="as-pin">
            <circle class="as-pin__pulse" r="10">
              <animate attributeName="r" values="10;30" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.45;0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle class="as-pin__dot" r="10" />
            <animateMotion dur="${SCENE_SECONDS}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;0.08;0.7;1" calcMode="linear">
              <mpath href="#auth-route" />
            </animateMotion>
          </g>
        </svg>

        <div class="auth-chip auth-chip--sharing">
          <span class="auth-chip__dot"></span>
          <span><strong>Sharing location</strong><small>Visible to your child · ±8 m</small></span>
        </div>
        <div class="auth-chip auth-chip--arrived">
          <span class="auth-chip__icon">${icon('checkCircle', 16)}</span>
          <span><strong>Arrived at School</strong><small>Automatic safe-zone alert · just now</small></span>
        </div>
      </div>

      <ul class="auth-points">
        <li>${icon('eyeOff', 15)} Children always see when they're sharing</li>
        <li>${icon('lock', 15)} Each family's data is walled off from others</li>
        <li>${icon('siren', 15)} SOS shows delivery, never guesses</li>
      </ul>
    </aside>
  `;
}

// The chips follow the SVG's own clock, so they always match where the pin is.
// Reduced motion: hold the "arrived" frame.
function startScene(root) {
  const svg = root.querySelector('.auth-scene__map');
  const sharing = root.querySelector('.auth-chip--sharing');
  const arrived = root.querySelector('.auth-chip--arrived');
  if (!svg) return;
  svg.setCurrentTime(0);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    svg.setCurrentTime(SCENE_SECONDS * 0.8);
    svg.pauseAnimations();
    arrived.classList.add('is-shown');
    return;
  }
  const tick = () => {
    if (!svg.isConnected) return;
    const phase = (svg.getCurrentTime() % SCENE_SECONDS) / SCENE_SECONDS;
    sharing.classList.toggle('is-shown', phase > 0.06 && phase < 0.64);
    arrived.classList.toggle('is-shown', phase > 0.72 && phase < 0.96);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function renderAuth(root, { mode = 'signin', notice = '' } = {}) {
  const configured = isLiveConfigured();

  root.innerHTML = `
    <div class="live-auth">
      ${authShowcase()}
      <div class="live-auth__card card">
        <div class="signin-hero">
          <span class="signin-hero__mark">${icon('shieldCheck', 24)}</span>
          <h1 class="display live-auth__title">${mode === 'signup' ? 'Create your account' : 'Sign in to SafeHaven'}</h1>
          <p class="modal__lede">${mode === 'signup'
            ? 'Guardians and children each have their own account. You link them afterwards with a one-time code.'
            : 'Live locations, safe zones and SOS alerts for your family.'}</p>
        </div>

        ${!configured ? `
          <div class="live-note tone-attention" role="alert">
            ${icon('alert', 16)}
            <span>Live mode isn't configured on this server yet (missing Supabase URL or key). See <span class="mono">docs/LIVE_MODE.md</span>. You can still explore the demo.</span>
          </div>
        ` : ''}

        ${notice ? `<div class="live-note tone-safe" role="status">${icon('checkCircle', 16)}<span>${esc(notice)}</span></div>` : ''}

        <div class="seg live-auth__tabs" role="tablist" aria-label="Account">
          <button class="seg__btn ${mode === 'signin' ? 'active' : ''}" role="tab" aria-selected="${mode === 'signin'}" data-auth-tab="signin">Sign in</button>
          <button class="seg__btn ${mode === 'signup' ? 'active' : ''}" role="tab" aria-selected="${mode === 'signup'}" data-auth-tab="signup">Create account</button>
        </div>

        <form class="form" id="live-auth-form" novalidate>
          ${mode === 'signup' ? `
            <fieldset class="live-roles">
              <legend class="field__label">Who is this account for?</legend>
              <label class="live-role">
                <input type="radio" name="role" value="parent" checked />
                <span class="live-role__body">${icon('users', 18)}<strong>Parent or guardian</strong><small>See your children's location and receive SOS alerts</small></span>
              </label>
              <label class="live-role">
                <input type="radio" name="role" value="child" />
                <span class="live-role__body">${icon('smartphone', 18)}<strong>Child's phone</strong><small>Share location with linked guardians and send SOS</small></span>
              </label>
            </fieldset>
            <label class="field">
              <span class="field__label">Display name</span>
              <input class="input" name="display_name" type="text" maxlength="60" required autocomplete="nickname" placeholder="e.g. Asha" />
            </label>
          ` : ''}
          <label class="field">
            <span class="field__label">Email</span>
            <span class="input-wrap">${icon('mail', 16)}<input class="input" name="email" type="email" required autocomplete="email" placeholder="name@example.com" /></span>
          </label>
          <label class="field">
            <span class="field__label">Password ${mode === 'signup' ? '<span class="field__hint">at least 8 characters</span>' : ''}</span>
            <span class="input-wrap">${icon('lock', 16)}<input class="input" name="password" type="password" required minlength="8" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" /></span>
          </label>
          <p class="form-error" id="live-auth-error" role="alert" hidden></p>
          <button type="submit" class="btn btn--primary btn--block btn--lg" ${configured ? '' : 'disabled'}>${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>

        <div class="divider"><span>or</span></div>
        <button class="btn btn--soft btn--block" data-auth-demo>${icon('play', 16)} Explore the demo with sample data</button>
        <p class="fine live-auth__fine">Demo mode uses a made-up family and synthetic locations. Nothing in it is real.</p>
      </div>
    </div>
  `;

  startScene(root);

  root.querySelectorAll('[data-auth-tab]').forEach((b) => {
    b.addEventListener('click', () => renderAuth(root, { mode: b.dataset.authTab }));
  });
  root.querySelector('[data-auth-demo]').addEventListener('click', () => window.enterDemoMode());

  const form = root.querySelector('#live-auth-form');
  const errEl = root.querySelector('#live-auth-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const showError = (msg) => {
      errEl.textContent = msg;
      errEl.hidden = false;
    };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Enter a valid email address.');
    if (password.length < 8) return showError('Password must be at least 8 characters.');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      if (mode === 'signup') {
        const role = fd.get('role');
        const displayName = String(fd.get('display_name') || '').trim();
        if (!displayName) throw new Error('Enter a display name.');
        if (role !== 'parent' && role !== 'child') throw new Error('Choose who the account is for.');
        const { data, error } = await sb().auth.signUp({
          email,
          password,
          options: { data: { role, display_name: displayName.slice(0, 60) }, emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        if (!data.session) {
          renderAuth(root, { mode: 'signin', notice: `Check ${email} for a confirmation link, then sign in.` });
        }
        // With a session, liveApp's auth listener mounts the right dashboard
      } else {
        const { error } = await sb().auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      showError(friendlyError(err));
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });
}
