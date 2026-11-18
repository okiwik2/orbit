import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardScreen } from '@/components/keyboard';
import { Avatar, Field, Icon, Press, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { clock } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { supabase, type Message } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';

export default function Chat() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { circleId, circles, people } = useCircle();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const list = useRef<FlatList<Message>>(null);
  const uid = session?.user.id;

  useEffect(() => {
    if (!circleId) return;
    supabase.from('messages').select('*').eq('circle_id', circleId).order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setMsgs(data ?? []));
    const ch = supabase.channel(`chat-${circleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `circle_id=eq.${circleId}` },
        (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [p.new as Message, ...m])))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [circleId]);

  const send = async () => {
    const body = text.trim();
    if (!body || !circleId || !uid) return;
    setText('');
    const { data } = await supabase.from('messages').insert({ circle_id: circleId, user_id: uid, body }).select().single();
    if (data) setMsgs((m) => (m.some((x) => x.id === data.id) ? m : [data, ...m]));
  };

  const person = (id: string | null) => people.find((p) => p.user_id === id);

  return (
    <KeyboardScreen style={{ backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <T size={32} weight="800">Chat</T>
        <Sub>{circles.find((x) => x.id === circleId)?.name}</Sub>
      </View>
      <FlatList
        ref={list}
        inverted
        data={msgs}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ padding: 12, gap: 6, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        renderItem={({ item: m, index }) => {
          const p = person(m.user_id);
          const mine = m.user_id === uid;
          const prev = msgs[index + 1];
          const showName = !mine && (!prev || prev.user_id !== m.user_id);
          if (m.kind === 'system') return <Sub style={{ textAlign: 'center', marginVertical: 6 }} size={12}>{m.body}</Sub>;
          const special = m.kind === 'sos' ? c.danger : m.kind === 'checkin' ? c.good : null;
          return (
            <Animated.View entering={FadeInUp.duration(250)} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              {!mine && <View style={{ width: 30 }}>{showName && p && <Avatar emoji={p.profile.emoji} color={p.profile.color} size={30} />}</View>}
              <View style={{ maxWidth: '78%' }}>
                {showName && <Sub size={12} style={{ marginLeft: 10, marginBottom: 2 }}>{p?.profile.name ?? 'Former member'}</Sub>}
                <Press haptic={false} onPress={() => m.lat != null && router.navigate('/')}
                  style={{ backgroundColor: special ?? (mine ? c.accent : c.card), borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9 }}>
                  {special && <Icon name={m.kind === 'sos' ? 'warning' : 'checkmark-circle'} size={16} color="#fff" />}
                  <T color={mine || special ? '#fff' : c.text}>{m.body}</T>
                  <T size={11} color={mine || special ? 'rgba(255,255,255,0.75)' : c.sub} style={{ alignSelf: 'flex-end', marginTop: 2 }}>{clock(m.created_at)}</T>
                </Press>
              </View>
            </Animated.View>
          );
        }}
        ListEmptyComponent={<Sub style={{ textAlign: 'center', marginTop: 40, transform: [{ scaleY: -1 }] }}>Say hi to your circle 👋</Sub>}
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card }}>
        <Field
          placeholder="Message"
          value={text}
          onChangeText={setText}
          multiline
          autoCorrect
          autoCapitalize="sentences"
          returnKeyType="default"
          maxLength={2000}
          style={{ flex: 1, maxHeight: 130, paddingTop: 13, textAlignVertical: 'top' }}
          // on a computer keyboard, Enter sends and Shift+Enter adds a new line
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
              e.preventDefault?.();
              send();
            }
          }}
        />
        <Press onPress={send} disabled={!text.trim()} style={{ paddingBottom: 4 }}>
          <Icon name="arrow-up-circle" size={44} color={c.accent} />
        </Press>
      </View>
    </KeyboardScreen>
  );
}
