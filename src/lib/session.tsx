import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase, type Profile, type Settings } from './supabase';

type Ctx = {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  settings: Settings | null;
  reload: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
};
const SessionCtx = createContext<Ctx>(null!);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const reload = async () => {
    if (!uid) return;
    const [p, s] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('user_settings').select('*').eq('user_id', uid).single(),
    ]);
    setProfile(p.data);
    setSettings(s.data);
  };
  useEffect(() => {
    if (uid) reload();
    else {
      setProfile(null);
      setSettings(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const updateSettings = async (patch: Partial<Settings>) => {
    if (!uid) return;
    setSettings((s) => (s ? { ...s, ...patch } : s));
    await supabase.from('user_settings').update(patch).eq('user_id', uid);
  };
  const updateProfile = async (patch: Partial<Profile>) => {
    if (!uid) return;
    setProfile((p) => (p ? { ...p, ...patch } : p));
    await supabase.from('profiles').update(patch).eq('id', uid);
  };

  return (
    <SessionCtx.Provider value={{ session, loading, profile, settings, reload, updateSettings, updateProfile }}>
      {children}
    </SessionCtx.Provider>
  );
}

export const useSession = () => useContext(SessionCtx);
