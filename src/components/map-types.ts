import type { Person } from '@/lib/circle';
import type { Place } from '@/lib/supabase';

export type OrbitMapProps = {
  people: Person[];
  places: Place[];
  dark: boolean;
  /** Route to draw (journey history), as [lng, lat] pairs. */
  route?: [number, number][];
  /** Changing this value flies the camera to the point. */
  focus?: { lat: number; lng: number; zoom?: number; key: number } | null;
  /** Bottom padding so pins aren't hidden behind the sheet. */
  bottomInset?: number;
  sosUserIds?: string[];
  weather?: Record<string, string>;
  onPersonPress?: (userId: string) => void;
  onLongPress?: (lat: number, lng: number) => void;
};

export function initialBounds(people: Person[], places: Place[]) {
  const pts = [
    ...people.filter((p) => p.loc).map((p) => [p.loc!.lng, p.loc!.lat]),
    ...places.map((p) => [p.lng, p.lat]),
  ];
  if (!pts.length) return null;
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const pad = 0.004;
  return [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad] as [number, number, number, number];
}
