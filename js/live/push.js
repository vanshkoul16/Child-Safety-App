/* =========================================================
   SafeHaven Live - Web Push subscription for guardian devices
   ========================================================= */

import { sb, call, config } from './api.js';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// unsupported | unconfigured | denied | off | on
export async function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  if (!config.vapidPublicKey) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return 'off';
    // Only "on" if this device's subscription is stored for the signed-in user
    const { data } = await sb().from('push_subscriptions').select('id').eq('endpoint', sub.endpoint);
    return data && data.length ? 'on' : 'off';
  } catch (e) {
    return 'off';
  }
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed for this site.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) });
  }
  const json = sub.toJSON();
  await call('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300)
  });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await sb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
