// Sends push notifications: Android via Firebase Cloud Messaging, iPhone/web via Web Push.
// Called only by the database (private.push) with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:orbit@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);
const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');

// ---- Google OAuth token for FCM (signed JWT, cached ~55 min)
let cached: { token: string; exp: number } | null = null;
const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function googleToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${claims}.${b64url(sig)}`,
  });
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + 55 * 60_000 };
  return cached.token;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-orbit-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { recipients, title, body, data } = await req.json();
  const { data: tokens, error } = await supabase.from('push_tokens').select('token, kind').in('user_id', recipients);
  if (error) return Response.json({ sent: 0, error: error.message }, { status: 500 });
  if (!tokens?.length) return Response.json({ sent: 0, tokens: 0 });

  const urgent = data?.type === 'sos';
  const dead: string[] = [];
  const statuses: number[] = [];
  // FCM data values must be strings
  const strData = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]));

  const fcm = tokens.filter((t) => t.kind === 'fcm');
  if (fcm.length && sa.private_key) {
    const access = await googleToken();
    await Promise.all(fcm.map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title, body },
            data: strData,
            android: {
              priority: urgent ? 'HIGH' : 'NORMAL',
              notification: { channel_id: urgent ? 'sos' : 'default', sound: 'default' },
            },
          },
        }),
      });
      statuses.push(res.status);
      if (res.status === 404 || res.status === 400) {
        const err = await res.text();
        if (/UNREGISTERED|not a valid FCM registration token|registration token/i.test(err)) dead.push(t.token);
      }
    }));
  }

  await Promise.all(tokens.filter((t) => t.kind === 'web').map(async (t) => {
    try {
      await webpush.sendNotification(JSON.parse(t.token), JSON.stringify({ title, body, data }),
        { urgency: urgent ? 'high' : 'normal', TTL: urgent ? 3600 : 600 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(t.token);
    }
  }));

  if (dead.length) await supabase.from('push_tokens').delete().in('token', dead);
  return Response.json({ sent: tokens.length - dead.length, tokens: tokens.length, fcm: statuses, removed: dead.length });
});
