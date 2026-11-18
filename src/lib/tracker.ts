// Android/iOS-native background tracking.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { isDriving, onDriveFix } from './driving';
import { raiseCrash } from './sos';
import { supabase } from './supabase';
import { getPrefs, uploadFix } from './upload';
import { updateWidget } from '@/widget/update';

export const TASK = 'orbit-location';
type Mode = 'driving' | 'normal' | 'saver';

// Adaptive: precise while driving, relaxed normally, very relaxed on low battery.
const OPTIONS: Record<Mode, Location.LocationTaskOptions> = {
  driving: { accuracy: Location.Accuracy.High, distanceInterval: 30, timeInterval: 5_000 },
  normal: { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 60_000, deferredUpdatesInterval: 60_000 },
  saver: { accuracy: Location.Accuracy.Low, distanceInterval: 250, timeInterval: 300_000, deferredUpdatesInterval: 300_000 },
};

async function start(mode: Mode) {
  await Location.startLocationUpdatesAsync(TASK, {
    ...OPTIONS[mode],
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.Other,
    foregroundService: {
      notificationTitle: 'Orbit is sharing your location',
      notificationBody: 'With your circles. Open Orbit to pause.',
      notificationColor: '#5B7CFA',
      killServiceOnDestroy: false,
    },
  });
  await AsyncStorage.setItem('trackMode', mode);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const loc = data.locations[data.locations.length - 1];
  const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
  const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  await uploadFix({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy,
    speed: loc.coords.speed,
    heading: loc.coords.heading,
    battery: level >= 0 ? level : null,
    charging,
    source: 'app',
    at: loc.timestamp,
  });

  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return;
  const prefs = await getPrefs(uid);
  if (prefs.driving || prefs.crash) {
    for (const l of data.locations) {
      const r = await onDriveFix(uid, { lat: l.coords.latitude, lng: l.coords.longitude, t: l.timestamp, speed: l.coords.speed ?? -1 }, prefs.crash);
      if (r.crash) await raiseCrash(l.coords.latitude, l.coords.longitude);
    }
  }

  // switch GPS mode if needed
  const want: Mode = (await isDriving()) ? 'driving' : level >= 0 && level < 0.2 && !charging ? 'saver' : 'normal';
  if (want !== (await AsyncStorage.getItem('trackMode'))) await start(want).catch(() => {});
  updateWidget().catch(() => {});
});

export async function permissionStatus() {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return { foreground: fg.granted, background: bg.granted };
}

/** Ask step by step (Android requires foreground first, then "Allow all the time"). */
export async function requestPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { foreground: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.granted };
}

export async function startTracking() {
  const { foreground, background } = await permissionStatus();
  if (!foreground) return false;
  if (!background) {
    // still share while app is open
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const level = await Battery.getBatteryLevelAsync();
    await uploadFix({
      lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed,
      heading: pos.coords.heading, battery: level >= 0 ? level : null, charging: null, source: 'app', at: pos.timestamp,
    });
    return false;
  }
  if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) await start('normal');
  return true;
}

export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

/** One quick fix (used for SOS / check-in). */
export async function currentPosition() {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
