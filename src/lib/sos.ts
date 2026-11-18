import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/** Manual SOS: fires immediately (the 5-second countdown happens on screen first). */
export async function sendSos(lat: number | null, lng: number | null) {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Not signed in');
  const { data: row, error } = await supabase
    .from('sos_alerts')
    .insert({ user_id: uid, status: 'active', reason: 'manual', lat, lng })
    .select()
    .single();
  if (error) throw error;
  return row;
}

/** Crash: pending for 30 s, the server fires it unless cancelled. */
export async function raiseCrash(lat: number, lng: number) {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  const { data: open } = await supabase.from('sos_alerts').select('id').eq('user_id', uid).in('status', ['pending', 'active']);
  if (open?.length) return open[0].id as string; // don't stack alerts
  const { data: row } = await supabase
    .from('sos_alerts')
    .insert({ user_id: uid, status: 'pending', reason: 'crash', lat, lng, fire_at: new Date(Date.now() + 30_000).toISOString() })
    .select('id')
    .single();
  if (row && Platform.OS !== 'web') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Possible crash detected',
        body: "Tap if you're OK. Your circle gets an SOS in 30 seconds.",
        data: { type: 'crash', sos_id: row.id },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: Platform.OS === 'android' ? { channelId: 'sos' } : null,
    });
  }
  return row?.id ?? null;
}

export async function cancelSos(id: string) {
  const { data } = await supabase.from('sos_alerts').select('status').eq('id', id).single();
  await supabase
    .from('sos_alerts')
    .update({ status: data?.status === 'active' ? 'resolved' : 'cancelled', resolved_at: new Date().toISOString() })
    .eq('id', id);
}
