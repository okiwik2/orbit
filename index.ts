// Entry point: register Android widget + background location task before the router loads.
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/update');
  registerWidgetTaskHandler(widgetTaskHandler);
}
if (Platform.OS !== 'web') require('./src/lib/tracker');

require('expo-router/entry');
