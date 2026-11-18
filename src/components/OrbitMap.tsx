import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { circlePolygon } from '@/lib/geo';
import { mapStyle, useTheme } from '@/lib/theme';
import { initialBounds, type OrbitMapProps } from './map-types';

function Pulse({ color }: { color: string }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
  }, [v]);
  const s = useAnimatedStyle(() => ({ transform: [{ scale: 1 + v.value * 1.4 }], opacity: 0.55 * (1 - v.value) }));
  return <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: color }, s]} />;
}

export function OrbitMap({ people, places, dark, route, focus, bottomInset = 0, sosUserIds = [], weather = {}, onPersonPress, onLongPress }: OrbitMapProps) {
  const { c } = useTheme();
  const cam = useRef<CameraRef>(null);
  // only used for the first camera position
  const [bounds] = useState(() => initialBounds(people, places));

  useEffect(() => {
    if (focus) cam.current?.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 15, duration: 900 });
  }, [focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (route && route.length > 1) {
      const lngs = route.map((p) => p[0]);
      const lats = route.map((p) => p[1]);
      cam.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
        padding: { top: 80, left: 50, right: 50, bottom: bottomInset + 40 }, duration: 700,
      });
    }
  }, [route, bottomInset]);

  const placeShapes = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: places.map((p) => ({ type: 'Feature', properties: { name: p.name }, geometry: circlePolygon(p.lat, p.lng, p.radius_m) })),
  }), [places]);

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle(dark)}
      logo={false}
      attributionPosition={{ top: 8, left: 8 }}
      compass={false}
      onLongPress={(e) => onLongPress?.(e.nativeEvent.lngLat[1], e.nativeEvent.lngLat[0])}>
      <Camera
        ref={cam}
        initialViewState={bounds ? { bounds, padding: { top: 120, left: 60, right: 60, bottom: bottomInset + 60 } } : { center: [174.7633, -36.8485], zoom: 10 }}
      />
      <GeoJSONSource id="places" data={placeShapes}>
        <Layer id="places-fill" type="fill" paint={{ 'fill-color': c.accent, 'fill-opacity': 0.12 }} />
        <Layer id="places-line" type="line" paint={{ 'line-color': c.accent, 'line-width': 1.5, 'line-opacity': 0.6 }} />
      </GeoJSONSource>
      {route && route.length > 1 ? (
        <GeoJSONSource id="route" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } }}>
          <Layer id="route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': c.accent, 'line-width': 5 }} />
        </GeoJSONSource>
      ) : null}
      {places.map((p) => (
        <Marker key={`pl-${p.id}`} id={`pl-${p.id}`} lngLat={[p.lng, p.lat]}>
          <View style={[styles.placePin, { backgroundColor: c.card }]}>
            <Text style={{ fontSize: 14 }}>{({ home: '🏠', school: '🏫', work: '💼', other: '📍' } as const)[p.kind]}</Text>
          </View>
        </Marker>
      ))}
      {people.filter((p) => p.loc).map((p) => {
        const sos = sosUserIds.includes(p.user_id);
        return (
          <Marker key={p.user_id} id={p.user_id} lngLat={[p.loc!.lng, p.loc!.lat]} anchor="bottom" onPress={() => onPersonPress?.(p.user_id)}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                {sos && <Pulse color={c.danger} />}
                <View style={[styles.pin, { backgroundColor: p.profile.color, borderColor: sos ? c.danger : '#fff' }]}>
                  <Text style={{ fontSize: 24 }}>{p.profile.emoji}</Text>
                </View>
              </View>
              {weather[p.user_id] ? (
                <View style={[styles.weather, { backgroundColor: c.card }]}><Text style={{ fontSize: 10, color: c.text }}>{weather[p.user_id]}</Text></View>
              ) : null}
            </View>
          </Marker>
        );
      })}
    </Map>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  placePin: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  weather: { marginTop: -6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, elevation: 2 },
});
