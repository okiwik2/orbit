import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormScroll } from '@/components/keyboard';
import { Button, Card, Field, Icon, Press, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { clock, placeAt } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { supabase, type Place } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';

type Reminder = { id: string; place_id: string; body: string; for_user: string | null; done: boolean };
type Event = { id: number; place_id: string; user_id: string; kind: 'arrive' | 'leave'; at: string };
const PLACE_ICON = { home: '🏠', school: '🏫', work: '💼', other: '📍' } as const;

export default function Places() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { circleId, places, people } = useCircle();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [forMe, setForMe] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!circleId) return;
    const [r, e] = await Promise.all([
      supabase.from('reminders').select('*').eq('circle_id', circleId).eq('done', false).order('created_at'),
      supabase.from('place_events').select('*').eq('circle_id', circleId).order('at', { ascending: false }).limit(30),
    ]);
    setReminders(r.data ?? []);
    setEvents(e.data ?? []);
  }, [circleId]);
  useEffect(() => {
    load();
  }, [load]);

  const addReminder = async (place: Place) => {
    const body = draft[place.id]?.trim();
    if (!body || !circleId) return;
    setDraft((d) => ({ ...d, [place.id]: '' }));
    await supabase.from('reminders').insert({
      circle_id: circleId, place_id: place.id, body, created_by: session!.user.id, for_user: forMe[place.id] ? session!.user.id : null,
    });
    load();
  };
  const done = async (id: string) => {
    setReminders((r) => r.filter((x) => x.id !== id));
    await supabase.from('reminders').update({ done: true }).eq('id', id);
  };

  const name = (uid: string) => people.find((p) => p.user_id === uid)?.profile.name ?? 'Someone';
  const who = (pl: Place) => people.filter((p) => p.loc && placeAt([pl], p.loc.lat, p.loc.lng));

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T size={32} weight="800" style={{ flex: 1 }}>Places</T>
        <Press onPress={() => router.push('/place-edit')} style={{ backgroundColor: c.accent, borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="add" size={24} color="#fff" />
        </Press>
      </View>
      <Sub>Get notified when people arrive or leave. Tip: long-press the map to add a place there.</Sub>

      {places.length === 0 && (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <T size={40}>🏠</T>
          <T weight="600">No places yet</T>
          <Sub style={{ textAlign: 'center' }}>Add home, school or work to get arrival and departure alerts.</Sub>
          <Button title="Add a place" onPress={() => router.push('/place-edit')} />
        </Card>
      )}

      {places.map((pl) => {
        const here = who(pl);
        const rs = reminders.filter((r) => r.place_id === pl.id && (!r.for_user || r.for_user === session?.user.id));
        return (
          <Animated.View key={pl.id} layout={LinearTransition}>
            <Card style={{ gap: 10 }}>
              <Press onPress={() => router.push({ pathname: '/place-edit', params: { id: pl.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <T size={22}>{PLACE_ICON[pl.kind]}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="700" size={17}>{pl.name}</T>
                  <Sub>{here.length ? `Here now: ${here.map((p) => p.profile.name).join(', ')}` : 'Nobody here right now'} · {pl.radius_m} m</Sub>
                </View>
                <Icon name="create-outline" size={20} color={c.sub} />
              </Press>

              {rs.map((r) => (
                <Animated.View key={r.id} entering={FadeIn} exiting={FadeOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.cardAlt, borderRadius: radius.sm, padding: 10 }}>
                  <Press onPress={() => done(r.id)}><Icon name="ellipse-outline" size={22} color={c.accent} /></Press>
                  <T style={{ flex: 1 }}>{r.body}</T>
                  <Sub size={12}>{r.for_user ? 'just me' : 'anyone'}</Sub>
                </Animated.View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Field placeholder="Remind me when I arrive…" autoCapitalize="sentences" autoCorrect returnKeyType="send" submitBehavior="submit" value={draft[pl.id] ?? ''} onChangeText={(t) => setDraft((d) => ({ ...d, [pl.id]: t }))}
                  onSubmitEditing={() => addReminder(pl)} style={{ flex: 1, paddingVertical: 10 }} maxLength={200} />
                <Press onPress={() => setForMe((f) => ({ ...f, [pl.id]: !f[pl.id] }))} style={{ padding: 6 }}>
                  <Icon name={forMe[pl.id] ? 'person' : 'people'} size={20} color={c.sub} />
                </Press>
                <Press onPress={() => addReminder(pl)} style={{ padding: 6 }}><Icon name="arrow-up-circle" size={30} color={c.accent} /></Press>
              </View>
            </Card>
          </Animated.View>
        );
      })}

      {events.length > 0 && (
        <>
          <T size={20} weight="700" style={{ marginTop: 10 }}>Recent activity</T>
          <Card style={{ gap: 2 }}>
            {events.map((e) => {
              const pl = places.find((p) => p.id === e.place_id);
              return (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <Icon name={e.kind === 'arrive' ? 'enter-outline' : 'exit-outline'} size={20} color={e.kind === 'arrive' ? c.good : c.warn} />
                  <T style={{ flex: 1 }} size={14}>{name(e.user_id)} {e.kind === 'arrive' ? 'arrived at' : 'left'} {pl?.name ?? 'a place'}</T>
                  <Sub size={12}>{new Date(e.at).toLocaleDateString([], { weekday: 'short' })} {clock(e.at)}</Sub>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </FormScroll>
  );
}
