import AsyncStorage from '@react-native-async-storage/async-storage';

import { refreshMyEtas } from './eta';
import { coarsen } from './geo';
import { supabase } from './supabase';

type Fix = {
  lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null;
  battery: number | null; charging: boolean | null; source: 'app' | 'web'; at: number;
};

type Prefs = { at: number; sharingAnywhere: boolean; precise: boolean; driving: boolean; crash: boolean };

/** Cached for 2 minutes so background fixes don't hit the DB for settings every time. */
export async function getPrefs(uid: string, force = false): Promise<Prefs> {
  const raw = await AsyncStorage.getItem('prefs').catch(() => null);
  const cached: Prefs | null = raw ? JSON.parse(raw) : null;
  if (!force && cached && Date.now() - cached.at < 120_000) return cached;
  const [m, s] = await Promise.all([
    supabase.from('circle_members').select('sharing, paused_until').eq('user_id', uid),
    supabase.from('user_settings').select('*').eq('user_id', uid).single(),
  ]);
  const now = Date.now();
  const prefs: Prefs = {
    at: now,
    sharingAnywhere: (m.data ?? []).some((r) => r.sharing && (!r.paused_until || new Date(r.paused_until).getTime() < now)),
    precise: s.data?.precise ?? true,
    driving: s.data?.driving_enabled ?? true,
    crash: s.data?.crash_detection ?? true,
  };
  await AsyncStorage.setItem('prefs', JSON.stringify(prefs)).catch(() => {});
  return prefs;
}

export const invalidatePrefs = () => AsyncStorage.removeItem('prefs').catch(() => {});

/** Upload one fix, respecting pause and approximate mode. Returns false if nothing was sent. */
export async function uploadFix(fix: Fix) {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return false;
  const prefs = await getPrefs(uid);
  if (!prefs.sharingAnywhere) return false; // paused or off everywhere: nothing leaves the phone
  const pos = prefs.precise ? { lat: fix.lat, lng: fix.lng } : coarsen(fix.lat, fix.lng);
  const { error } = await supabase.from('locations_latest').upsert({
    user_id: uid,
    ...pos,
    accuracy: prefs.precise ? fix.accuracy : 1000,
    speed: fix.speed,
    heading: prefs.precise ? fix.heading : null,
    battery: fix.battery,
    charging: fix.charging,
    source: fix.source,
    recorded_at: new Date(fix.at).toISOString(),
  });
  if (!error) refreshMyEtas(uid, { lat: fix.lat, lng: fix.lng }).catch(() => {});
  return !error;
}
