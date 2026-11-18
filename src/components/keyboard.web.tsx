// Web / iPhone home-screen app: the browser already scrolls the focused box into view.
import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function FormScroll(props: ScrollViewProps & { children: ReactNode }) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}

export function KeyboardScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}
