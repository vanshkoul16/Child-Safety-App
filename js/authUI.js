/* =========================================================
   SafeHaven — Auth UI
   Login / Register screens rendered before the main app.
   Also provides the invite-code linking modal.
   ========================================================= */

import { register, login, logout, getMyProfile, generateInviteCode, redeemInviteCode, onAuthChange, bootstrapAuth } from './auth.js';

// -------------------------------------------------------
// Auth screen markup
// -------------------------------------------------------
const AUTH_SCREEN_HTML = `
<div id="auth-screen" class="auth-screen" role="main" aria-label="Sign in to SafeHaven">
  <div class="auth-card">
    <div class="auth-brand">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3 5 6v5.5c0 4.4 2.9 8.2 7 9.5 4.1-1.3 7-5.1 7-9.5V6l-7-3z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
      <span>SafeHaven</span>
    </div>

    <div class="auth-tabs" role="tablist">
      <button class="auth-tab active" id="tab-login-btn" role="tab" aria-selected="true" aria-controls="auth-login" onclick="window.__authSwitchTab('login')">Sign in</button>
      <button class="auth-tab" id="tab-register-btn" role="tab" aria-selected="false" aria-controls="auth-register" onclick="window.__authSwitchTab('register')">Register</button>
    </div>

    <!-- Login form -->
    <form id="auth-login" class="auth-form" aria-labelledby="tab-login-btn" onsubmit="window.__authLogin(event)">
      <div class="form-group">
        <label class="form-label" for="login-email">Email</label>
        <input id="login-email" type="email" class="form-input" placeholder="you@example.com" required autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">Password</label>
        <input id="login-password" type="password" class="form-input" placeholder="••••••••" required autocomplete="current-password" />
      </div>
      <div id="login-error" class="auth-error" hidden></div>
      <button type="submit" class="btn btn--primary btn--block" id="login-submit-btn">Sign in</button>
      <button type="button" class="btn btn--ghost btn--block btn--sm" onclick="window.__authDemoMode()">Continue as Demo (no account needed)</button>
    </form>

    <!-- Register form -->
    <form id="auth-register" class="auth-form" hidden aria-labelledby="tab-register-btn" onsubmit="window.__authRegister(event)">
      <div class="form-group">
        <label class="form-label" for="reg-name">Full name</label>
        <input id="reg-name" type="text" class="form-input" placeholder="Your name" required autocomplete="name" />
      </div>
      <div class="form-group">
        <label class="form-label" for="reg-email">Email</label>
        <input id="reg-email" type="email" class="form-input" placeholder="you@example.com" required autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label" for="reg-password">Password</label>
        <input id="reg-password" type="password" class="form-input" placeholder="Min. 8 characters" required autocomplete="new-password" minlength="8" />
      </div>
      <div class="form-group">
        <label class="form-label">I am a</label>
        <div class="role-picker" role="radiogroup" aria-label="Role">
          <label class="role-option">
            <input type="radio" name="role" value="parent" checked />
            <span class="role-option__inner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Parent / Guardian
            </span>
          </label>
          <label class="role-option">
            <input type="radio" name="role" value="child" />
            <span class="role-option__inner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Child
            </span>
          </label>
        </div>
      </div>
      <div id="reg-error" class="auth-error" hidden></div>
      <button type="submit" class="btn btn--primary btn--block" id="reg-submit-btn">Create account</button>
    </form>
  </div>
</div>
`;

// -------------------------------------------------------
// Invite code modal (post-registration for children)
// -------------------------------------------------------
const INVITE_MODAL_HTML = `
<div class="auth-invite">
  <p class="auth-invite__lede">Enter the 6-digit code your parent gave you to link your account.</p>
  <div class="form-group">
    <label class="form-label" for="invite-code-input">Invite code</label>
    <input id="invite-code-input" type="text" class="form-input form-input--code"
      maxlength="6" pattern="[0-9]{6}" inputmode="numeric"
      placeholder="123456" autocomplete="one-time-code" />
  </div>
  <div id="invite-error" class="auth-error" hidden></div>
</div>
`;

// -------------------------------------------------------
// AuthUI class
// -------------------------------------------------------
export class AuthUI {
  constructor() {
    this._profile      = null;
    this._isDemoMode   = false;
    this._onReady      = null; // callback when auth is settled
    this._unsubscribe  = null;
  }

  /**
   * Mount the auth layer.
   * @param {Function} onReady — called with (profile|null, isDemoMode)
   *                             when auth state is known.
   */
  async mount(onReady) {
    this._onReady = onReady;

    // Inject auth screen placeholder (hidden until needed)
    const wrap = document.createElement('div');
    wrap.id = 'auth-wrap';
    wrap.innerHTML = AUTH_SCREEN_HTML;
    document.body.prepend(wrap);

    // Wire up globals for the inline onsubmit/onclick handlers
    window.__authSwitchTab = this._switchTab.bind(this);
    window.__authLogin     = this._handleLogin.bind(this);
    window.__authRegister  = this._handleRegister.bind(this);
    window.__authDemoMode  = this._handleDemoMode.bind(this);

    // Subscribe to auth state changes
    this._unsubscribe = onAuthChange(async (session) => {
      if (session) {
        this._profile = await getMyProfile();
        this._hideAuthScreen();
        this._injectUserChip();
        onReady(this._profile, false);
      } else if (!this._isDemoMode) {
        this._showAuthScreen();
      }
    });

    // Bootstrap (gets existing session or null)
    await bootstrapAuth();
  }

  // -------------------------------------------------------
  // Show/hide auth screen
  // -------------------------------------------------------
  _showAuthScreen() {
    document.getElementById('auth-wrap').hidden = false;
    document.getElementById('app-root').hidden = true;
  }

  _hideAuthScreen() {
    document.getElementById('auth-wrap').hidden = true;
    document.getElementById('app-root').hidden = false;
  }

  // -------------------------------------------------------
  // Tab switch
  // -------------------------------------------------------
  _switchTab(tab) {
    const loginForm  = document.getElementById('auth-login');
    const regForm    = document.getElementById('auth-register');
    const loginBtn   = document.getElementById('tab-login-btn');
    const regBtn     = document.getElementById('tab-register-btn');

    const isLogin = tab === 'login';
    loginForm.hidden  = !isLogin;
    regForm.hidden    =  isLogin;
    loginBtn.classList.toggle('active', isLogin);
    regBtn.classList.toggle('active', !isLogin);
    loginBtn.setAttribute('aria-selected', isLogin);
    regBtn.setAttribute('aria-selected', !isLogin);
  }

  // -------------------------------------------------------
  // Login handler
  // -------------------------------------------------------
  async _handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    const btn      = document.getElementById('login-submit-btn');

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    const { error } = await login(email, password);
    if (error) {
      errEl.textContent = error.message;
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
    // On success, onAuthChange fires automatically
  }

  // -------------------------------------------------------
  // Register handler
  // -------------------------------------------------------
  async _handleRegister(e) {
    e.preventDefault();
    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const role     = document.querySelector('input[name="role"]:checked').value;
    const errEl    = document.getElementById('reg-error');
    const btn      = document.getElementById('reg-submit-btn');

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    const { user, error } = await register(email, password, name, role);
    if (error) {
      errEl.textContent = error.message;
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Create account';
      return;
    }

    // Supabase may require email confirmation
    if (user && !user.confirmed_at) {
      errEl.textContent = '✅ Check your email to confirm your account, then sign in.';
      errEl.style.color = 'var(--color-success)';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Create account';
      return;
    }

    // If child, prompt for invite code
    if (role === 'child') {
      this._showInviteCodeModal();
    }
    // onAuthChange fires → hides auth screen
  }

  // -------------------------------------------------------
  // Invite code modal
  // -------------------------------------------------------
  _showInviteCodeModal() {
    if (window.openModal) {
      window.openModal(
        'Link with your parent',
        INVITE_MODAL_HTML,
        `<button class="btn btn--ghost" onclick="window.closeModal()">Skip for now</button>
         <button class="btn btn--primary" onclick="window.__authRedeemCode()">Link account</button>`,
        { size: 'sm' }
      );
      window.__authRedeemCode = this._redeemCode.bind(this);
    }
  }

  async _redeemCode() {
    const codeInput = document.getElementById('invite-code-input');
    const errEl     = document.getElementById('invite-error');
    if (!codeInput) return;

    const code = codeInput.value.trim();
    if (code.length !== 6) {
      errEl.textContent = 'Please enter a 6-digit code.';
      errEl.hidden = false;
      return;
    }

    errEl.hidden = true;
    codeInput.disabled = true;

    const { success, parentName, error } = await redeemInviteCode(code);
    if (!success) {
      errEl.textContent = error?.message || 'Invalid code.';
      errEl.hidden = false;
      codeInput.disabled = false;
      return;
    }

    if (window.closeModal) window.closeModal();
    if (window.showToast) window.showToast('Linked!', `You are now connected to ${parentName}.`, 'safe');
  }

  // -------------------------------------------------------
  // Demo mode
  // -------------------------------------------------------
  _handleDemoMode() {
    this._isDemoMode = true;
    this._hideAuthScreen();
    this._onReady(null, true);
  }

  // -------------------------------------------------------
  // Inject user chip into the header (after login)
  // -------------------------------------------------------
  _injectUserChip() {
    const emailEl   = document.getElementById('header-gmail-email');
    const initialEl = document.getElementById('header-gmail-initial');
    const btn       = document.getElementById('gmail-auth-btn');

    if (this._profile) {
      if (emailEl)   emailEl.textContent = this._profile.name || this._profile.email;
      if (initialEl) initialEl.textContent = (this._profile.name || this._profile.email || '?').charAt(0).toUpperCase();
    }

    // Wire logout
    if (btn) {
      btn.onclick = () => {
        if (confirm('Sign out of SafeHaven?')) {
          logout();
        }
      };
    }
  }

  // -------------------------------------------------------
  // Parent: generate and show invite code
  // -------------------------------------------------------
  async showInviteCodeGenerator() {
    if (!window.openModal) return;

    window.openModal('Invite a child', `
      <p class="modal__lede">Share this code with your child's device. It expires in 24 hours.</p>
      <div class="invite-gen" id="invite-gen-wrap">
        <div class="invite-gen__loading">Generating…</div>
      </div>
    `, `<button class="btn btn--primary" onclick="window.closeModal()">Done</button>`, { size: 'sm' });

    const { code, expiresAt, error } = await generateInviteCode();
    const wrap = document.getElementById('invite-gen-wrap');
    if (!wrap) return;

    if (error) {
      wrap.innerHTML = `<p class="auth-error">${error.message}</p>`;
      return;
    }

    const exp = new Date(expiresAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    wrap.innerHTML = `
      <div class="invite-gen__code">${code}</div>
      <p class="invite-gen__exp">Expires ${exp}</p>
      <button class="btn btn--soft btn--sm btn--block" onclick="navigator.clipboard.writeText('${code}').then(() => window.showToast('Copied', 'Code copied to clipboard', 'safe'))">
        Copy code
      </button>
    `;
  }
}

export const authUI = new AuthUI();
