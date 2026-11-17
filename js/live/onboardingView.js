/* =========================================================
   SafeHaven Live - first-time setup for OAuth (Google) accounts
   A Google sign-up creates the auth user without a SafeHaven
   profile. Until this screen completes, the account has no
   access to any family data. complete_onboarding() validates
   the choice in the database and makes it permanent.
   ========================================================= */

import { call, esc, friendlyError, readPendingRole, clearPendingRole, providerLabel } from './api.js';
import { rolePicker, ROLE_COPY } from './authView.js';
import { icon } from '../icons.js';
import { prefersReducedMotion } from '../motion.js';

export function renderOnboarding(root, { user, onDone, onCancel }) {
  const preset = readPendingRole();
  const meta = user.user_metadata || {};
  const suggested = String(meta.full_name || meta.name || meta.display_name || (user.email || '').split('@')[0] || '').trim().slice(0, 60);
  const submitLabel = (r) => (r ? `Create ${ROLE_COPY[r].title} account` : 'Create account');

  root.className = 'live-root';
  root.innerHTML = `
    <div class="live-auth live-auth--single ${prefersReducedMotion() ? '' : 'is-entering'}">
      <div class="live-auth__card card">
        <div class="signin-hero">
          <span class="signin-hero__mark">${icon('userPlus', 24)}</span>
          <h1 class="display live-auth__title">Finish setting up</h1>
          <p class="modal__lede">Signed in with ${esc(providerLabel(user))} as <strong>${esc(user.email || 'your account')}</strong>. One last step before your dashboard.</p>
        </div>
        <form class="form" id="live-onboard-form" novalidate>
          ${rolePicker(preset)}
          <label class="field">
            <span class="field__label">Display name <span class="field__hint">shown to your linked family</span></span>
            <input class="input" name="display_name" type="text" maxlength="60" required autocomplete="nickname" value="${esc(suggested)}" />
          </label>
          <div class="live-note tone-attention">${icon('lock', 16)}<span>The account type is permanent. A child account can never become a guardian account, or the other way round. Each person needs their own Google account.</span></div>
          <p class="form-error" id="live-onboard-error" role="alert" hidden></p>
          <button type="submit" class="btn btn--primary btn--block btn--lg" data-onboard-submit>${submitLabel(preset)}</button>
          <button type="button" class="btn btn--ghost btn--block" data-onboard-cancel>Cancel and sign out</button>
        </form>
      </div>
    </div>
  `;

  const form = root.querySelector('#live-onboard-form');
  const errEl = root.querySelector('#live-onboard-error');
  const submit = root.querySelector('[data-onboard-submit]');
  const showError = (msg) => { errEl.textContent = msg; errEl.hidden = !msg; };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'role') submit.textContent = submitLabel(e.target.value);
  });
  root.querySelector('[data-onboard-cancel]').addEventListener('click', () => {
    clearPendingRole();
    onCancel();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const fd = new FormData(form);
    const role = fd.get('role');
    const name = String(fd.get('display_name') || '').trim();
    if (role !== 'parent' && role !== 'child') return showError('Choose who this account is for.');
    if (!name) return showError('Enter a display name.');

    submit.disabled = true;
    submit.classList.add('is-busy');
    try {
      const res = await call('complete_onboarding', { p_role: role, p_display_name: name.slice(0, 60) });
      clearPendingRole();
      onDone(res);
    } catch (err) {
      if (err.code === 'already_onboarded') {
        // Set up in another tab or device meanwhile: the stored profile wins
        clearPendingRole();
        onDone(null);
        return;
      }
      showError(friendlyError(err));
      submit.disabled = false;
      submit.classList.remove('is-busy');
    }
  });
}
