/* =========================================================
   SafeHaven — Geofence Sync
   Client-side geofencing that persists zone events to
   Supabase and avoids duplicate alerts.
   ========================================================= */

import { getSupabase } from './auth.js';
import { calculateDistance } from './safetyEngine.js';

const ACCURACY_BUFFER = 15; // Extra metres to add to GPS accuracy for hysteresis

export class GeofenceSync {
  constructor() {
    // Map of zoneId → 'inside' | 'outside'
    this._zoneState = {};
  }

  /**
   * Evaluate a new GPS fix against all safe zones.
   * Inserts zone_events for genuine transitions only.
   *
   * @param {string}   childId    — auth user UUID
   * @param {{ lat, lng, accuracy }} fix
   * @param {Array}    safeZones  — from Supabase (id, lat, lng, radius, name, is_restricted)
   * @returns {Array}  array of { zone, eventType } for this tick
   */
  async evaluateFix(childId, fix, safeZones) {
    const events = [];

    for (const zone of safeZones) {
      const dist = calculateDistance(fix.lat, fix.lng, zone.lat, zone.lng);

      // Use GPS accuracy + buffer for hysteresis to avoid jitter
      const effectiveRadius = zone.radius + (fix.accuracy || 0) + ACCURACY_BUFFER;
      const isInside = dist <= effectiveRadius;

      const prevState = this._zoneState[zone.id] ?? null;

      if (prevState === null) {
        // First observation — just record state, no event
        this._zoneState[zone.id] = isInside ? 'inside' : 'outside';
        continue;
      }

      if (isInside && prevState === 'outside') {
        // Entered zone
        this._zoneState[zone.id] = 'inside';
        events.push({ zone, eventType: 'enter' });
        await this._persistEvent(childId, zone.id, 'enter', fix);

      } else if (!isInside && prevState === 'inside') {
        // Exited zone
        this._zoneState[zone.id] = 'outside';
        events.push({ zone, eventType: 'exit' });
        await this._persistEvent(childId, zone.id, 'exit', fix);
      }
    }

    return events;
  }

  async _persistEvent(childId, zoneId, eventType, fix) {
    try {
      const sb = await getSupabase();
      await sb.from('zone_events').insert({
        child_id:   childId,
        zone_id:    zoneId,
        event_type: eventType,
        lat:        fix.lat,
        lng:        fix.lng,
        occurred_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[GeofenceSync] Failed to persist zone event:', err.message);
    }
  }

  /**
   * Fetch recent zone events for a child (parent dashboard).
   * @param {string} childId
   * @param {number} limit
   */
  static async fetchZoneEvents(childId, limit = 50) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('zone_events')
        .select('id, zone_id, event_type, lat, lng, occurred_at, safe_zones(name, icon, color, is_restricted)')
        .eq('child_id', childId)
        .order('occurred_at', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch all safe zones for a family.
   */
  static async fetchSafeZones(familyId) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('safe_zones')
        .select('*')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true });

      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }

  /**
   * Create a safe zone.
   */
  static async createZone({ familyId, createdBy, name, lat, lng, radius, icon, color, isRestricted }) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb.from('safe_zones').insert({
        family_id:     familyId,
        created_by:    createdBy,
        name,
        lat,
        lng,
        radius,
        icon:          icon || 'shield',
        color:         color || '#2563eb',
        is_restricted: isRestricted || false
      }).select().single();

      if (error) return { zone: null, error };
      return { zone: data, error: null };
    } catch (err) {
      return { zone: null, error: { message: err.message } };
    }
  }

  /**
   * Delete a safe zone.
   */
  static async deleteZone(zoneId) {
    try {
      const sb = await getSupabase();
      const { error } = await sb.from('safe_zones').delete().eq('id', zoneId);
      return { error };
    } catch (err) {
      return { error: { message: err.message } };
    }
  }

  /**
   * Update a safe zone.
   */
  static async updateZone(zoneId, updates) {
    try {
      const sb = await getSupabase();
      const { data, error } = await sb
        .from('safe_zones')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', zoneId)
        .select()
        .single();
      if (error) return { zone: null, error };
      return { zone: data, error: null };
    } catch (err) {
      return { zone: null, error: { message: err.message } };
    }
  }
}

export const geofenceSync = new GeofenceSync();
