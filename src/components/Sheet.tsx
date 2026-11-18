import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { radius, useTheme } from '@/lib/theme';

const SPRING = { damping: 22, stiffness: 220, mass: 0.8 };

/** Draggable bottom sheet with two resting heights (peek and expanded). */
export function Sheet({ peek, children, onHeight }: { peek: number; children: ReactNode; onHeight?: (h: number) => void }) {
  const { c } = useTheme();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // expanded: leave room for the top bar; on tablets/desktop keep a phone-width panel
  const full = Math.max(peek + 80, Math.min(height - insets.top - 140, 640));
  const side = width > 700 ? (width - 600) / 2 : 8;
  const h = useSharedValue(peek);
  const start = useSharedValue(peek);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => {
      start.value = h.value;
    })
    .onUpdate((e) => {
      h.value = Math.max(peek * 0.6, Math.min(full + 30, start.value - e.translationY));
    })
    .onEnd((e) => {
      const target = e.velocityY < -400 ? full : e.velocityY > 400 ? peek : h.value > (peek + full) / 2 ? full : peek;
      h.value = withSpring(target, SPRING);
      onHeight?.(target);
    });

  const style = useAnimatedStyle(() => ({ height: h.value }));

  return (
    <Animated.View style={[styles.sheet, { backgroundColor: c.glass, shadowColor: c.shadow, left: side, right: side }, style]}>
      <GestureDetector gesture={pan}>
        <View style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: c.line }]} />
        </View>
      </GestureDetector>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 8, borderRadius: radius.lg, overflow: 'hidden',
    shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -4 }, elevation: 16,
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 5, borderRadius: 3 },
});
