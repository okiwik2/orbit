import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';

import { FormScroll } from '@/components/keyboard';
import { Button, Card, Press, Sub, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const STEPS = [
  'Install "OwnTracks" from the App Store (free).',
  'Open OwnTracks and allow location "Always".',
  'In OwnTracks, tap ⓘ / Settings and turn ON the option that allows configuration by link or file (newer versions block it by default). Confirm when asked.',
  'Come back here on the same iPhone and tap "Set up OwnTracks", then tap Install / Import in OwnTracks.',
];

const ENDPOINT = `${SUPABASE_URL}/functions/v1/owntracks-ingest`;

function CopyLine({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const { c } = useTheme();
  const [done, setDone] = useState(false);
  return (
    <Press haptic={false} onPress={async () => {
      await Clipboard.setStringAsync(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Sub size={13}>{label}</Sub>
        <T size={13} color={c.accent}>{done ? 'Copied ✓' : 'Tap to copy'}</T>
      </View>
      <T size={14} numberOfLines={secret ? 1 : 3}>{secret ? '•'.repeat(16) : value}</T>
    </Press>
  );
}

export default function OwnTracks() {
  const { c } = useTheme();
  const { session, profile } = useSession();
  const [link, setLink] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const uid = session!.user.id;
  const tid = (profile?.name ?? 'ME').slice(0, 2).toUpperCase();

  const make = async () => {
    setBusy(true);
    setError('');
    const { data, error } = await supabase.rpc('new_owntracks_token');
    setBusy(false);
    if (error || !data) return setError(error?.message ?? 'Could not create a key. Try again.');
    const config = {
      _type: 'configuration',
      mode: 3, // HTTP
      url: ENDPOINT,
      auth: true,
      username: uid,
      password: data,
      deviceId: 'iphone',
      tid,
      monitoring: 1, // significant changes: good battery life
      locatorDisplacement: 100,
      locatorInterval: 300,
      cmd: false,
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
    const url = `owntracks:///config?inline=${encodeURIComponent(b64)}`;
    setToken(data);
    setLink(url);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <T size={15}>
        iPhones only let web apps read location while they're open. OwnTracks is a free, open-source app that sends your location to Orbit in
        the background, so your circle always sees where you are.
      </T>
      <Card style={{ gap: 10 }}>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <T size={13} weight="700" color="#fff">{i + 1}</T>
            </View>
            <T style={{ flex: 1 }}>{s}</T>
          </View>
        ))}
      </Card>
      <Button title={link ? 'Make a new setup link' : 'Set up OwnTracks'} icon="phone-portrait" onPress={make} loading={busy} />
      {error ? <T color={c.danger}>{error}</T> : null}
      {link && token && (
        <>
          <Card style={{ gap: 8 }}>
            <Sub>If OwnTracks didn't open, copy this link and paste it into Safari on the iPhone:</Sub>
            <Button title={copied ? 'Copied ✓' : 'Copy setup link'} kind="secondary" onPress={async () => {
              await Clipboard.setStringAsync(link);
              setCopied(true);
            }} />
          </Card>
          <Card style={{ gap: 4 }}>
            <T weight="700">Or set it up by hand</T>
            <Sub>If OwnTracks says "configuration not allowed", open its Settings and fill these in (tap each to copy):</Sub>
            <CopyLine label="Mode" value="HTTP" />
            <CopyLine label="URL / Host" value={ENDPOINT} />
            <CopyLine label="Authentication" value="On" />
            <CopyLine label="UserID" value={uid} />
            <CopyLine label="Password" value={token} secret />
            <CopyLine label="DeviceID" value="iphone" />
            <CopyLine label="TrackerID" value={tid} />
            <Sub size={13} style={{ marginTop: 6 }}>Then set Monitoring to "Significant" (the ▶ / mode button on the OwnTracks map).</Sub>
          </Card>
          <Sub size={12}>The setup link and password are a private key for your account. Don't share them. Making a new one turns the old one off.</Sub>
        </>
      )}
      <Sub>Battery: OwnTracks uses "significant changes" mode, which updates when you move a few hundred metres. Your privacy settings (pause, approximate) still apply.</Sub>
    </FormScroll>
  );
}
