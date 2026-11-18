import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar, Button, Field, Press, T } from '@/components/ui';
import { COLORS, EMOJIS } from '@/lib/avatars';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function Profile() {
  const { c } = useTheme();
  const { profile, updateProfile } = useSession();
  const [name, setName] = useState(profile?.name ?? '');
  const [emoji, setEmoji] = useState(profile?.emoji ?? '🙂');
  const [color, setColor] = useState(profile?.color ?? COLORS[0]);
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignItems: 'center' }}><Avatar emoji={emoji} color={color} size={96} ring="#fff" /></View>
      <Field value={name} onChangeText={setName} maxLength={40} placeholder="Your name" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {EMOJIS.map((e) => (
          <Press key={e} onPress={() => setEmoji(e)} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: e === emoji ? c.accentSoft : c.card }}>
            <T size={24}>{e}</T>
          </Press>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        {COLORS.map((col) => (
          <Press key={col} onPress={() => setColor(col)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: col, borderWidth: 3, borderColor: col === color ? c.text : 'transparent' }}><View /></Press>
        ))}
      </View>
      <Button title="Save" disabled={!name.trim()} onPress={async () => {
        await updateProfile({ name: name.trim(), emoji, color });
        router.back();
      }} />
    </ScrollView>
  );
}
