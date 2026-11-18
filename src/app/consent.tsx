import { useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/keyboard';
import { Avatar, Button, Card, Field, Icon, Press, Sub, T, type IconName } from '@/components/ui';
import { COLORS, EMOJIS } from '@/lib/avatars';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { requestPermissions } from '@/lib/tracker';


const POINTS: [IconName, string, string][] = [
  ['people', 'Only your circles', 'Only people you invite or whose invite you accept can see you. Never sold, never shared with anyone else.'],
  ['pause-circle', 'Pause any time', 'Turn sharing off per circle, pause for an hour, or switch to approximate (~1 km) location.'],
  ['time', 'History for 7 days', 'Your trips are deleted automatically after 7 days. You can delete them sooner.'],
  ['notifications', 'Always visible', "A notification and a banner in the app show whenever you're sharing."],
];

export default function Consent() {
  const { c } = useTheme();
  const { profile, updateProfile, updateSettings } = useSession();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.name ?? '');
  const [emoji, setEmoji] = useState(profile?.emoji ?? '🙂');
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  const [perm, setPerm] = useState<{ foreground: boolean; background: boolean } | null>(null);

  const finish = async () => {
    await updateProfile({ name: name.trim() || 'Me', emoji, color });
    await updateSettings({ consent_at: new Date().toISOString() });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <FormScroll contentContainerStyle={{ padding: 24, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center', flexGrow: 1 }}>
        {step === 0 && (
          <Animated.View entering={FadeInRight} style={{ gap: 16 }}>
            <T size={30} weight="800">How Orbit works</T>
            <Sub size={15}>Location sharing is always your choice. Here's the deal:</Sub>
            {POINTS.map(([icon, title, body]) => (
              <Card key={title} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={22} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="600">{title}</T>
                  <Sub>{body}</Sub>
                </View>
              </Card>
            ))}
            <Button title="I understand" onPress={() => setStep(1)} />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View entering={FadeInRight} style={{ gap: 16 }}>
            <T size={30} weight="800">Who are you?</T>
            <View style={{ alignItems: 'center', marginVertical: 8 }}>
              <Avatar emoji={emoji} color={color} size={96} ring="#fff" />
            </View>
            <Field placeholder="Your name" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" autoComplete="name" textContentType="givenName" returnKeyType="next" onSubmitEditing={() => name.trim() && setStep(2)} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {EMOJIS.map((e) => (
                <Press key={e} onPress={() => setEmoji(e)} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: e === emoji ? c.accentSoft : c.card }}>
                  <T size={24}>{e}</T>
                </Press>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
              {COLORS.map((col) => (
                <Press key={col} onPress={() => setColor(col)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: col, borderWidth: 3, borderColor: col === color ? c.text : 'transparent' }}>
                  <View />
                </Press>
              ))}
            </View>
            <Button title="Next" onPress={() => setStep(2)} disabled={!name.trim()} />
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={FadeInRight} style={{ gap: 16 }}>
            <T size={30} weight="800">Location access</T>
            {Platform.OS === 'web' ? (
              <Sub size={15}>
                In the web app Orbit shares your location while it's open. On iPhone, you can turn on background sharing later with the free
                OwnTracks app (Settings → iPhone background sharing).
              </Sub>
            ) : (
              <Sub size={15}>
                To keep your circle updated when Orbit is closed, choose "Allow all the time" on the next screen. You can change this in
                your phone settings whenever you like.
              </Sub>
            )}
            {perm && (
              <Card>
                <T weight="600">{perm.foreground ? (perm.background || Platform.OS === 'web' ? '✅ All set' : '⚠️ Only while using the app') : '❌ Location not allowed'}</T>
                <Sub>{perm.foreground ? 'You can change this later.' : 'You can still use chat and see others. Sharing stays off.'}</Sub>
              </Card>
            )}
            {!perm ? (
              <Button title="Allow location" icon="location" onPress={async () => setPerm(await requestPermissions())} />
            ) : (
              <Button title="Start using Orbit" onPress={finish} />
            )}
            {!perm && <Button title="Not now" kind="ghost" onPress={finish} />}
          </Animated.View>
        )}
      </FormScroll>
    </SafeAreaView>
  );
}
