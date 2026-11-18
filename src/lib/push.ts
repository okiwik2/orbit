import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function registerPush(uid: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Places & updates', importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('sos', {
      name: 'SOS & crash alerts', importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 600, 250, 600, 250, 600], bypassDnd: true, sound: 'default',
    });
  }
  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false; // run `npx eas-cli init` first
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from('push_tokens').upsert({ token, user_id: uid, kind: 'expo' });
  return true;
}

export function onNotificationTap(cb: (data: Record<string, any>) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => cb(r.notification.request.content.data ?? {}));
  Notifications.getLastNotificationResponseAsync().then((r) => r && cb(r.notification.request.content.data ?? {}));
  return () => sub.remove();
}

export const pushSupported = () => true;
