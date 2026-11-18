// Receives background location from the free OwnTracks iPhone app (HTTP mode).
// Auth: HTTP Basic, username = Orbit user id, password = token made in Orbit's settings.
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Basic ')) return new Response('unauthorized', { status: 401 });
  const [uid, token] = atob(auth.slice(6)).split(':');
  if (!/^[0-9a-f-]{36}$/.test(uid ?? '') || !token) return new Response('unauthorized', { status: 401 });

  const { data: ok } = await supabase.rpc('owntracks_check', { uid, token });
  if (!ok) return new Response('unauthorized', { status: 401 });

  const msg = await req.json().catch(() => null);
  const { data: memberships } = await supabase.from('circle_members').select('sharing, paused_until').eq('user_id', uid);
  const sharing = (memberships ?? []).some((m) => m.sharing && (!m.paused_until || new Date(m.paused_until) < new Date()));
  if (sharing && msg?._type === 'location' && typeof msg.lat === 'number' && typeof msg.lon === 'number') {
    const { data: settings } = await supabase.from('user_settings').select('precise').eq('user_id', uid).single();
    const round = (v: number) => (settings?.precise === false ? Math.round(v * 100) / 100 : v); // ~1 km when approximate
    await supabase.from('locations_latest').upsert({
      user_id: uid,
      lat: round(msg.lat),
      lng: round(msg.lon),
      accuracy: settings?.precise === false ? 1000 : (msg.acc ?? null),
      speed: typeof msg.vel === 'number' && msg.vel >= 0 ? msg.vel / 3.6 : null, // km/h → m/s
      heading: msg.cog ?? null,
      battery: typeof msg.batt === 'number' ? msg.batt / 100 : null,
      charging: msg.bs === 2 || msg.bs === 3,
      source: 'owntracks',
      recorded_at: new Date((msg.tst ?? Date.now() / 1000) * 1000).toISOString(),
    });
  }
  // OwnTracks expects a JSON array back
  return Response.json([]);
});
