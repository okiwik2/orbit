// Keyboard handling that works with Android edge-to-edge (where the old "resize" no longer happens).
import type { ReactNode } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView, KeyboardProvider } from 'react-native-keyboard-controller';

export { KeyboardProvider };

/** Scrolling form: keeps the focused box above the keyboard, buttons work on the first tap. */
export function FormScroll(props: ScrollViewProps & { children: ReactNode }) {
  return <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" {...props} />;
}

/** Whole-screen layout that shrinks above the keyboard (chat). */
export function KeyboardScreen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}
