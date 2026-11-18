import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { distanceM } from './geo';
import { supabase } from './supabase';

// Simple drive detection from GPS speed. Runs inside the background location task.
const START_SPEED = 7; // m/s ≈ 25 km/h
const STOP_SPEED = 2;
const STOP_AFTER_MS = 3 * 60_000;
const HARD_BRAKE = 3.5; // m/s² sustained between fixes
const CRASH_FROM = 13; // ≈ 47 km/h
const CRASH_TO = 1.5;

type Point = { lat: number; lng: number; t: number; speed: number };
type Drive = {
  active: boolean; startedAt: number; lastFastAt: number; distance: number; maxSpeed: number;
  hardBrakes: number; phoneUseMs: number; start: Point | null; last: Point | null;
};
const empty: Drive = { active: false, startedAt: 0, lastFastAt: 0, distance: 0, maxSpeed: 0, hardBrakes: 0, phoneUseMs: 0, start: null, last: null };

export type DriveResult = { crash: boolean };

export async function onDriveFix(uid: string, p: Point, crashEnabled: boolean): Promise<DriveResult> {
  const raw = await AsyncStorage.getItem('drive').catch(() => null);
  const d: Drive = raw ? JSON.parse(raw) : { ...empty };
  const prev = d.last;
  const dt = prev ? (p.t - prev.t) / 1000 : 0;
  // fall back to computed speed when GPS doesn't report one
  if ((p.speed == null || p.speed < 0) && prev && dt > 0) p.speed = distanceM(prev.lat, prev.lng, p.lat, p.lng) / dt;
  let crash = false;

  if (!d.active && p.speed >= START_SPEED) {
    Object.assign(d, { ...empty, active: true, startedAt: prev?.t ?? p.t, lastFastAt: p.t, start: prev ?? p });
  }
  if (d.active && prev) {
    d.distance += distanceM(prev.lat, prev.lng, p.lat, p.lng);
    d.maxSpeed = Math.max(d.maxSpeed, p.speed);
    if (dt > 0 && dt <= 10 && (prev.speed - p.speed) / dt > HARD_BRAKE) d.hardBrakes++;
    if (AppState.currentState === 'active' && dt < 120) d.phoneUseMs += dt * 1000;
    if (crashEnabled && dt > 0 && dt <= 8 && prev.speed >= CRASH_FROM && p.speed <= CRASH_TO) crash = true;
    if (p.speed >= STOP_SPEED) d.lastFastAt = p.t;
    if (p.t - d.lastFastAt > STOP_AFTER_MS) {
      if (d.distance > 500 && d.start) {
        await supabase.from('trips').insert({
          user_id: uid,
          started_at: new Date(d.startedAt).toISOString(),
          ended_at: new Date(d.lastFastAt).toISOString(),
          distance_m: Math.round(d.distance),
          max_speed: d.maxSpeed,
          hard_brakes: d.hardBrakes,
          phone_use_s: Math.round(d.phoneUseMs / 1000),
          start_lat: d.start.lat, start_lng: d.start.lng, end_lat: p.lat, end_lng: p.lng,
        });
      }
      Object.assign(d, empty);
    }
  }
  d.last = p;
  await AsyncStorage.setItem('drive', JSON.stringify(d)).catch(() => {});
  return { crash };
}

/** Is the phone currently in a drive (used to boost GPS accuracy and arm the crash sensor)? */
export async function isDriving() {
  const raw = await AsyncStorage.getItem('drive').catch(() => null);
  return raw ? (JSON.parse(raw) as Drive).active : false;
}
