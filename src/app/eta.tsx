import { router } from 'expo-router';
import { useState } from 'react';

import { FormScroll } from '@/components/keyboard';
import { Button, Card, Row, Section, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { routeEta } from '@/lib/eta';
import { clock, formatDistance } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { supabase, type Place } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { currentPosition } from '@/lib/tracker';

const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const ICON = { home: 'home', school: 'school', work: 'briefcase', other: 'location' } as const;

export default function EtaScreen() {
  const { c } = useTheme();
  const { session } = useSession();
  const { circleId, places, etas } = useCircle();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mine = etas.filter((e) => e.user_id === session?.user.id);

  const start = async (pl: Place) => {
    if (!circleId || !session) return;
    setBusy(pl.id);
    setError('');
    try {
      const here = await currentPosition();
      const r = await routeEta(here, pl);
      const { error } = await supabase.from('eta_shares').insert({
        user_id: session.user.id, circle_id: circleId, dest_name: pl.name, dest_lat: pl.lat, dest_lng: pl.lng,
        eta_at: r ? inSeconds(r.seconds) : null, distance_m: r?.meters ?? null,
      });
      if (error) throw error;
      await supabase.from('messages').insert({
        circle_id: circleId, user_id: session.user.id, kind: 'checkin',
        body: `On my way to ${pl.name}${r ? ` — arriving about ${clock(inSeconds(r.seconds))}` : ''} 🚗`,
      });
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Could not start');
    } finally {
      setBusy(null);
    }
  };

  const stop = async (id: string) => {
    await supabase.from('eta_shares').update({ active: false }).eq('id', id);
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <Sub style={{ marginBottom: 16 }}>Your circle sees a live arrival time until you get there. It stops automatically when you arrive.</Sub>
      {mine.length > 0 && (
        <Section title="Sharing now">
          {mine.map((e) => (
            <Row key={e.id} icon="navigate" title={e.dest_name}
              subtitle={`${e.eta_at ? `Arriving ~${clock(e.eta_at)}` : 'Calculating…'}${e.distance_m ? ` · ${formatDistance(e.distance_m)}` : ''}`}
              right={<Button title="Stop" kind="secondary" onPress={() => stop(e.id)} style={{ paddingVertical: 8 }} />} />
          ))}
        </Section>
      )}
      <Section title="Where are you going?">
        {places.length === 0 ? (
          <Sub style={{ paddingVertical: 12 }}>Add places first (Places tab).</Sub>
        ) : (
          places.map((pl) => (
            <Row key={pl.id} icon={ICON[pl.kind]} title={pl.name} subtitle={busy === pl.id ? 'Working out the route…' : undefined} onPress={() => !busy && start(pl)} />
          ))
        )}
      </Section>
      {error ? <Card><T color={c.danger}>{error}</T></Card> : null}
    </FormScroll>
  );
}
