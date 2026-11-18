import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F2F3F7', card: '#FFFFFF', cardAlt: '#F6F7FA', text: '#0B0D12', sub: '#6B7080', line: '#E4E6EC',
  accent: '#5B7CFA', accentSoft: '#E6EBFF', danger: '#FF3B30', dangerSoft: '#FFE5E3', good: '#22C55E', warn: '#F59E0B',
  glass: 'rgba(255,255,255,0.86)', shadow: '#1B2240',
};
const dark: typeof light = {
  bg: '#0B0D12', card: '#161922', cardAlt: '#1E222D', text: '#F4F5F8', sub: '#9298A8', line: '#262B37',
  accent: '#7B95FF', accentSoft: '#1F2747', danger: '#FF453A', dangerSoft: '#3A1715', good: '#30D158', warn: '#FFB224',
  glass: 'rgba(22,25,34,0.88)', shadow: '#000000',
};
export type Palette = typeof light;
export type ThemePref = 'system' | 'light' | 'dark';

const Ctx = createContext<{ c: Palette; dark: boolean; pref: ThemePref; setPref: (p: ThemePref) => void }>({
  c: light, dark: false, pref: 'system', setPref: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');
  useEffect(() => {
    AsyncStorage.getItem('theme').then((v) => v && setPrefState(v as ThemePref)).catch(() => {});
  }, []);
  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem('theme', p).catch(() => {});
  };
  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';
  return <Ctx.Provider value={{ c: isDark ? dark : light, dark: isDark, pref, setPref }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export const radius = { sm: 12, md: 18, lg: 26, pill: 999 };

// Free OpenStreetMap vector styles from OpenFreeMap (no key needed).
export const mapStyle = (dark: boolean) =>
  dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
