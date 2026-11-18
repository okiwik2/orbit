// Sends push notifications to Android (Expo push) and iPhone/web (Web Push).
// Called only by the database (private.push) with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:orbit@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.headers.get('x-orbit-secret') !== Deno.env.get('NOTIFY_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { recipients, title, body, data } = await req.json();
  const { data: tokens } = await supabase.from('push_tokens').select('token, kind').in('user_id', recipients);
  if (!tokens?.length) return Response.json({ sent: 0 });

  const urgent = data?.type === 'sos';
  const expo = tokens.filter((t) => t.kind === 'expo').map((t) => ({
    to: t.token, title, body, data, sound: 'default',
    priority: urgent ? 'high' : 'default',
    channelId: urgent ? 'sos' : 'default',
  }));
  const dead: string[] = [];

  if (expo.length) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expo),
    });
    const json = await res.json().catch(() => ({}));
    (json.data ?? []).forEach((r: { status: string; details?: { error?: string } }, i: number) => {
      if (r.details?.error === 'DeviceNotRegistered') dead.push(expo[i].to);
    });
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
  return Response.json({ sent: tokens.length - dead.length });
});
