import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Card, Sub, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase, SUPABASE_URL } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

const STEPS = [
  'Install "OwnTracks" from the App Store (free).',
  'Open OwnTracks once and allow location "Always".',
  'Come back here on the same iPhone and tap "Set up OwnTracks".',
  'OwnTracks asks to import the settings — tap Install.',
];

export default function OwnTracks() {
  const { c } = useTheme();
  const { session, profile } = useSession();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const make = async () => {
    setBusy(true);
    const { data: token, error } = await supabase.rpc('new_owntracks_token');
    setBusy(false);
    if (error || !token) return;
    const config = {
      _type: 'configuration',
      mode: 3, // HTTP
      url: `${SUPABASE_URL}/functions/v1/owntracks-ingest`,
      auth: true,
      username: session!.user.id,
      password: token,
      deviceId: 'iphone',
      tid: (profile?.name ?? 'ME').slice(0, 2).toUpperCase(),
      monitoring: 1, // significant changes: good battery life
      locatorDisplacement: 100,
      locatorInterval: 300,
      cmd: false,
      remoteConfiguration: false,
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
    const url = `owntracks:///config?inline=${encodeURIComponent(b64)}`;
    setLink(url);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
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
      <Button title="Set up OwnTracks" icon="phone-portrait" onPress={make} loading={busy} />
      {link && (
        <Card style={{ gap: 8 }}>
          <Sub>If OwnTracks didn't open, copy this link and paste it into Safari on the iPhone:</Sub>
          <Button title={copied ? 'Copied ✓' : 'Copy setup link'} kind="secondary" onPress={async () => {
            await Clipboard.setStringAsync(link);
            setCopied(true);
          }} />
          <Sub size={12}>This link contains a private key for your account. Don't share it. Making a new one turns the old one off.</Sub>
        </Card>
      )}
      <Sub>Battery: OwnTracks uses "significant changes" mode, which updates when you move a few hundred metres. Your privacy settings (pause, approximate) still apply.</Sub>
    </ScrollView>
  );
}
