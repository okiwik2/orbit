import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase, type Eta, type Loc, type Member, type Place, type Profile, type Sos } from './supabase';

export type Person = Member & { profile: Profile; loc: Loc | null };

type Ctx = {
  circles: { id: string; name: string }[];
  circleId: string | null;
  setCircleId: (id: string) => void;
  people: Person[];
  places: Place[];
  etas: Eta[];
  sos: Sos[];
  me: Person | null;
  refresh: () => Promise<void>;
};
const CircleCtx = createContext<Ctx>(null!);

export function CircleProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user.id;
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]);
  const [circleId, setCircleIdState] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [locs, setLocs] = useState<Record<string, Loc>>({});
  const [places, setPlaces] = useState<Place[]>([]);
  const [etas, setEtas] = useState<Eta[]>([]);
  const [sos, setSos] = useState<Sos[]>([]);

  const setCircleId = (id: string) => {
    setCircleIdState(id);
    AsyncStorage.setItem('circle', id).catch(() => {});
  };

  const loadCircles = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('circle_members').select('circle_id, circles(id, name)').eq('user_id', uid);
    const list = (data ?? []).map((r: any) => r.circles).filter(Boolean);
    setCircles(list);
    const saved = await AsyncStorage.getItem('circle').catch(() => null);
    setCircleIdState((cur) => {
      const want = cur ?? saved;
      return list.find((c: any) => c.id === want)?.id ?? list[0]?.id ?? null;
    });
  }, [uid]);

  const loadCircle = useCallback(async () => {
    if (!circleId) return;
    const [m, pl, e] = await Promise.all([
      supabase.from('circle_members').select('*').eq('circle_id', circleId),
      supabase.from('places').select('*').eq('circle_id', circleId).order('created_at'),
      supabase.from('eta_shares').select('*').eq('circle_id', circleId).eq('active', true),
    ]);
    const mem = m.data ?? [];
    setMembers(mem);
    setPlaces(pl.data ?? []);
    setEtas(e.data ?? []);
    const ids = mem.map((x) => x.user_id);
    const [p, l, s] = await Promise.all([
      supabase.from('profiles').select('*').in('id', ids),
      supabase.from('locations_latest').select('*').in('user_id', ids),
      supabase.from('sos_alerts').select('*').in('user_id', ids).eq('status', 'active'),
    ]);
    setProfiles(Object.fromEntries((p.data ?? []).map((x) => [x.id, x])));
    setLocs(Object.fromEntries((l.data ?? []).map((x) => [x.user_id, x])));
    setSos(s.data ?? []);
  }, [circleId]);

  useEffect(() => {
    loadCircles();
  }, [loadCircles]);
  useEffect(() => {
    loadCircle();
  }, [loadCircle]);

  // Live updates. RLS decides what each person is allowed to receive.
  useEffect(() => {
    if (!circleId || !uid) return;
    const ch = supabase
      .channel(`circle-${circleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations_latest' }, (p) => {
        const row = p.new as Loc;
        if (row?.user_id) setLocs((cur) => ({ ...cur, [row.user_id]: row }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'circle_members', filter: `circle_id=eq.${circleId}` }, () => loadCircle())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'places', filter: `circle_id=eq.${circleId}` }, () => loadCircle())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eta_shares', filter: `circle_id=eq.${circleId}` }, (p) => {
        const row = p.new as Eta;
        setEtas((cur) => [...cur.filter((x) => x.id !== row.id), ...(row.active ? [row] : [])]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, (p) => {
        const row = p.new as Sos;
        setSos((cur) => [...cur.filter((x) => x.id !== row.id), ...(row.status === 'active' ? [row] : [])]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
        const row = p.new as Profile;
        setProfiles((cur) => (cur[row.id] ? { ...cur, [row.id]: row } : cur));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [circleId, uid, loadCircle]);

  const people = useMemo(
    () =>
      members
        .filter((m) => profiles[m.user_id])
        .map((m) => {
          const paused = !m.sharing || (m.paused_until && new Date(m.paused_until) > new Date());
          return { ...m, profile: profiles[m.user_id], loc: paused && m.user_id !== uid ? null : locs[m.user_id] ?? null };
        })
        .sort((a, b) => (a.user_id === uid ? -1 : b.user_id === uid ? 1 : a.profile.name.localeCompare(b.profile.name))),
    [members, profiles, locs, uid],
  );

  const refresh = async () => {
    await loadCircles();
    await loadCircle();
  };

  return (
    <CircleCtx.Provider
      value={{ circles, circleId, setCircleId, people, places, etas, sos, me: people.find((p) => p.user_id === uid) ?? null, refresh }}>
      {children}
    </CircleCtx.Provider>
  );
}

export const useCircle = () => useContext(CircleCtx);
