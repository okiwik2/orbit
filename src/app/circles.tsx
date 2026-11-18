import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';

import { FormScroll } from '@/components/keyboard';
import { Avatar, Button, Card, Field, Icon, Press, Row, Section, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

function inviteLink(code: string) {
  return WEB_URL ? `${WEB_URL.replace(/\/$/, '')}/join/${code}` : Linking.createURL(`/join/${code}`);
}

const confirm = (title: string, msg: string) =>
  Platform.OS === 'web'
    ? Promise.resolve(window.confirm(`${title}\n\n${msg}`))
    : new Promise<boolean>((res) => Alert.alert(title, msg, [{ text: 'Cancel', onPress: () => res(false) }, { text: 'OK', style: 'destructive', onPress: () => res(true) }]));

export default function Circles() {
  const { c } = useTheme();
  const { session } = useSession();
  const { circles, circleId, setCircleId, people, refresh } = useCircle();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const myRole = people.find((p) => p.user_id === session?.user.id)?.role;

  const create = async () => {
    setBusy('create');
    setError('');
    const { data, error } = await supabase.rpc('create_circle', { circle_name: name.trim() });
    setBusy('');
    if (error) return setError(error.message);
    setName('');
    setCircleId(data);
    await refresh();
  };

  const makeInvite = async () => {
    if (!circleId) return;
    setBusy('invite');
    const { data, error } = await supabase.rpc('create_invite', { circle: circleId });
    setBusy('');
    if (error) return setError(error.message);
    setInvite(data);
  };

  const shareInvite = async () => {
    if (!invite) return;
    const link = inviteLink(invite);
    const message = `Join my circle on Orbit: ${link}\nOr enter code ${invite}`;
    if (Platform.OS === 'web' && !(navigator as any).share) {
      await Clipboard.setStringAsync(message);
      Alert.alert?.('Copied', 'Invite copied to clipboard');
    } else {
      await Share.share({ message });
    }
  };

  const remove = async (uid: string, label: string) => {
    if (!circleId || !(await confirm(`Remove ${label}?`, 'They will stop seeing this circle and you will stop seeing them.'))) return;
    await supabase.rpc('remove_member', { circle: circleId, member: uid });
    await refresh();
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      {circles.length > 0 && (
        <Section title="Your circles">
          {circles.map((x) => (
            <Row key={x.id} icon="planet" title={x.name}
              right={x.id === circleId ? <Icon name="checkmark-circle" size={22} color={c.accent} /> : undefined}
              onPress={() => {
                setCircleId(x.id);
                setInvite(null);
              }} />
          ))}
        </Section>
      )}

      {circleId && (
        <Section title="Members">
          {people.map((p) => (
            <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Avatar emoji={p.profile.emoji} color={p.profile.color} size={36} />
              <View style={{ flex: 1 }}>
                <T weight="500">{p.profile.name}{p.user_id === session?.user.id ? ' (you)' : ''}</T>
                <Sub>{p.role === 'admin' ? 'Admin' : 'Member'}{!p.sharing ? ' · not sharing' : ''}</Sub>
              </View>
              {myRole === 'admin' && p.user_id !== session?.user.id && (
                <Press onPress={() => remove(p.user_id, p.profile.name)}><Icon name="close-circle" size={22} color={c.sub} /></Press>
              )}
            </View>
          ))}
          <View style={{ paddingVertical: 10, gap: 10 }}>
            {invite ? (
              <Card style={{ backgroundColor: c.accentSoft, alignItems: 'center', gap: 6 }}>
                <Sub>Invite code (valid 7 days)</Sub>
                <T size={30} weight="800" style={{ letterSpacing: 4 }}>{invite}</T>
                <Button title="Share invite" icon="share-outline" onPress={shareInvite} style={{ alignSelf: 'stretch' }} />
              </Card>
            ) : (
              <Button title="Invite someone" icon="person-add" onPress={makeInvite} loading={busy === 'invite'} />
            )}
            <Button title="Leave this circle" kind="ghost" onPress={() => remove(session!.user.id, 'yourself')} />
          </View>
        </Section>
      )}

      <Section title="Join with a code">
        <View style={{ paddingVertical: 10, gap: 10 }}>
          <Field placeholder="ABCD2345" value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoCapitalize="characters" maxLength={8}
            returnKeyType="go" onSubmitEditing={() => code.length >= 6 && router.push({ pathname: '/join/[code]', params: { code } })}
            style={{ textAlign: 'center', fontSize: 22, letterSpacing: 4 }} />
          <Button title="Continue" kind="secondary" disabled={code.length < 6}
            onPress={() => router.push({ pathname: '/join/[code]', params: { code } })} />
        </View>
      </Section>

      <Section title="Create a new circle">
        <View style={{ paddingVertical: 10, gap: 10 }}>
          <Field placeholder="e.g. Family" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" returnKeyType="done" onSubmitEditing={() => name.trim() && create()} />
          <Button title="Create circle" kind="secondary" onPress={create} loading={busy === 'create'} disabled={!name.trim()} />
        </View>
      </Section>
      {error ? <T color={c.danger} style={{ textAlign: 'center' }}>{error}</T> : null}
    </FormScroll>
  );
}
