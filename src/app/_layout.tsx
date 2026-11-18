import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider as NavTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KeyboardProvider } from '@/components/keyboard';
import { Sub, T } from '@/components/ui';
import { CircleProvider } from '@/lib/circle';
import { useCrashSensor } from '@/lib/crash';
import { onNotificationTap, registerPush } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { configured, supabase } from '@/lib/supabase';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { startTracking } from '@/lib/tracker';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Background jobs while signed in and consented: tracking, push, crash sensor, notification taps. */
function Engine() {
  const { session, settings } = useSession();
  const uid = session?.user.id;
  useCrashSensor(Platform.OS === 'android' && Boolean(settings?.crash_detection));

  useEffect(() => {
    if (!uid) return;
    startTracking().catch(() => {});
    if (Platform.OS !== 'web') registerPush(uid).catch(() => {}); // web needs a button tap (Settings)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && startTracking().catch(() => {}));
    AsyncStorage.getItem('pendingInvite').then((code) => {
      if (code) {
        AsyncStorage.removeItem('pendingInvite');
        router.push({ pathname: '/join/[code]', params: { code } });
      }
    });
    return () => sub.remove();
  }, [uid]);

  useEffect(
    () =>
      onNotificationTap((data) => {
        if (data.type === 'crash' && data.sos_id) router.push({ pathname: '/sos', params: { pending: String(data.sos_id) } });
        else if (data.type === 'sos' || data.type === 'place' || data.type === 'battery') router.navigate('/');
        else if (data.type === 'reminder') router.navigate('/places');
      }),
    [],
  );
  return null;
}

function Root() {
  const { c, dark } = useTheme();
  const { session, loading, settings } = useSession();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  if (loading || (session && !settings)) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  const signedIn = Boolean(session);
  const consented = Boolean(settings?.consent_at);
  const nav = dark ? DarkTheme : DefaultTheme;
  return (
    <NavTheme value={{ ...nav, colors: { ...nav.colors, background: c.bg, card: c.card, primary: c.accent, text: c.text, border: c.line } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {signedIn && consented && <Engine />}
      <Stack screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTintColor: c.accent, headerTitleStyle: { color: c.text } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !consented}>
          <Stack.Screen name="consent" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && consented}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="circles" options={{ title: 'Circles', presentation: 'modal' }} />
          <Stack.Screen name="member/[id]" options={{ title: '' }} />
          <Stack.Screen name="place-edit" options={{ title: 'Place', presentation: 'modal' }} />
          <Stack.Screen name="sos" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="eta" options={{ title: 'Share ETA', presentation: 'modal' }} />
          <Stack.Screen name="owntracks" options={{ title: 'iPhone background sharing' }} />
          <Stack.Screen name="profile" options={{ title: 'Your profile', presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Screen name="join/[code]" options={{ title: 'Join circle', presentation: 'modal' }} />
      </Stack>
    </NavTheme>
  );
}

function NotConfigured() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 }}>
      <T size={22} weight="700">Orbit isn't connected yet</T>
      <Sub>Copy .env.example to .env and add your Supabase URL and anon key, then restart.</Sub>
    </View>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
        <ThemeProvider>
          {configured ? (
            <SessionProvider>
              <CircleProvider>
                <Root />
              </CircleProvider>
            </SessionProvider>
          ) : (
            <NotConfigured />
          )}
        </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// keep the token fresh only while the app is visible (saves battery)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => (s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
}
