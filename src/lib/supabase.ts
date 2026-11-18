import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_KEY || 'missing', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Profile = { id: string; name: string; emoji: string; color: string };
export type Member = {
  circle_id: string; user_id: string; role: 'admin' | 'member';
  sharing: boolean; paused_until: string | null; notify_places: boolean;
};
export type Loc = {
  user_id: string; lat: number; lng: number; accuracy: number | null; speed: number | null;
  heading: number | null; battery: number | null; charging: boolean | null;
  source: 'app' | 'web' | 'owntracks'; recorded_at: string;
};
export type Place = {
  id: string; circle_id: string; name: string; kind: 'home' | 'school' | 'work' | 'other';
  lat: number; lng: number; radius_m: number;
};
export type Message = {
  id: number; circle_id: string; user_id: string | null; kind: 'text' | 'checkin' | 'sos' | 'system';
  body: string; lat: number | null; lng: number | null; created_at: string;
};
export type Sos = {
  id: string; user_id: string; status: 'pending' | 'active' | 'cancelled' | 'resolved';
  reason: 'manual' | 'crash'; lat: number | null; lng: number | null; created_at: string;
};
export type Eta = {
  id: string; user_id: string; circle_id: string; dest_name: string; dest_lat: number; dest_lng: number;
  eta_at: string | null; distance_m: number | null; active: boolean;
};
export type Settings = {
  user_id: string; precise: boolean; low_battery_alerts: boolean; driving_enabled: boolean;
  crash_detection: boolean; ha_webhook_url: string | null; consent_at: string | null;
};
