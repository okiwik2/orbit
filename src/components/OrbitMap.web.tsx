import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { circlePolygon } from '@/lib/geo';
import { mapStyle, useTheme } from '@/lib/theme';
import { initialBounds, type OrbitMapProps } from './map-types';

const PLACE_ICON = { home: '🏠', school: '🏫', work: '💼', other: '📍' } as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const safeColor = (s: string) => (/^#[0-9a-fA-F]{6}$/.test(s) ? s : '#5B7CFA');

function pinHtml(rawEmoji: string, rawColor: string, sos: boolean, rawWeather?: string, card = '#fff', text = '#000') {
  const emoji = esc(rawEmoji);
  const color = safeColor(rawColor);
  const weather = rawWeather && esc(rawWeather);
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div class="${sos ? 'orbit-sos' : ''}" style="width:48px;height:48px;border-radius:24px;background:${color};border:3px solid ${sos ? '#FF3B30' : '#fff'};
      display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 3px 10px rgba(0,0,0,.3);transition:transform .2s">${emoji}</div>
    ${weather ? `<div style="margin-top:-6px;padding:1px 6px;border-radius:8px;background:${card};color:${text};font:10px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.2)">${weather}</div>` : ''}
  </div>`;
}

if (typeof document !== 'undefined' && !document.getElementById('orbit-map-css')) {
  const s = document.createElement('style');
  s.id = 'orbit-map-css';
  s.textContent = `@keyframes orbitPulse{0%{box-shadow:0 0 0 0 rgba(255,59,48,.6)}100%{box-shadow:0 0 0 24px rgba(255,59,48,0)}}
  .orbit-sos{animation:orbitPulse 1.4s infinite}.maplibregl-ctrl-attrib{font-size:10px}`;
  document.head.appendChild(s);
}

export function OrbitMap({ people, places, dark, route, focus, bottomInset = 0, sosUserIds = [], weather = {}, onPersonPress, onLongPress }: OrbitMapProps) {
  const { c } = useTheme();
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const ready = useRef(false);
  const waiting = useRef<(() => void)[]>([]);
  const handlers = useRef({ onPersonPress, onLongPress });
  useEffect(() => {
    handlers.current = { onPersonPress, onLongPress };
  });

  // create map once
  useEffect(() => {
    if (!box.current) return;
    const b = initialBounds(people, places);
    const m = new maplibregl.Map({
      container: box.current,
      style: mapStyle(dark),
      ...(b ? { bounds: b, fitBoundsOptions: { padding: { top: 120, left: 60, right: 60, bottom: bottomInset + 60 } } } : { center: [174.7633, -36.8485], zoom: 10 }),
      attributionControl: { compact: true },
    });
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    m.on('contextmenu', (e: maplibregl.MapMouseEvent) => handlers.current.onLongPress?.(e.lngLat.lat, e.lngLat.lng));
    m.on('touchstart', (e: maplibregl.MapTouchEvent) => {
      if (e.originalEvent.touches.length !== 1) return;
      pressTimer = setTimeout(() => handlers.current.onLongPress?.(e.lngLat.lat, e.lngLat.lng), 600);
    });
    ['touchend', 'touchmove', 'dragstart'].forEach((ev) => m.on(ev as any, () => pressTimer && clearTimeout(pressTimer)));
    m.on('load', () => {
      ready.current = true;
      waiting.current.splice(0).forEach((fn) => fn());
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
      markers.current = {};
    };
  }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps

  // places + route layers
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const placeData: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: places.map((p) => ({ type: 'Feature', properties: {}, geometry: circlePolygon(p.lat, p.lng, p.radius_m) })),
      };
      const routeData: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route ?? [] } };
      const src = m.getSource('places') as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(placeData);
      else {
        m.addSource('places', { type: 'geojson', data: placeData });
        m.addLayer({ id: 'places-fill', type: 'fill', source: 'places', paint: { 'fill-color': c.accent, 'fill-opacity': 0.12 } });
        m.addLayer({ id: 'places-line', type: 'line', source: 'places', paint: { 'line-color': c.accent, 'line-width': 1.5, 'line-opacity': 0.6 } });
      }
      const rs = m.getSource('route') as maplibregl.GeoJSONSource | undefined;
      if (rs) rs.setData(routeData);
      else {
        m.addSource('route', { type: 'geojson', data: routeData });
        m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': c.accent, 'line-width': 5 } });
      }
      if (route && route.length > 1) {
        const lngs = route.map((p) => p[0]);
        const lats = route.map((p) => p[1]);
        m.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: { top: 80, left: 50, right: 50, bottom: bottomInset + 40 } });
      }
    };
    if (ready.current) apply();
    else waiting.current.push(apply);
  }, [places, route, dark, c.accent, bottomInset]);

  // HTML markers for people and places
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const put = (id: string, lng: number, lat: number, html: string, anchor: 'bottom' | 'center', onClick?: () => void) => {
      seen.add(id);
      const existing = markers.current[id];
      if (existing) {
        existing.setLngLat([lng, lat]);
        if (existing.getElement().dataset.html !== html) {
          existing.getElement().innerHTML = html;
          existing.getElement().dataset.html = html;
        }
        return;
      }
      const el = document.createElement('div');
      el.innerHTML = html;
      el.dataset.html = html;
      if (onClick) el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      markers.current[id] = new maplibregl.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(m);
    };
    for (const p of places) {
      put(`pl-${p.id}`, p.lng, p.lat,
        `<div style="width:28px;height:28px;border-radius:14px;background:${c.card};display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 1px 5px rgba(0,0,0,.25)">${PLACE_ICON[p.kind]}</div>`,
        'center');
    }
    for (const p of people) {
      if (!p.loc) continue;
      put(p.user_id, p.loc.lng, p.loc.lat, pinHtml(p.profile.emoji, p.profile.color, sosUserIds.includes(p.user_id), weather[p.user_id], c.card, c.text),
        'bottom', () => handlers.current.onPersonPress?.(p.user_id));
    }
    for (const [id, mk] of Object.entries(markers.current)) {
      if (!seen.has(id)) {
        mk.remove();
        delete markers.current[id];
      }
    }
  }, [people, places, sosUserIds, weather, c.card, c.text, dark]);

  useEffect(() => {
    if (focus) map.current?.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 15, duration: 900 });
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
}
