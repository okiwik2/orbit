import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { useTheme } from '@/lib/theme';

const TABS: [string, string, IconName][] = [
  ['index', 'Map', 'map'],
  ['places', 'Places', 'location'],
  ['chat', 'Chat', 'chatbubbles'],
  ['settings', 'Settings', 'settings'],
];

export default function TabLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.sub,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line, height: Platform.OS === 'web' ? 64 : undefined },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
      }}>
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => <Icon name={(focused ? icon : `${icon}-outline`) as IconName} size={24} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
