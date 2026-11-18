// Foreground crash detection with the accelerometer (Android app open while driving).
// Background crashes are caught from GPS speed in driving.ts.
import { Accelerometer } from 'expo-sensors';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { isDriving } from './driving';
import { raiseCrash } from './sos';
import { currentPosition } from './tracker';

const G_LIMIT = 4; // g

export function useCrashSensor(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(async ({ x, y, z }) => {
      if (busy || Math.sqrt(x * x + y * y + z * z) < G_LIMIT) return;
      busy = true;
      try {
        if (await isDriving()) {
          const pos = await currentPosition();
          const id = await raiseCrash(pos.lat, pos.lng);
          if (id) router.push({ pathname: '/sos', params: { pending: id } });
        }
      } finally {
        setTimeout(() => (busy = false), 60_000);
      }
    });
    return () => sub.remove();
  }, [enabled]);
}
