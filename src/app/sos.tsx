import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { useSession } from '@/lib/session';
import { cancelSos, sendSos } from '@/lib/sos';
import { useTheme } from '@/lib/theme';
import { currentPosition } from '@/lib/tracker';

const HOLD_MS = 1500;
const buzz = () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

export default function SosScreen() {
  const { c } = useTheme();
  const { pending } = useLocalSearchParams<{ pending?: string }>();
  const { session } = useSession();
  const { sos } = useCircle();
  const mine = sos.find((s) => s.user_id === session?.user.id);
  const [phase, setPhase] = useState<'idle' | 'countdown' | 'sent' | 'crash'>(pending ? 'crash' : mine ? 'sent' : 'idle');
  const [count, setCount] = useState(pending ? 30 : 5);
  const [sentId, setSentId] = useState<string | null>(mine?.id ?? null);
  const [error, setError] = useState('');
  const hold = useSharedValue(0);
  const pulse = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = async () => {
    setPhase('sent');
    try {
      const pos = await currentPosition().catch(() => null);
      const row = await sendSos(pos?.lat ?? null, pos?.lng ?? null);
      setSentId(row.id);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } catch (e: any) {
      setError(e.message ?? 'Could not send. Call emergency services directly.');
    }
  };

  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1));
  }, [pulse]);

  // countdowns (manual 5 s, crash 30 s)
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'crash') return;
    timer.current = setInterval(() => setCount((n) => n - 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [phase]);
  useEffect(() => {
    if (phase === 'countdown' || phase === 'crash') buzz();
    if (count > 0) return;
    if (phase === 'countdown') fire();
    if (phase === 'crash') setPhase('sent'); // server has fired it
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.5 }], opacity: 0.5 * (1 - pulse.value) }));
  const fill = useAnimatedStyle(() => ({ transform: [{ scale: hold.value }] }));

  const bg = phase === 'idle' ? c.bg : c.danger;
  const fg = phase === 'idle' ? c.text : '#fff';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 18 }}>
        {phase === 'idle' && (
          <>
            <T size={30} weight="800">Emergency SOS</T>
            <Sub style={{ textAlign: 'center' }}>Hold the button to alert everyone in your circles with your live location.</Sub>
            <Pressable
              onPressIn={() => {
                hold.set(withTiming(1, { duration: HOLD_MS }));
                holdTimer.current = setTimeout(() => {
                  setCount(5);
                  setPhase('countdown');
                }, HOLD_MS);
              }}
              onPressOut={() => {
                cancelAnimation(hold);
                hold.set(withTiming(0, { duration: 200 }));
                if (holdTimer.current) clearTimeout(holdTimer.current);
              }}
              style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginVertical: 20 }}>
              <Animated.View style={[{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: c.danger }, ring]} />
              <View style={{ width: 190, height: 190, borderRadius: 95, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Animated.View style={[{ position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(0,0,0,0.25)' }, fill]} />
                <T size={40} weight="900" color="#fff">SOS</T>
                <T size={13} color="#fff">Hold</T>
              </View>
            </Pressable>
            <Sub style={{ textAlign: 'center' }}>In a life-threatening emergency, call 111 (NZ) first.</Sub>
            <Button title="Close" kind="ghost" onPress={() => router.back()} />
          </>
        )}

        {(phase === 'countdown' || phase === 'crash') && (
          <>
            <T size={26} weight="800" color={fg} style={{ textAlign: 'center' }}>{phase === 'crash' ? 'Possible crash detected' : 'Sending SOS in'}</T>
            <T size={110} weight="900" color={fg}>{count}</T>
            <T color={fg} style={{ textAlign: 'center' }}>{phase === 'crash' ? 'Your circle will be alerted unless you cancel.' : 'Your circles will get an alert with your location.'}</T>
            <Button title={phase === 'crash' ? "I'm OK — cancel" : 'Cancel'} kind="secondary" style={{ alignSelf: 'stretch', marginTop: 20 }}
              onPress={async () => {
                if (phase === 'crash' && pending) await cancelSos(pending);
                router.back();
              }} />
          </>
        )}

        {phase === 'sent' && (
          <>
            <T size={30} weight="900" color={fg}>SOS sent</T>
            <T color={fg} style={{ textAlign: 'center' }}>Everyone in your circles has been alerted with your location.</T>
            {error ? <T color="#fff" weight="700">{error}</T> : null}
            <Button title="I'm safe now" kind="secondary" style={{ alignSelf: 'stretch', marginTop: 20 }}
              onPress={async () => {
                const id = sentId ?? pending ?? mine?.id;
                if (id) await cancelSos(id);
                router.back();
              }} />
            <Button title="Close" kind="ghost" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
