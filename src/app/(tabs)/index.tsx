import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrbitMap } from '@/components/OrbitMap';
import { Sheet } from '@/components/Sheet';
import { Avatar, Battery, Button, Icon, Press, Sub, T } from '@/components/ui';
import { useCircle, type Person } from '@/lib/circle';
import { clock, distanceM, formatDistance, placeAt, timeAgo } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';
import { currentPosition } from '@/lib/tracker';
import { getWeather } from '@/lib/weather';

const PEEK = 300;

export default function MapScreen() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { circles, circleId, people, places, etas, sos, me } = useCircle();
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [sheetH, setSheetH] = useState(PEEK);
  const [weather, setWeather] = useState<Record<string, string>>({});
  const [checkingIn, setCheckingIn] = useState(false);
  const circle = circles.find((x) => x.id === circleId);

  // weather badge for each member (cached in weather.ts)
  const locKey = people.map((p) => (p.loc ? `${p.user_id}:${p.loc.lat.toFixed(1)},${p.loc.lng.toFixed(1)}` : '')).join('|');
  useEffect(() => {
    let alive = true;
    Promise.all(
      people.filter((p) => p.loc).map(async (p) => {
        const w = await getWeather(p.loc!.lat, p.loc!.lng);
        return [p.user_id, w ? `${w.icon} ${w.temp}°` : ''] as const;
      }),
    ).then((rows) => alive && setWeather(Object.fromEntries(rows)));
    return () => {
      alive = false;
    };
  }, [locKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sharingOn = me ? me.sharing && !(me.paused_until && new Date(me.paused_until) > new Date()) : false;
  const sosIds = sos.map((s) => s.user_id);

  const checkIn = async () => {
    if (!circleId || !session) return;
    setCheckingIn(true);
    try {
      const pos = await currentPosition();
      const place = placeAt(places, pos.lat, pos.lng);
      await supabase.from('messages').insert({
        circle_id: circleId, user_id: session.user.id, kind: 'checkin',
        body: place ? `Checked in at ${place.name} — all good 👍` : 'Checked in — all good 👍', lat: pos.lat, lng: pos.lng,
      });
    } finally {
      setCheckingIn(false);
    }
  };

  if (!circleId) return <NoCircle />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OrbitMap
        people={people}
        places={places}
        dark={dark}
        focus={focus}
        bottomInset={sheetH}
        sosUserIds={sosIds}
        weather={weather}
        onPersonPress={(id) => router.push({ pathname: '/member/[id]', params: { id } })}
        onLongPress={(lat, lng) => router.push({ pathname: '/place-edit', params: { lat: String(lat), lng: String(lng) } })}
      />

      {/* top bar */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Press onPress={() => router.push('/circles')} style={[pill(c), { flex: 1 }]}>
          <Icon name="planet" size={18} color={c.accent} />
          <T weight="700" numberOfLines={1} style={{ flex: 1 }}>{circle?.name ?? 'Circle'}</T>
          <Icon name="chevron-down" size={16} color={c.sub} />
        </Press>
        <Press onPress={() => router.push('/sos')} style={[pill(c), { backgroundColor: c.danger, paddingHorizontal: 18 }]}>
          <T weight="800" color="#fff">SOS</T>
        </Press>
      </View>

      {/* transparency banner */}
      <Animated.View entering={FadeIn} style={{ position: 'absolute', top: insets.top + 64, alignSelf: 'center' }}>
        <Press onPress={() => router.push('/settings')} style={[pill(c), { paddingVertical: 6 }]}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sharingOn ? c.good : c.warn }} />
          <Sub size={12}>{sharingOn ? 'Sharing your location' : 'Location sharing paused'}</Sub>
        </Press>
      </Animated.View>

      {/* SOS banners */}
      {sos.filter((s) => s.user_id !== session?.user.id).map((s) => {
        const p = people.find((x) => x.user_id === s.user_id);
        return (
          <Animated.View key={s.id} entering={FadeInDown} style={{ position: 'absolute', top: insets.top + 100, left: 12, right: 12 }}>
            <Press onPress={() => s.lat != null && setFocus({ lat: s.lat, lng: s.lng!, key: Date.now() })}
              style={{ backgroundColor: c.danger, borderRadius: radius.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="warning" size={24} color="#fff" />
              <View style={{ flex: 1 }}>
                <T weight="800" color="#fff">{p?.profile.name ?? 'Someone'} needs help</T>
                <T size={13} color="#fff">{s.reason === 'crash' ? 'Possible crash' : 'SOS'} · {timeAgo(s.created_at)} · tap to locate</T>
              </View>
            </Press>
          </Animated.View>
        );
      })}

      <Sheet peek={PEEK} onHeight={setSheetH}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Button title="Check in" icon="checkmark-circle" kind="secondary" onPress={checkIn} loading={checkingIn} style={{ flex: 1, paddingVertical: 11 }} />
            <Button title="Share ETA" icon="navigate" kind="secondary" onPress={() => router.push('/eta')} style={{ flex: 1, paddingVertical: 11 }} />
          </View>
          {etas.map((e) => {
            const p = people.find((x) => x.user_id === e.user_id);
            return (
              <View key={e.id} style={{ backgroundColor: c.accentSoft, borderRadius: radius.sm, padding: 12, marginBottom: 10, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Icon name="navigate" size={18} color={c.accent} />
                <T size={14} style={{ flex: 1 }}>
                  <T size={14} weight="700">{p?.profile.name}</T> is heading to {e.dest_name}
                  {e.eta_at ? ` · arriving ~${clock(e.eta_at)}` : ''}{e.distance_m ? ` · ${formatDistance(e.distance_m)}` : ''}
                </T>
              </View>
            );
          })}
          {people.map((p) => (
            <Animated.View key={p.user_id} layout={LinearTransition}>
              <MemberRow p={p} me={p.user_id === session?.user.id} weather={weather[p.user_id]} sos={sosIds.includes(p.user_id)}
                onPress={() => (p.loc ? setFocus({ lat: p.loc.lat, lng: p.loc.lng, key: Date.now() }) : router.push({ pathname: '/member/[id]', params: { id: p.user_id } }))}
                onLongPress={() => router.push({ pathname: '/member/[id]', params: { id: p.user_id } })}
                where={describe(p, places, me)} />
            </Animated.View>
          ))}
          <Button title="Invite someone" icon="person-add" kind="ghost" onPress={() => router.push('/circles')} />
        </ScrollView>
      </Sheet>
    </View>
  );
}

function describe(p: Person, places: ReturnType<typeof useCircle>['places'], me: Person | null) {
  if (!p.loc) return p.sharing ? 'Location not available yet' : 'Not sharing location';
  const place = placeAt(places, p.loc.lat, p.loc.lng);
  if (place) return `At ${place.name}`;
  if (p.loc.speed != null && p.loc.speed > 7) return `Moving · ${Math.round(p.loc.speed * 3.6)} km/h`;
  if (me?.loc && me.user_id !== p.user_id) return `${formatDistance(distanceM(me.loc.lat, me.loc.lng, p.loc.lat, p.loc.lng))} away`;
  return 'Out and about';
}

function MemberRow({ p, me, where, weather, sos, onPress, onLongPress }: {
  p: Person; me: boolean; where: string; weather?: string; sos: boolean; onPress: () => void; onLongPress: () => void;
}) {
  const { c } = useTheme();
  const paused = !p.sharing || (p.paused_until && new Date(p.paused_until) > new Date());
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <Avatar emoji={p.profile.emoji} color={p.profile.color} ring={sos ? c.danger : undefined} dim={Boolean(paused) && !me} />
      <View style={{ flex: 1 }}>
        <T weight="600">{p.profile.name}{me ? ' (you)' : ''}</T>
        <Sub numberOfLines={1}>{where}{p.loc ? ` · ${timeAgo(p.loc.recorded_at)}` : ''}</Sub>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Battery level={p.loc?.battery ?? null} charging={p.loc?.charging ?? null} />
        {weather ? <Sub size={12}>{weather}</Sub> : null}
      </View>
      <Press onPress={() => router.push({ pathname: '/member/[id]', params: { id: p.user_id } })} style={{ padding: 4 }}>
        <Icon name="chevron-forward" size={18} color={c.sub} />
      </Press>
    </Press>
  );
}

function NoCircle() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="people" size={48} color={c.accent} />
      </View>
      <T size={24} weight="800">Make your first circle</T>
      <Sub style={{ textAlign: 'center' }}>A circle is a private group, like your family. Create one, or join with an invite code.</Sub>
      <Button title="Get started" onPress={() => router.push('/circles')} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const pill = (c: ReturnType<typeof useTheme>['c']) => ({
  backgroundColor: c.glass, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 11,
  flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
  shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5,
});
