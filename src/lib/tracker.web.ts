// Web / iPhone home-screen app: shares location only while Orbit is open.
// (iPhone background location comes from OwnTracks — see the OwnTracks screen.)
import { distanceM } from './geo';
import { uploadFix } from './upload';

let watchId: number | null = null;
let last: { lat: number; lng: number; at: number } | null = null;

async function battery() {
  try {
    const b = await (navigator as any).getBattery?.();
    return b ? { battery: b.level as number, charging: b.charging as boolean } : { battery: null, charging: null };
  } catch {
    return { battery: null, charging: null };
  }
}

export async function permissionStatus() {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return { foreground: p.state === 'granted', background: false };
  } catch {
    return { foreground: false, background: false };
  }
}

export function requestPermissions() {
  return new Promise<{ foreground: boolean; background: boolean }>((resolve) =>
    navigator.geolocation.getCurrentPosition(
      () => resolve({ foreground: true, background: false }),
      () => resolve({ foreground: false, background: false }),
    ),
  );
}

export async function startTracking() {
  if (watchId != null || !('geolocation' in navigator)) return false;
  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      // throttle: every 30 s or 40 m
      if (last && Date.now() - last.at < 30_000 && distanceM(last.lat, last.lng, lat, lng) < 40) return;
      last = { lat, lng, at: Date.now() };
      await uploadFix({
        lat, lng, accuracy: pos.coords.accuracy, speed: pos.coords.speed, heading: pos.coords.heading,
        ...(await battery()), source: 'web', at: pos.timestamp,
      });
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 15_000 },
  );
  return false; // never background on web
}

export async function stopTracking() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export function currentPosition() {
  return new Promise<{ lat: number; lng: number }>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000 },
    ),
  );
}

export const TASK = 'orbit-location';
