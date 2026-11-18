// Web Push for the iPhone home-screen app (iOS 16.4+) and desktop browsers.
import { supabase } from './supabase';

const VAPID = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID);

/** Must be called from a button tap on iPhone. */
export async function registerPush(uid: string) {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` });
  await navigator.serviceWorker.ready;
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  await supabase.from('push_tokens').upsert({ token: JSON.stringify(sub), user_id: uid, kind: 'web' });
  return true;
}

export function onNotificationTap(cb: (data: Record<string, any>) => void) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  const h = (e: MessageEvent) => e.data?.type === 'orbit-tap' && cb(e.data.data ?? {});
  navigator.serviceWorker.addEventListener('message', h);
  return () => navigator.serviceWorker.removeEventListener('message', h);
}
