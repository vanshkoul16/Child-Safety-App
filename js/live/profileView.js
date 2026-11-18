/* =========================================================
   SafeHaven Live - Profile tab: name and personal details
   Shared by the guardian and child dashboards. Only the
   signed-in user's own profile row is changed; the database
   (column grants + "profiles: update own") enforces that.
   ========================================================= */

import { sb, esc, friendlyError, avatarHtml, providerLabel } from './api.js';
import { icon } from '../icons.js';
import { showToast } from '../app.js';

const DETAIL_FIELDS = ['phone', 'date_of_birth', 'address'];
const PHONE_RE = /^\+?[0-9 ().-]+$/;

/* False until migration 20261118000000_profile_details.sql is applied: select('*') then has no such keys */
export const hasDetailColumns = (p) => Boolean(p) && DETAIL_FIELDS.every((k) => Object.prototype.hasOwnProperty.call(p, k));

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ageFrom(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

function formatDob(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
  const age = ageFrom(iso);
  return age >= 0 ? `${date} · ${age} ${age === 1 ? 'year' : 'years'} old` : date;
}

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/* Normalised form values; empty optional fields become '' (saved as null) */
export function normalizeProfile(raw) {
  return {
    display_name: clean(raw.display_name),
    phone: clean(raw.phone),
    date_of_birth: String(raw.date_of_birth || '').trim(),
    address: String(raw.address == null ? '' : raw.address).trim()
  };
}

/* The first problem with the values, or '' when they can be saved. Mirrors the database checks. */
export function profileProblem(v, today = todayIso()) {
  if (!v.display_name) return 'Enter your name.';
  if (v.display_name.length > 60) return 'Name must be 60 characters or fewer.';
  if (v.phone) {
    const digits = v.phone.replace(/\D/g, '').length;
    if (!PHONE_RE.test(v.phone) || v.phone.length > 24 || digits < 6 || digits > 15) {
      return 'Enter a valid phone number, e.g. +91 98765 43210.';
    }
  }
  if (v.date_of_birth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date_of_birth) || Number.isNaN(Date.parse(v.date_of_birth))) return 'Enter a valid date of birth.';
    if (v.date_of_birth < '1900-01-01') return 'Date of birth must be after 1900.';
    if (v.date_of_birth > today) return "Date of birth can't be in the future.";
  }
  if (v.address.length > 200) return 'Address must be 200 characters or fewer.';
  return '';
}

export class ProfileTab {
  /**
   * @param {object} me      the signed-in user's profile row (updated in place on save)
   * @param {object} user    the Supabase auth user
   * @param {Function} rerender  called with no arguments when the tab needs to redraw
   */
  constructor(me, user, rerender) {
    this.me = me;
    this.user = user;
    this.rerender = rerender;
    this.editing = false;
    this.draft = null;
    this.error = '';
    this.saving = false;
  }

  /* True while focus is in the form: callers skip routine re-renders so the caret isn't lost */
  isBusy(root) {
    const a = document.activeElement;
    return Boolean(this.editing && a && root.contains(a) && a.closest('[data-form="profile"]'));
  }

  startEditing() {
    const m = this.me;
    this.draft = {
      display_name: m.display_name || '',
      phone: m.phone || '',
      date_of_birth: m.date_of_birth || '',
      address: m.address || ''
    };
    this.editing = true;
    this.error = '';
    this.rerender();
    const input = document.querySelector('[data-form="profile"] [name="display_name"]');
    if (input) input.focus();
  }

  stopEditing() {
    this.editing = false;
    this.draft = null;
    this.error = '';
    this.rerender();
  }

  /* Delegated events from the dashboard root. Each returns true when it handled the event. */
  onClick(e) {
    const el = e.target.closest('[data-profile]');
    if (!el || el.disabled) return false;
    if (el.dataset.profile === 'edit') this.startEditing();
    else if (el.dataset.profile === 'cancel') this.stopEditing();
    else return false;
    return true;
  }

  onInput(e) {
    const t = e.target;
    if (!this.draft || !t.closest || !t.closest('[data-form="profile"]') || !(t.name in this.draft)) return false;
    this.draft[t.name] = t.value;
    return true;
  }

  onSubmit(e) {
    if (!e.target.closest || !e.target.closest('[data-form="profile"]')) return false;
    e.preventDefault();
    this.save();
    return true;
  }

  async save() {
    if (this.saving || !this.draft) return;
    const details = hasDetailColumns(this.me);
    const v = normalizeProfile(this.draft);
    const problem = profileProblem(v);
    if (problem) {
      this.error = problem;
      this.rerender();
      return;
    }
    const patch = { display_name: v.display_name };
    if (details) {
      patch.phone = v.phone || null;
      patch.date_of_birth = v.date_of_birth || null;
      patch.address = v.address || null;
    }
    this.saving = true;
    this.error = '';
    this.rerender();
    try {
      const { data, error } = await sb().from('profiles').update(patch).eq('id', this.me.id).select();
      if (error || !data || !data.length) throw error || new Error('forbidden');
      Object.assign(this.me, data[0]);
      this.editing = false;
      this.draft = null;
      window.dispatchEvent(new CustomEvent('safehaven:profile-updated', { detail: { profile: this.me, user: this.user } }));
      showToast('Profile updated', 'Your name and details are saved.', 'safe');
    } catch (err) {
      // PGRST204: the personal-details migration isn't applied on this server
      const missingColumn = err && (err.code === 'PGRST204' || /Could not find the '\w+' column/.test(err.message || ''));
      this.error = missingColumn
        ? "Phone, date of birth and address aren't enabled on this server yet. Reload the page to edit just your name."
        : friendlyError(err);
    } finally {
      this.saving = false;
      this.rerender();
    }
  }

  /* ---------------- rendering ---------------- */

  html() {
    const m = this.me;
    const isParent = m.role === 'parent';
    const details = hasDetailColumns(m);
    const email = this.user && this.user.email ? this.user.email : '';
    return `
      <div class="profile-tab">
        <section class="card profile-hero">
          ${avatarHtml(m.display_name, 'xl')}
          <div class="profile-hero__body">
            <h2 class="profile-hero__name">${esc(m.display_name)}</h2>
            <p class="profile-hero__meta">${isParent ? 'Guardian' : 'Child'}${email ? ` · ${esc(email)}` : ''}</p>
            ${m.public_id ? `<span class="mono live-public-id">${esc(m.public_id)}</span>` : ''}
          </div>
          ${this.editing ? '' : `<button class="btn btn--soft btn--sm profile-hero__edit" data-profile="edit">${icon('user', 15)} Edit profile</button>`}
        </section>

        <section class="group">
          <h3 class="group__title">${icon('idCard', 15)} Personal details</h3>
          ${this.editing ? this.formHtml(details) : this.detailsHtml(details)}
          <p class="fine">Only you and the ${isParent ? 'children' : 'guardians'} linked to your account can see these details.</p>
        </section>

        <section class="group">
          <h3 class="group__title">${icon('lock', 15)} Sign-in</h3>
          <div class="card card--flush">
            <div class="row"><div class="row__body"><div class="row__title">Email</div><div class="row__sub">${esc(email || '—')}</div></div></div>
            <div class="row"><div class="row__body"><div class="row__title">Signs in with</div><div class="row__sub">${esc(providerLabel(this.user))}</div></div></div>
            <div class="row"><div class="row__body"><div class="row__title">Account type</div><div class="row__sub">${isParent ? 'Guardian' : 'Child'} · account type and ID can't be changed</div></div></div>
          </div>
        </section>
      </div>
    `;
  }

  detailsHtml(details) {
    const m = this.me;
    const value = (v, empty = 'Not added') => (v ? esc(v) : `<span class="profile-details__empty">${empty}</span>`);
    const missing = '<span class="profile-details__empty">Not available yet</span>';
    return `
      <div class="card card--flush">
        <dl class="profile-details">
          <div class="profile-details__row"><dt>${icon('user', 15)} Full name</dt><dd>${esc(m.display_name)}</dd></div>
          <div class="profile-details__row"><dt>${icon('phone', 15)} Phone</dt><dd>${details ? (m.phone ? `<a href="tel:${esc(m.phone.replace(/[^\d+]/g, ''))}">${esc(m.phone)}</a>` : value('')) : missing}</dd></div>
          <div class="profile-details__row"><dt>${icon('calendar', 15)} Date of birth</dt><dd>${details ? value(formatDob(m.date_of_birth)) : missing}</dd></div>
          <div class="profile-details__row"><dt>${icon('home', 15)} Home address</dt><dd class="profile-details__multiline">${details ? value(m.address) : missing}</dd></div>
        </dl>
      </div>
      ${details ? '' : this.notEnabledNote()}
    `;
  }

  notEnabledNote() {
    return `<div class="live-note tone-attention profile-note" role="status">${icon('info', 16)}<span>Phone, date of birth and address aren't enabled on this server yet. You can still change your name.</span></div>`;
  }

  formHtml(details) {
    const d = this.draft;
    const opt = '<span class="field__hint">Optional</span>';
    return `
      <form class="card form profile-form" data-form="profile" novalidate>
        <label class="field"><span class="field__label">Full name</span>
          <input class="input" name="display_name" maxlength="60" required autocomplete="name" value="${esc(d.display_name)}" /></label>
        ${details ? `
          <div class="form__row">
            <label class="field"><span class="field__label">Phone ${opt}</span>
              <input class="input" type="tel" name="phone" maxlength="24" autocomplete="tel" inputmode="tel" placeholder="+91 98765 43210" value="${esc(d.phone)}" /></label>
            <label class="field"><span class="field__label">Date of birth ${opt}</span>
              <input class="input" type="date" name="date_of_birth" min="1900-01-01" max="${todayIso()}" value="${esc(d.date_of_birth)}" /></label>
          </div>
          <label class="field"><span class="field__label">Home address ${opt}</span>
            <textarea class="input input--area" name="address" rows="3" maxlength="200" autocomplete="street-address" placeholder="House, street, city">${esc(d.address)}</textarea></label>
        ` : this.notEnabledNote()}
        <p class="form-error" role="alert" ${this.error ? '' : 'hidden'}>${esc(this.error)}</p>
        <div class="profile-form__actions">
          <button type="button" class="btn btn--ghost" data-profile="cancel" ${this.saving ? 'disabled' : ''}>Cancel</button>
          <button type="submit" class="btn btn--primary" ${this.saving ? 'disabled' : ''}>${this.saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    `;
  }
}
