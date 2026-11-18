import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { OrbitMap } from '@/components/OrbitMap';
import { Avatar, Battery, Card, Chip, Icon, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { clock, distanceM, formatDistance, placeAt, timeAgo } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';

type Pt = { lat: number; lng: number; speed: number | null; recorded_at: string };
type Trip = { id: number; started_at: string; ended_at: string; distance_m: number; max_speed: number; hard_brakes: number; phone_use_s: number };
type Stop = { lat: number; lng: number; from: string; to: string };

/** Split a day's points into stops (stayed within 120 m for 5+ min). */
function findStops(pts: Pt[]): Stop[] {
  const stops: Stop[] = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && distanceM(pts[i].lat, pts[i].lng, pts[j + 1].lat, pts[j + 1].lng) < 120) j++;
    if (new Date(pts[j].recorded_at).getTime() - new Date(pts[i].recorded_at).getTime() >= 5 * 60_000) {
      stops.push({ lat: pts[i].lat, lng: pts[i].lng, from: pts[i].recorded_at, to: pts[j].recorded_at });
    }
    i = j + 1;
  }
  return stops;
}

export default function MemberScreen() {
  const { c, dark } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { people, places } = useCircle();
  const person = people.find((p) => p.user_id === id);
  const [day, setDay] = useState(0); // days ago
  const [pts, setPts] = useState<Pt[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - day);
    const end = new Date(start.getTime() + 86400_000);
    supabase.from('location_history').select('lat,lng,speed,recorded_at').eq('user_id', id)
      .gte('recorded_at', start.toISOString()).lt('recorded_at', end.toISOString()).order('recorded_at').limit(5000)
      .then(({ data }) => setPts(data ?? []));
  }, [id, day]);
  useEffect(() => {
    supabase.from('trips').select('*').eq('user_id', id).order('started_at', { ascending: false }).limit(100)
      .then(({ data }) => setTrips(data ?? []));
  }, [id]);

  const route = useMemo(() => pts.map((p) => [p.lng, p.lat] as [number, number]), [pts]);
  const stops = useMemo(() => findStops(pts), [pts]);
  const dayTrips = trips.filter((t) => {
    const d = new Date(t.started_at);
    const ref = new Date();
    ref.setDate(ref.getDate() - day);
    return d.toDateString() === ref.toDateString();
  });
  const week = useMemo(() => ({
    drives: trips.length,
    km: trips.reduce((s, t) => s + t.distance_m, 0) / 1000,
    top: Math.max(0, ...trips.map((t) => t.max_speed)) * 3.6,
    brakes: trips.reduce((s, t) => s + t.hard_brakes, 0),
    phone: Math.round(trips.reduce((s, t) => s + t.phone_use_s, 0) / 60),
  }), [trips]);

  if (!person) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  const where = person.loc ? placeAt(places, person.loc.lat, person.loc.lng)?.name ?? 'Out and about' : 'Not sharing';

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: person.profile.name }} />
      <View style={{ height: 300, backgroundColor: c.card }}>
        <OrbitMap people={day === 0 ? [person] : []} places={places} dark={dark} route={route} bottomInset={0} />
      </View>
      <View style={{ padding: 16, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
        <Animated.View entering={FadeInDown}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar emoji={person.profile.emoji} color={person.profile.color} size={56} />
            <View style={{ flex: 1 }}>
              <T size={20} weight="700">{person.profile.name}</T>
              <Sub>{where} · {timeAgo(person.loc?.recorded_at)}</Sub>
              {person.loc?.source === 'owntracks' && <Sub size={12}>via OwnTracks</Sub>}
            </View>
            <Battery level={person.loc?.battery ?? null} charging={person.loc?.charging ?? null} />
          </Card>
        </Animated.View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return <Chip key={i} label={i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })} active={day === i} onPress={() => setDay(i)} />;
          })}
        </ScrollView>

        <T size={18} weight="700">Timeline</T>
        <Card style={{ gap: 0 }}>
          {stops.length === 0 && dayTrips.length === 0 ? (
            <Sub>{pts.length ? `${pts.length} location updates, no long stops.` : 'No history for this day.'}</Sub>
          ) : (
            stops.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.accent, marginTop: 4 }} />
                  {i < stops.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: c.line }} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 14 }}>
                  <T weight="600">{placeAt(places, s.lat, s.lng)?.name ?? 'Stop'}</T>
                  <Sub>{clock(s.from)} – {clock(s.to)}</Sub>
                </View>
              </View>
            ))
          )}
        </Card>

        {dayTrips.length > 0 && (
          <>
            <T size={18} weight="700">Drives</T>
            {dayTrips.map((t) => (
              <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="car" size={24} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <T weight="600">{clock(t.started_at)} – {clock(t.ended_at)} · {formatDistance(t.distance_m)}</T>
                  <Sub>Top {Math.round(t.max_speed * 3.6)} km/h · {t.hard_brakes} hard brake{t.hard_brakes === 1 ? '' : 's'}{t.phone_use_s > 30 ? ` · phone ${Math.round(t.phone_use_s / 60)} min` : ''}</Sub>
                </View>
              </Card>
            ))}
          </>
        )}

        {trips.length > 0 && (
          <>
            <T size={18} weight="700">This week's driving</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                ['Drives', String(week.drives), 'car'],
                ['Distance', `${week.km.toFixed(0)} km`, 'speedometer'],
                ['Top speed', `${Math.round(week.top)} km/h`, 'flash'],
                ['Hard brakes', String(week.brakes), 'alert-circle'],
                ['Phone use', `${week.phone} min`, 'phone-portrait'],
              ].map(([label, value, icon]) => (
                <View key={label} style={{ backgroundColor: c.card, borderRadius: radius.md, padding: 14, minWidth: 100, flexGrow: 1 }}>
                  <Icon name={icon as any} size={18} color={c.accent} />
                  <T size={22} weight="800" style={{ marginTop: 6 }}>{value}</T>
                  <Sub size={12}>{label}</Sub>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
