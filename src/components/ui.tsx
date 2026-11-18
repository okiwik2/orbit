import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { radius, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = Ionicons;

export const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

export function T({ children, size = 15, weight = '400', color, style, numberOfLines }: {
  children: ReactNode; size?: number; weight?: TextStyle['fontWeight']; color?: string;
  style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  const { c } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: size, fontWeight: weight, color: color ?? c.text, letterSpacing: size > 22 ? -0.5 : 0 }, style]}>
      {children}
    </Text>
  );
}

export const Sub = (p: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; numberOfLines?: number }) => {
  const { c } = useTheme();
  return <T size={p.size ?? 13} color={c.sub} style={p.style} numberOfLines={p.numberOfLines}>{p.children}</T>;
};

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme();
  const s = [{ backgroundColor: c.card, borderRadius: radius.md, padding: 16 }, style];
  return onPress ? <Press onPress={onPress} style={s}>{children}</Press> : <View style={s}>{children}</View>;
}

/** Pressable with a springy scale animation. */
export function Press({ children, onPress, onLongPress, style, disabled, haptic = true }: {
  children: ReactNode; onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; haptic?: boolean;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => scale.set(withSpring(0.96, { damping: 15, stiffness: 400 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 12, stiffness: 300 }))}
      onPress={() => {
        if (haptic) tap();
        onPress?.();
      }}
      onLongPress={onLongPress}>
      <Animated.View style={[style, anim, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, loading, disabled, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = { primary: c.accent, secondary: c.accentSoft, danger: c.danger, ghost: 'transparent' }[kind];
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : c.accent;
  return (
    <Press onPress={onPress} disabled={disabled || loading}
      style={[{ backgroundColor: bg, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <T weight="600" color={fg} size={16}>{title}</T>
    </Press>
  );
}

export function Field(props: TextInputProps) {
  const { c } = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.sub}
      {...props}
      style={[{ backgroundColor: c.cardAlt, color: c.text, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 }, props.style]}
    />
  );
}

export function Avatar({ emoji, color, size = 44, ring, dim }: { emoji: string; color: string; size?: number; ring?: string; dim?: boolean }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center',
      borderWidth: ring ? 3 : 0, borderColor: ring, opacity: dim ? 0.5 : 1,
    }}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

export function Battery({ level, charging }: { level: number | null; charging: boolean | null }) {
  const { c } = useTheme();
  if (level == null) return null;
  const pct = Math.round(level * 100);
  const icon: IconName = charging ? 'battery-charging' : pct > 60 ? 'battery-full' : pct > 20 ? 'battery-half' : 'battery-dead';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name={icon} size={15} color={pct <= 15 && !charging ? c.danger : c.sub} />
      <Sub size={12}>{pct}%</Sub>
    </View>
  );
}

export function Row({ icon, title, subtitle, right, onPress, danger }: {
  icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const { c } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      {icon && (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: danger ? c.dangerSoft : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={danger ? c.danger : c.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T weight="500" color={danger ? c.danger : undefined}>{title}</T>
        {subtitle ? <Sub>{subtitle}</Sub> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={c.sub} /> : null)}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{body}</Press> : body;
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { c } = useTheme();
  return <Switch value={value} onValueChange={(v) => { tap(); onChange(v); }} trackColor={{ true: c.accent, false: c.line }} thumbColor="#fff" />;
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      {title ? <Sub style={styles.sectionTitle}>{title.toUpperCase()}</Sub> : null}
      <Card style={{ paddingVertical: 4 }}>{children}</Card>
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: active ? c.accent : c.cardAlt }}>
      {icon && <Icon name={icon} size={15} color={active ? '#fff' : c.text} />}
      <T size={14} weight="600" color={active ? '#fff' : c.text}>{label}</T>
    </Press>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginLeft: 16, marginBottom: 8, letterSpacing: 0.6, fontWeight: '600' },
});
