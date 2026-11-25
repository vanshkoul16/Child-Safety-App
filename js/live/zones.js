/* =========================================================
   SafeHaven Live - zone kinds
   Safe zones: places the child is expected to be (arriving is good news).
   Restricted zones: places the child should stay out of (entering is the alert).
   The kind is stored on safe_zones.kind and snapshotted on zone_events.zone_kind.
   ========================================================= */

export const ZONE_KINDS = {
  safe: {
    key: 'safe',
    label: 'Safe zone',
    plural: 'Safe zones',
    tone: 'safe',
    ic: 'shieldCheck',
    color: '#1f8a5b',
    pick: 'Home, school, a friend’s place. You’re told when your child arrives or leaves.'
  },
  restricted: {
    key: 'restricted',
    label: 'Restricted zone',
    plural: 'Restricted zones',
    tone: 'danger',
    ic: 'ban',
    color: '#d6453d',
    pick: 'A busy road, a river bank, anywhere off-limits. You’re alerted the moment your child enters.'
  }
};

// Rows from before zone kinds existed have no kind: they are safe zones
export const kindOf = (k) => (k === 'restricted' ? 'restricted' : 'safe');
export const zoneKind = (zone) => ZONE_KINDS[kindOf(zone && zone.kind)];
export const isRestricted = (zone) => kindOf(zone && zone.kind) === 'restricted';

/* How a zone event reads in the guardian's feed and toasts.
   ev: { transition: 'enter' | 'exit', zone_kind } */
export function zoneEventView(ev) {
  const restricted = kindOf(ev.zone_kind) === 'restricted';
  const enter = ev.transition === 'enter';
  if (restricted) {
    return enter
      ? { tone: 'danger', ic: 'ban', verb: 'entered', kindLabel: 'Automatic · restricted zone', short: 'Restricted zone', toast: 'critical', toastTitle: 'Restricted zone' }
      : { tone: 'safe', ic: 'checkCircle', verb: 'left', kindLabel: 'Automatic · restricted zone', short: 'Restricted zone', toast: 'safe', toastTitle: 'Restricted zone' };
  }
  return enter
    ? { tone: 'safe', ic: 'checkCircle', verb: 'arrived at', kindLabel: 'Automatic · safe zone', short: 'Safe zone', toast: 'safe', toastTitle: 'Safe zone' }
    : { tone: 'attention', ic: 'pin', verb: 'left', kindLabel: 'Automatic · safe zone', short: 'Safe zone', toast: 'warning', toastTitle: 'Safe zone' };
}
