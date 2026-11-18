import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Chip, Field, Row, Section, Sub, T, Toggle } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { pushSupported, registerPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { startTracking, stopTracking } from '@/lib/tracker';
import { invalidatePrefs } from '@/lib/upload';

const ask = (title: string, msg: string) =>
  Platform.OS === 'web'
    ? Promise.resolve(window.confirm(`${title}\n\n${msg}`))
    : new Promise<boolean>((res) => Alert.alert(title, msg, [{ text: 'Cancel', onPress: () => res(false) }, { text: 'Yes', style: 'destructive', onPress: () => res(true) }]));

export default function SettingsScreen() {
  const { c, pref, setPref } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, profile, settings, updateSettings } = useSession();
  const { me, circleId, circles, refresh } = useCircle();
  const [ha, setHa] = useState(settings?.ha_webhook_url ?? '');
  const [pushMsg, setPushMsg] = useState('');
  const paused = me?.paused_until && new Date(me.paused_until) > new Date();

  const updateMembership = async (patch: Record<string, unknown>) => {
    if (!circleId || !session) return;
    await supabase.from('circle_members').update(patch).eq('circle_id', circleId).eq('user_id', session.user.id);
    await invalidatePrefs();
    await refresh();
    startTracking().catch(() => {});
  };
  const pause = (hours: number | 'tomorrow') => {
    const until = new Date();
    if (hours === 'tomorrow') until.setHours(24 + 7, 0, 0, 0);
    else until.setTime(until.getTime() + hours * 3600_000);
    updateMembership({ paused_until: until.toISOString() });
  };

  const setSetting = async (patch: Parameters<typeof updateSettings>[0]) => {
    await updateSettings(patch);
    await invalidatePrefs();
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
      <T size={32} weight="800" style={{ marginBottom: 16 }}>Settings</T>

      <Section>
        <Row title={profile?.name ?? ''} subtitle={session?.user.email} onPress={() => router.push('/profile')}
          right={profile ? <Avatar emoji={profile.emoji} color={profile.color} size={40} /> : undefined} />
      </Section>

      {me && (
        <Section title={`Sharing with ${circles.find((x) => x.id === circleId)?.name ?? 'this circle'}`}>
          <Row icon="location" title="Share my location" subtitle={me.sharing ? 'This circle can see where you are' : 'This circle cannot see you'}
            right={<Toggle value={me.sharing} onChange={(v) => updateMembership({ sharing: v })} />} />
          <View style={{ paddingVertical: 10, gap: 8 }}>
            <T weight="500">{paused ? `Paused until ${new Date(me.paused_until!).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Pause sharing'}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {paused ? (
                <Chip label="Resume now" icon="play" active onPress={() => updateMembership({ paused_until: null })} />
              ) : (
                <>
                  <Chip label="1 hour" onPress={() => pause(1)} />
                  <Chip label="3 hours" onPress={() => pause(3)} />
                  <Chip label="Until tomorrow" onPress={() => pause('tomorrow')} />
                </>
              )}
            </View>
          </View>
          <Row icon="notifications" title="Arrival & departure alerts" subtitle="For places in this circle"
            right={<Toggle value={me.notify_places} onChange={(v) => updateMembership({ notify_places: v })} />} />
        </Section>
      )}

      {settings && (
        <Section title="Privacy">
          <Row icon="locate" title="Precise location" subtitle={settings.precise ? 'Exact position' : 'Approximate (~1 km), rounded on your phone'}
            right={<Toggle value={settings.precise} onChange={(v) => setSetting({ precise: v })} />} />
          <Row icon="battery-dead" title="Low battery alerts" subtitle="Tell my circles when I drop below 15%"
            right={<Toggle value={settings.low_battery_alerts} onChange={(v) => setSetting({ low_battery_alerts: v })} />} />
          <Row icon="trash" title="Delete my location history" danger onPress={async () => {
            if (await ask('Delete history?', 'All your past locations, trips and place visits will be deleted.')) await supabase.rpc('delete_my_history');
          }} />
        </Section>
      )}

      {settings && Platform.OS === 'android' && (
        <Section title="Driving">
          <Row icon="car" title="Driving reports" subtitle="Detect drives, speed and hard braking"
            right={<Toggle value={settings.driving_enabled} onChange={(v) => setSetting({ driving_enabled: v })} />} />
          <Row icon="medkit" title="Crash detection" subtitle="Sends SOS after 30 s unless you cancel"
            right={<Toggle value={settings.crash_detection} onChange={(v) => setSetting({ crash_detection: v })} />} />
        </Section>
      )}

      <Section title="Notifications">
        {Platform.OS === 'web' ? (
          <View style={{ paddingVertical: 10, gap: 8 }}>
            <Sub>{pushSupported() ? 'On iPhone, add Orbit to your Home Screen first (Share → Add to Home Screen), then tap below.' : 'Push isn’t available in this browser.'}</Sub>
            {pushSupported() && (
              <Button title="Turn on notifications" kind="secondary" icon="notifications"
                onPress={async () => setPushMsg((await registerPush(session!.user.id)) ? '✅ Notifications on' : 'Not allowed — check browser settings')} />
            )}
            {pushMsg ? <Sub>{pushMsg}</Sub> : null}
          </View>
        ) : (
          <Row icon="notifications" title="Push notifications" subtitle="Manage in your phone's settings" />
        )}
      </Section>

      <Section title="iPhone">
        <Row icon="phone-portrait" title="Background sharing with OwnTracks" subtitle="Free app that keeps your location updated when Orbit is closed"
          onPress={() => router.push('/owntracks')} />
      </Section>

      {settings && (
        <Section title="Home Assistant">
          <View style={{ paddingVertical: 10, gap: 8 }}>
            <Sub>When you arrive at or leave a "Home" place, Orbit sends a webhook to Home Assistant. Use a public https webhook URL (e.g. via Nabu Casa or your remote URL).</Sub>
            <Field placeholder="https://…/api/webhook/orbit-…" value={ha} onChangeText={setHa} autoCapitalize="none" />
            <Button title="Save webhook" kind="secondary" disabled={(ha || null) === settings.ha_webhook_url || (ha !== '' && !ha.startsWith('https://'))}
              onPress={() => setSetting({ ha_webhook_url: ha.trim() || null })} />
          </View>
        </Section>
      )}

      <Section title="Appearance">
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 10 }}>
          {(['system', 'light', 'dark'] as const).map((p) => <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} active={pref === p} onPress={() => setPref(p)} />)}
        </View>
      </Section>

      <Section title="Account">
        <Row icon="log-out" title="Sign out" onPress={async () => {
          await stopTracking();
          await supabase.auth.signOut();
        }} />
        <Row icon="close-circle" title="Delete account" danger onPress={async () => {
          if (!(await ask('Delete your account?', 'This permanently deletes your profile, locations, messages and memberships.'))) return;
          await stopTracking();
          await supabase.rpc('delete_my_account');
          await supabase.auth.signOut();
        }} />
      </Section>
      <Sub style={{ textAlign: 'center', marginBottom: 30 }}>Orbit 1.0 · location history auto-deletes after 7 days</Sub>
    </ScrollView>
  );
}
