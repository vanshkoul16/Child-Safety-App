/* =========================================================
   SafeHaven Live - Sign in / create account screens
   Google (Supabase OAuth, PKCE) and email + password, plus
   confirmation resend, forgot password and set-new-password.
   ========================================================= */

import {
  sb, esc, friendlyError, isLiveConfigured, authRedirect, authSettings,
  savePendingRole, clearPendingRole, passwordProblem, EMAIL_RE
} from './api.js';
import { icon } from '../icons.js';
import { prefersReducedMotion } from '../motion.js';

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

/* Google's own "G" mark, as its sign-in branding guidelines require */
const GOOGLE_G = `<svg class="google-g" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

export const ROLE_COPY = {
  parent: {
    title: 'Parent / Guardian',
    ic: 'users',
    points: ['Parent dashboard with live locations', 'Link children with a one-time code', 'Safe zones and arrival / leaving alerts', 'SOS alerts from your children']
  },
  child: {
    title: 'Child',
    ic: 'smartphone',
    points: ['Child dashboard with an SOS button', 'Join a guardian\'s family with their code', 'Share location only after you allow it', 'Always see when sharing is on']
  }
};

/* Account-type picker shared by sign-up and Google onboarding */
export function rolePicker(selected, name = 'role') {
  return `
    <fieldset class="live-roles">
      <legend class="field__label">Who is this account for?</legend>
      ${['parent', 'child'].map((r) => `
        <label class="live-role">
          <input type="radio" name="${name}" value="${r}" ${selected === r ? 'checked' : ''} required />
          <span class="live-role__body">${icon(ROLE_COPY[r].ic, 18)}<strong>${ROLE_COPY[r].title}</strong>
            <small>${ROLE_COPY[r].points.join(' · ')}</small>
          </span>
        </label>
      `).join('')}
    </fieldset>
  `;
}

const RESEND_COOLDOWN_S = 60;
let resendAvailableAt = 0;
let firstRender = true; // the panels rise in once; switching tabs only fades the form

function note(tone, ic, html, role = 'status') {
  return `<div class="live-note tone-${tone}" role="${role}">${icon(ic, 16)}<span>${html}</span></div>`;
}

function passwordField(name, label, autocomplete, hint = '') {
  return `
    <label class="field">
      <span class="field__label">${label} ${hint ? `<span class="field__hint">${hint}</span>` : ''}</span>
      <span class="input-wrap">${icon('lock', 16)}<input class="input" name="${name}" type="password" required minlength="8" maxlength="72" autocomplete="${autocomplete}" /></span>
    </label>
  `;
}

function emailField(value = '') {
  return `
    <label class="field">
      <span class="field__label">Email</span>
      <span class="input-wrap">${icon('mail', 16)}<input class="input" name="email" type="email" required autocomplete="email" placeholder="name@example.com" value="${esc(value)}" /></span>
    </label>
  `;
}

/* opts: { mode: 'signin' | 'signup' | 'forgot' | 'check-email', notice, error, email, role, unconfirmed } */
export function renderAuth(root, opts = {}) {
  const { mode = 'signin', notice = '', error = '', email = '', role = 'parent', unconfirmed = false } = opts;
  const configured = isLiveConfigured();

  const titles = {
    signin: ['Sign in to SafeHaven', 'Live locations, safe zones and SOS alerts for your family.'],
    signup: ['Create your account', 'Guardians and children each have their own account. You link them afterwards with a one-time code.'],
    forgot: ['Reset your password', 'Enter the email you signed up with. We\'ll send a secure link to choose a new password.'],
    'check-email': ['Check your inbox', `We sent a confirmation link to <strong>${esc(email)}</strong>. Open it on this device to finish creating your account.`]
  };
  const [title, lede] = titles[mode] || titles.signin;

  let body = '';
  if (mode === 'signin' || mode === 'signup') {
    body = `
      <div class="seg live-auth__tabs" role="tablist" aria-label="Account">
        <button class="seg__btn ${mode === 'signin' ? 'active' : ''}" role="tab" aria-selected="${mode === 'signin'}" data-auth-tab="signin">Sign in</button>
        <button class="seg__btn ${mode === 'signup' ? 'active' : ''}" role="tab" aria-selected="${mode === 'signup'}" data-auth-tab="signup">Create account</button>
      </div>

      <form class="form" id="live-auth-form" novalidate>
        ${mode === 'signup' ? rolePicker(role) : ''}

        <button type="button" class="btn btn--google btn--block btn--lg" data-auth-google ${configured ? '' : 'disabled'}>
          ${GOOGLE_G}<span>${mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}</span>
        </button>
        <p class="fine live-auth__google-note" data-google-note>${mode === 'signup'
          ? 'Uses the account type selected above. You confirm it once more after choosing your Google account.'
          : 'Use your Gmail or Google Workspace account. SafeHaven never sees your Google password.'}</p>

        <div class="divider"><span>or with email</span></div>

        ${mode === 'signup' ? `
          <label class="field">
            <span class="field__label">Display name</span>
            <input class="input" name="display_name" type="text" maxlength="60" required autocomplete="nickname" placeholder="e.g. Asha" />
          </label>
        ` : ''}
        ${emailField(email)}
        ${passwordField('password', 'Password', mode === 'signup' ? 'new-password' : 'current-password', mode === 'signup' ? '8+ characters, letters and numbers' : '')}
        ${mode === 'signup' ? passwordField('password2', 'Confirm password', 'new-password') : ''}
        <p class="form-error" id="live-auth-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
        ${unconfirmed ? `<button type="button" class="btn btn--soft btn--block" data-auth-resend>${icon('mail', 16)} Resend confirmation email</button>` : ''}
        <button type="submit" class="btn btn--primary btn--block btn--lg" ${configured ? '' : 'disabled'}>${mode === 'signup' ? 'Create account with email' : 'Sign in'}</button>
        ${mode === 'signin' ? '<button type="button" class="link-btn live-auth__forgot" data-auth-mode="forgot">Forgot password?</button>' : ''}
      </form>
    `;
  } else if (mode === 'forgot') {
    body = `
      <form class="form" id="live-auth-form" novalidate>
        ${emailField(email)}
        <p class="form-error" id="live-auth-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
        <button type="submit" class="btn btn--primary btn--block btn--lg" ${configured ? '' : 'disabled'}>Send reset link</button>
        <button type="button" class="btn btn--ghost btn--block" data-auth-mode="signin">Back to sign in</button>
      </form>
    `;
  } else if (mode === 'check-email') {
    body = `
      <div class="form">
        <ol class="steps live-steps">
          <li><strong>Open the email from SafeHaven</strong><span>Check spam or promotions if it isn't in your inbox.</span></li>
          <li><strong>Tap "Confirm your email"</strong><span>You'll come back here signed in, straight to your dashboard.</span></li>
        </ol>
        <p class="form-error" id="live-auth-error" role="alert" ${error ? '' : 'hidden'}>${esc(error)}</p>
        <button type="button" class="btn btn--soft btn--block" data-auth-resend>${icon('mail', 16)} Resend confirmation email</button>
        <button type="button" class="btn btn--ghost btn--block" data-auth-mode="signin">Back to sign in</button>
      </div>
    `;
  }

  const entering = firstRender && !prefersReducedMotion();
  firstRender = false;
  root.innerHTML = `
    <div class="live-auth ${entering ? 'is-entering' : ''}">
      ${authShowcase()}
      <div class="live-auth__card card">
        <div class="signin-hero">
          <span class="signin-hero__mark">${icon(mode === 'check-email' ? 'mail' : mode === 'forgot' ? 'key' : 'shieldCheck', 24)}</span>
          <h1 class="display live-auth__title">${title}</h1>
          <p class="modal__lede">${lede}</p>
        </div>

        ${!configured ? note('attention', 'alert', 'Live mode isn\'t configured on this server yet (missing Supabase URL or key). See <span class="mono">docs/LIVE_MODE.md</span>. You can still explore the demo.', 'alert') : ''}
        ${notice ? note('safe', 'checkCircle', esc(notice)) : ''}
        <div data-auth-config></div>

        ${body}

        <div class="divider"><span>or</span></div>
        <button class="btn btn--soft btn--block" data-auth-demo>${icon('play', 16)} Explore the demo with sample data</button>
        <p class="fine live-auth__fine">Demo mode uses a made-up family and synthetic locations. Nothing in it is real, and it never creates real accounts.</p>
      </div>
    </div>
  `;

  startScene(root);

  root.querySelectorAll('[data-auth-tab]').forEach((b) => {
    b.addEventListener('click', () => renderAuth(root, { mode: b.dataset.authTab, email: currentEmail() }));
  });
  root.querySelectorAll('[data-auth-mode]').forEach((b) => {
    b.addEventListener('click', () => renderAuth(root, { mode: b.dataset.authMode, email: currentEmail() }));
  });
  root.querySelector('[data-auth-demo]').addEventListener('click', () => window.enterDemoMode());

  const form = root.querySelector('#live-auth-form');
  const errEl = root.querySelector('#live-auth-error');
  const showError = (msg) => {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = !msg;
  };
  function currentEmail() {
    const el = root.querySelector('input[name="email"]');
    return el ? el.value.trim() : email;
  }
  function selectedRole() {
    const el = root.querySelector('input[name="role"]:checked');
    return el ? el.value : null;
  }

  // Tell the user up front when the Supabase project has Google turned off
  if (configured && (mode === 'signin' || mode === 'signup')) {
    authSettings().then((s) => {
      const googleBtn = root.querySelector('[data-auth-google]');
      if (!googleBtn || !googleBtn.isConnected) return;
      if (s.known && !s.google) {
        googleBtn.disabled = true;
        const n = root.querySelector('[data-google-note]');
        if (n) n.innerHTML = `${icon('info', 12)}<span>Google sign-in isn't enabled on this server yet. An administrator must turn it on in Supabase (see <span class="mono">docs/AUTH_SETUP.md</span>). Email sign-in works now.</span>`;
      }
    });
  }

  const googleBtn = root.querySelector('[data-auth-google]');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      showError('');
      if (mode === 'signup') {
        const r = selectedRole();
        if (!r) return showError('Choose who the account is for first.');
        savePendingRole(r);
      } else {
        clearPendingRole(); // existing users go straight in; new users choose on the next screen
      }
      googleBtn.disabled = true;
      googleBtn.classList.add('is-busy');
      try {
        const s = await authSettings();
        if (s.known && !s.google) throw new Error('Unsupported provider');
        const { error: err } = await sb().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: authRedirect('callback'), queryParams: { prompt: 'select_account' } }
        });
        if (err) throw err;
        // The browser now leaves for Google's account chooser
      } catch (err) {
        clearPendingRole();
        showError(friendlyError(err));
        googleBtn.disabled = false;
        googleBtn.classList.remove('is-busy');
      }
    });
  }

  root.querySelectorAll('[data-auth-resend]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const addr = currentEmail();
      if (!EMAIL_RE.test(addr)) return showError('Enter your email address above, then resend.');
      const wait = Math.ceil((resendAvailableAt - Date.now()) / 1000);
      if (wait > 0) return showError(`Please wait ${wait} s before sending another email.`);
      btn.disabled = true;
      try {
        const { error: err } = await sb().auth.resend({ type: 'signup', email: addr, options: { emailRedirectTo: authRedirect('confirmed') } });
        if (err) throw err;
        resendAvailableAt = Date.now() + RESEND_COOLDOWN_S * 1000;
        renderAuth(root, { mode: 'check-email', email: addr, notice: `If ${addr} has an unconfirmed SafeHaven account, a new confirmation link is on its way.` });
      } catch (err) {
        showError(friendlyError(err));
        btn.disabled = false;
      }
    });
  });

  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const fd = new FormData(form);
    const addr = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');

    if (!EMAIL_RE.test(addr)) return showError('Enter a valid email address.');
    if (mode !== 'forgot' && !password) return showError('Enter your password.');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.classList.add('is-busy');
    const release = () => { btn.disabled = false; btn.classList.remove('is-busy'); };

    try {
      if (mode === 'signup') {
        const r = fd.get('role');
        const displayName = String(fd.get('display_name') || '').trim();
        if (r !== 'parent' && r !== 'child') throw new Error('Choose who the account is for.');
        if (!displayName) throw new Error('Enter a display name.');
        const problem = passwordProblem(password);
        if (problem) throw new Error(problem);
        if (password !== String(fd.get('password2') || '')) throw new Error('The two passwords don\'t match.');

        clearPendingRole();
        const { data, error: err } = await sb().auth.signUp({
          email: addr,
          password,
          options: { data: { role: r, display_name: displayName.slice(0, 60) }, emailRedirectTo: authRedirect('confirmed') }
        });
        if (err) throw err;
        // With confirmations on, Supabase hides existing addresses: no error, but no identities either
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          release();
          return renderAuth(root, { mode: 'signin', email: addr, error: 'An account with this email already exists. Sign in, or use "Forgot password?" if you don\'t remember it. If you signed up with Google, use Continue with Google.' });
        }
        if (!data.session) {
          resendAvailableAt = Date.now() + RESEND_COOLDOWN_S * 1000;
          return renderAuth(root, { mode: 'check-email', email: addr });
        }
        // With a session, liveApp's auth listener opens the dashboard
      } else if (mode === 'signin') {
        clearPendingRole();
        const { error: err } = await sb().auth.signInWithPassword({ email: addr, password });
        if (err) {
          if (err.code === 'email_not_confirmed' || /Email not confirmed/i.test(err.message || '')) {
            release();
            return renderAuth(root, { mode: 'signin', email: addr, error: friendlyError(err), unconfirmed: true });
          }
          throw err;
        }
        // Success is only shown once Supabase returns a session: liveApp mounts the dashboard
      } else if (mode === 'forgot') {
        const { error: err } = await sb().auth.resetPasswordForEmail(addr, { redirectTo: authRedirect('recovery') });
        if (err) throw err;
        release();
        // Same message whether or not the address has an account (no account enumeration)
        return renderAuth(root, { mode: 'signin', email: addr, notice: `If ${addr} has a SafeHaven account, we've sent a link to reset its password. It works once and expires after an hour.` });
      }
    } catch (err) {
      showError(friendlyError(err));
      release();
    }
  });
}

/* Shown after the user opens a password-reset link (they are signed in by that link) */
export function renderPasswordReset(root, { email = '', onDone, onCancel } = {}) {
  root.className = 'live-root';
  root.innerHTML = `
    <div class="live-auth live-auth--single ${prefersReducedMotion() ? '' : 'is-entering'}">
      <div class="live-auth__card card">
        <div class="signin-hero">
          <span class="signin-hero__mark">${icon('key', 24)}</span>
          <h1 class="display live-auth__title">Choose a new password</h1>
          <p class="modal__lede">For <strong>${esc(email)}</strong>. You'll stay signed in on this device.</p>
        </div>
        <form class="form" id="live-reset-form" novalidate>
          ${passwordField('password', 'New password', 'new-password', '8+ characters, letters and numbers')}
          ${passwordField('password2', 'Confirm new password', 'new-password')}
          <p class="form-error" id="live-reset-error" role="alert" hidden></p>
          <button type="submit" class="btn btn--primary btn--block btn--lg">Save new password</button>
          <button type="button" class="btn btn--ghost btn--block" data-reset-cancel>Cancel and sign out</button>
        </form>
      </div>
    </div>
  `;
  const form = root.querySelector('#live-reset-form');
  const errEl = root.querySelector('#live-reset-error');
  const showError = (msg) => { errEl.textContent = msg; errEl.hidden = !msg; };
  root.querySelector('[data-reset-cancel]').addEventListener('click', () => onCancel && onCancel());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    const problem = passwordProblem(password);
    if (problem) return showError(problem);
    if (password !== String(fd.get('password2') || '')) return showError('The two passwords don\'t match.');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      const { error } = await sb().auth.updateUser({ password });
      if (error) throw error;
      onDone && onDone();
    } catch (err) {
      showError(friendlyError(err));
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });
}
