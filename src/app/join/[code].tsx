import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Icon, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function Join() {
  const { c } = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, settings } = useSession();
  const { setCircleId, refresh } = useCircle();
  const [preview, setPreview] = useState<{ name: string; members: number } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = Boolean(session && settings?.consent_at);

  useEffect(() => {
    if (!ready) {
      // remember the invite and finish it after sign-in / onboarding
      AsyncStorage.setItem('pendingInvite', String(code)).catch(() => {});
      return;
    }
    supabase.rpc('circle_preview', { invite_code: code }).then(({ data }) => setPreview(data?.[0] ?? null));
  }, [code, ready]);

  const join = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('join_circle', { invite_code: code });
    setBusy(false);
    if (error) return setError(error.message);
    setCircleId(data);
    await refresh();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 28, justifyContent: 'center', gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignSelf: 'center', width: 80, height: 80, borderRadius: 40, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="people" size={40} color={c.accent} />
      </View>
      {!ready ? (
        <>
          <T size={24} weight="800" style={{ textAlign: 'center' }}>You've been invited</T>
          <Sub style={{ textAlign: 'center' }}>Sign in first. We'll bring you back to this invite.</Sub>
          <Button title="Continue" onPress={() => router.replace('/')} />
        </>
      ) : preview === undefined ? (
        <Sub style={{ textAlign: 'center' }}>Checking invite…</Sub>
      ) : preview === null ? (
        <>
          <T size={22} weight="700" style={{ textAlign: 'center' }}>Invite not valid</T>
          <Sub style={{ textAlign: 'center' }}>It may have expired. Ask for a new one.</Sub>
          <Button title="Close" kind="secondary" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <T size={24} weight="800" style={{ textAlign: 'center' }}>Join "{preview.name}"?</T>
          <Sub style={{ textAlign: 'center' }}>
            {preview.members} member{preview.members === 1 ? '' : 's'}. They will see your location, battery and places while you share
            with this circle. You can pause or leave any time.
          </Sub>
          <Button title="Join and share" onPress={join} loading={busy} />
          <Button title="Not now" kind="ghost" onPress={() => router.back()} />
          {error ? <T color={c.danger} style={{ textAlign: 'center' }}>{error}</T> : null}
        </>
      )}
    </View>
  );
}
