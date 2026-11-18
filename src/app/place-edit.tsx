import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { FormScroll } from '@/components/keyboard';
import { OrbitMap } from '@/components/OrbitMap';
import { Button, Chip, Field, Sub, T } from '@/components/ui';
import { useCircle } from '@/lib/circle';
import { useSession } from '@/lib/session';
import { supabase, type Place } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';
import { currentPosition } from '@/lib/tracker';

const KINDS: [Place['kind'], string][] = [['home', '🏠 Home'], ['school', '🏫 School'], ['work', '💼 Work'], ['other', '📍 Other']];
const RADII = [100, 150, 250, 500, 1000];

export default function PlaceEdit() {
  const { c, dark } = useTheme();
  const params = useLocalSearchParams<{ id?: string; lat?: string; lng?: string }>();
  const { session } = useSession();
  const { circleId, places, refresh } = useCircle();
  const existing = places.find((p) => p.id === params.id);
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<Place['kind']>(existing?.kind ?? 'home');
  const [r, setR] = useState(existing?.radius_m ?? 150);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(
    existing ? { lat: existing.lat, lng: existing.lng } : params.lat ? { lat: Number(params.lat), lng: Number(params.lng) } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pos) currentPosition().then(setPos).catch(() => setError('Turn on location, or long-press the map to pick a spot.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo<Place[]>(
    () => (pos ? [{ id: 'draft', circle_id: '', name, kind, lat: pos.lat, lng: pos.lng, radius_m: r }] : []),
    [pos, name, kind, r],
  );
  const focus = useMemo(() => (pos ? { ...pos, zoom: r > 400 ? 13 : 15, key: r + (pos.lat + pos.lng) } : null), [pos, r]);

  const save = async () => {
    if (!pos || !circleId) return;
    setBusy(true);
    const row = { name: name.trim(), kind, radius_m: r, lat: pos.lat, lng: pos.lng };
    const { error } = existing
      ? await supabase.from('places').update(row).eq('id', existing.id)
      : await supabase.from('places').insert({ ...row, circle_id: circleId, created_by: session!.user.id });
    setBusy(false);
    if (error) return setError(error.message);
    await refresh();
    router.back();
  };
  const del = async () => {
    if (!existing) return;
    if (Platform.OS === 'web' && !window.confirm(`Delete ${existing.name}?`)) return;
    await supabase.from('places').delete().eq('id', existing.id);
    await refresh();
    router.back();
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <View style={{ height: 240, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.card }}>
        {pos && <OrbitMap people={[]} places={preview} dark={dark} focus={focus} onLongPress={(lat, lng) => setPos({ lat, lng })} />}
      </View>
      <Sub>Long-press the map to move the place.</Sub>
      <Field placeholder="Name (e.g. Home, Grandma's)" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map(([k, label]) => <Chip key={k} label={label} active={kind === k} onPress={() => setKind(k)} />)}
      </View>
      <T weight="600">Alert radius</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {RADII.map((x) => <Chip key={x} label={x >= 1000 ? '1 km' : `${x} m`} active={r === x} onPress={() => setR(x)} />)}
      </View>
      <Button title={existing ? 'Save changes' : 'Add place'} onPress={save} loading={busy} disabled={!pos || !name.trim()} />
      {existing && <Button title="Delete place" kind="ghost" onPress={del} />}
      {error ? <T color={c.danger}>{error}</T> : null}
    </FormScroll>
  );
}
