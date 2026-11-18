import { supabase } from './supabase';

// Free driving route from the public OSRM server. Fine for a family-sized app.
export async function routeEta(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
    );
    const j = await res.json();
    const r = j.routes?.[0];
    if (!r) return null;
    return { seconds: r.duration as number, meters: r.distance as number };
  } catch {
    return null;
  }
}

let lastEtaUpdate = 0;
/** Called on each location fix; refreshes my active ETA shares at most every 90 s. */
export async function refreshMyEtas(userId: string, here: { lat: number; lng: number }) {
  if (Date.now() - lastEtaUpdate < 90_000) return;
  lastEtaUpdate = Date.now();
  const { data } = await supabase.from('eta_shares').select('*').eq('user_id', userId).eq('active', true);
  for (const e of data ?? []) {
    const r = await routeEta(here, { lat: e.dest_lat, lng: e.dest_lng });
    if (!r) continue;
    await supabase.from('eta_shares').update({
      eta_at: new Date(Date.now() + r.seconds * 1000).toISOString(),
      distance_m: r.meters,
      updated_at: new Date().toISOString(),
    }).eq('id', e.id);
  }
}
