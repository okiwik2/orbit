import { Tabs } from 'expo-router';

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
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        // hide the tab bar while typing so the keyboard has room (Android)
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
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
