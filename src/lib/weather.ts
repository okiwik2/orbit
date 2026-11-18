// Free weather from Open-Meteo (no key). Cached per ~5 km cell for 30 minutes.
const cache = new Map<string, { at: number; w: Weather }>();
export type Weather = { temp: number; icon: string };

const ICONS: [number, string][] = [
  [0, '☀️'], [2, '⛅'], [3, '☁️'], [48, '🌫️'], [57, '🌦️'], [67, '🌧️'], [77, '🌨️'], [82, '🌧️'], [86, '🌨️'], [99, '⛈️'],
];

export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.w;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&current=temperature_2m,weather_code`,
    );
    const j = await res.json();
    const code: number = j.current.weather_code;
    const w = { temp: Math.round(j.current.temperature_2m), icon: (ICONS.find(([c]) => code <= c) ?? ICONS[0])[1] };
    cache.set(key, { at: Date.now(), w });
    return w;
  } catch {
    return null;
  }
}
