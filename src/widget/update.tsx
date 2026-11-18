import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { requestWidgetUpdate, type WidgetTaskHandler } from 'react-native-android-widget';

import { placeAt, timeAgo } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { CircleWidget, type WidgetPerson } from './CircleWidget';

/** Pull the current circle from Supabase (RLS applies) and turn it into widget rows. */
async function load(): Promise<{ circle: string; people: WidgetPerson[] }> {
  const circleId = await AsyncStorage.getItem('circle').catch(() => null);
  if (!circleId) return { circle: 'Orbit', people: [] };
  const [c, m, pl] = await Promise.all([
    supabase.from('circles').select('name').eq('id', circleId).single(),
    supabase.from('circle_members').select('user_id').eq('circle_id', circleId),
    supabase.from('places').select('*').eq('circle_id', circleId),
  ]);
  const ids = (m.data ?? []).map((r) => r.user_id);
  const [p, l] = await Promise.all([
    supabase.from('profiles').select('*').in('id', ids),
    supabase.from('locations_latest').select('*').in('user_id', ids),
  ]);
  const locs = Object.fromEntries((l.data ?? []).map((x) => [x.user_id, x]));
  return {
    circle: c.data?.name ?? 'Orbit',
    people: (p.data ?? []).map((pr) => {
      const loc = locs[pr.id];
      return {
        name: pr.name,
        emoji: pr.emoji,
        where: loc ? placeAt(pl.data ?? [], loc.lat, loc.lng)?.name ?? 'Out and about' : 'Not sharing',
        ago: loc ? timeAgo(loc.recorded_at) : '',
        battery: loc?.battery != null ? `${Math.round(loc.battery * 100)}%` : '',
      };
    }),
  };
}

let lastUpdate = 0;
export async function updateWidget() {
  if (Date.now() - lastUpdate < 60_000) return;
  lastUpdate = Date.now();
  const data = await load();
  await requestWidgetUpdate({
    widgetName: 'Circle',
    renderWidget: () => ({ light: <CircleWidget {...data} dark={false} />, dark: <CircleWidget {...data} dark /> }),
  });
}

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED') return;
  const data = await load().catch(() => ({ circle: 'Orbit', people: [] }));
  const dark = Appearance.getColorScheme() === 'dark';
  renderWidget(<CircleWidget {...data} dark={dark} />);
};
