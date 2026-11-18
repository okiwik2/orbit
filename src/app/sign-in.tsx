import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/keyboard';
import { Button, Field, Icon, Sub, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function SignIn() {
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };
  const verify = async (token = code) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <FormScroll contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <Animated.View entering={FadeInUp.duration(600)} style={{ alignItems: 'center', marginBottom: 40 }}>
          <View style={{ width: 88, height: 88, borderRadius: 30, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Icon name="planet" size={50} color="#fff" />
          </View>
          <T size={34} weight="800">Orbit</T>
          <Sub size={15} style={{ marginTop: 6, textAlign: 'center' }}>Stay close to the people who matter.{'\n'}Private, and always your choice.</Sub>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={{ gap: 12 }}>
          {!sent ? (
            <>
              <Field placeholder="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                autoComplete="email" textContentType="emailAddress" inputMode="email" returnKeyType="send" autoFocus
                onSubmitEditing={() => /^\S+@\S+\.\S+$/.test(email.trim()) && send()} />
              <Button title="Send me a code" onPress={send} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
            </>
          ) : (
            <>
              <Sub style={{ textAlign: 'center' }}>We emailed a code to {email.trim()}</Sub>
              <Field placeholder="8-digit code" value={code} autoFocus keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8}
                returnKeyType="go"
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '').slice(0, 8);
                  setCode(digits);
                  if (digits.length === 8) verify(digits); // pasted or fully typed: sign in straight away
                }}
                style={{ textAlign: 'center', fontSize: 26, letterSpacing: 8 }} onSubmitEditing={() => verify()} />
              <Button title="Sign in" onPress={() => verify()} loading={busy} disabled={code.length < 6} />
              <Button title="Use a different email" kind="ghost" onPress={() => { setSent(false); setCode(''); }} />
            </>
          )}
          {error ? <T color={c.danger} size={14} style={{ textAlign: 'center' }}>{error}</T> : null}
        </Animated.View>
      </FormScroll>
    </SafeAreaView>
  );
}
