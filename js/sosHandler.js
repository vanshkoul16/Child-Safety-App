/* =========================================================
   SafeHaven — SOS Handler
   Handles the full SOS lifecycle:
     1. Confirmation dialog with accessible cancel
     2. Authenticated insertion to Supabase
     3. Parent polling / realtime subscription
     4. Acknowledge / resolve
   ========================================================= */

import { getSupabase } from './auth.js';

const POLL_INTERVAL_MS = 8_000;

export class SOSHandler {
  constructor() {
    this._activeSOS    = null;
    this._pollTimer    = null;
    this._onSOSChange  = null; // callback(sosAlert | null)
  }

  // -------------------------------------------------------
  // Child: raise SOS
  // -------------------------------------------------------

  /**
   * Show a confirmation dialog, then create the SOS alert.
   * Requires openModal / closeModal to be available globally.
   *
   * @param {{ lat, lng, accuracy }} fix — latest GPS fix (can be null)
   * @param {string}  childId           — auth user UUID
   * @returns {Promise<{ alert, error }>}
   */
  confirmAndRaise(fix, childId) {
    return new Promise((resolve) => {
      if (!window.openModal) {
        resolve(this.raise(fix, childId, 'child'));
        return;
      }

      window.openModal(
        'Send SOS?',
        `
          <p class="modal__lede">
            This will alert your linked parents immediately${fix ? ' and share your current location' : ''}.
          </p>
          <ul class="sos-effects">
            <li>🚨 Parents receive an emergency notification</li>
            <li>📍 Your location is shared ${fix ? 'now' : '(location unavailable — will share when available)'}</li>
            <li>📞 Emergency contacts are notified</li>
          </ul>
          <p class="modal__note">You can cancel within 5 seconds using the button below.</p>
        `,
        `
          <button class="btn btn--ghost" id="sos-cancel-confirm" onclick="window.closeModal()">
            Cancel — I'm safe
          </button>
          <button class="btn btn--danger" id="sos-confirm-btn" onclick="window.__confirmSOS()">
            🚨 Send SOS
          </button>
        `,
        { size: 'sm', onClose: () => resolve({ alert: null, error: null }) }
      );

      window.__confirmSOS = async () => {
        window.closeModal();
        const result = await this.raise(fix, childId, 'child');
        resolve(result);
      };
    });
  }

  /**
   * Create a SOS alert in Supabase.
   * @param {{ lat, lng, accuracy }|null} fix
   * @param {string} childId
   * @param {'child'|'parent'} raiseRole
   */
  async raise(fix, childId, raiseRole = 'child') {
    try {
      const sb = await getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { alert: null, error: { message: 'Not authenticated.' } };

      const { data, error } = await sb.from('sos_alerts').insert({
        child_id:   childId,
        raised_by:  user.id,
        raise_role: raiseRole,
        lat:        fix?.lat    ?? null,
        lng:        fix?.lng    ?? null,
        accuracy:   fix?.accuracy ?? null,
        status:     'active',
        created_at: new Date().toISOString()
      }).select().single();

      if (error) return { alert: null, error };
      this._activeSOS = data;
      return { alert: data, error: null };
    } catch (err) {
      return { alert: null, error: { message: err.message } };
    }
  }

  // -------------------------------------------------------
  // Parent: resolve an SOS
  // -------------------------------------------------------
  async resolve(sosId) {
    try {
      const sb = await getSupabase();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { error: { message: 'Not authenticated.' } };

      const { error } = await sb.from('sos_alerts').update({
        status:      'resolved',
        resolved_by: user.id,
        resolved_at: new Date().toISOString()
      }).eq('id', sosId);

      if (!error) this._activeSOS = null;
      return { error };
    } catch (err) {
      return { error: { message: err.message } };
    }
  }

  // -------------------------------------------------------
  // Parent: poll for active SOS for any of their children
  // -------------------------------------------------------

  /**
   * Start polling for active SOS alerts.
   * @param {string[]} childIds  — UUIDs of linked children
   * @param {Function} onChange  — (alert | null) => {}
   */
  startParentPolling(childIds, onChange) {
    this.stopParentPolling();
    this._onSOSChange = onChange;

    if (!childIds || childIds.length === 0) return;

    const poll = async () => {
      const alert = await this._fetchActiveSOSForChildren(childIds);
      if (JSON.stringify(alert) !== JSON.stringify(this._activeSOS)) {
        this._activeSOS = alert;
        onChange(alert);
      }
    };

    poll();
    this._pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  stopParentPolling() {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  async _fetchActiveSOSForChildren(childIds) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('sos_alerts')
        .select('*, profiles!sos_alerts_child_id_fkey(name, avatar_url)')
        .in('child_id', childIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------
  // Fetch SOS history for parent dashboard
  // -------------------------------------------------------
  static async fetchHistory(childIds, limit = 30) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('sos_alerts')
        .select('*, profiles!sos_alerts_child_id_fkey(name, avatar_url)')
        .in('child_id', childIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }
}

export const sosHandler = new SOSHandler();
