import { ReactNode } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

type AnimatedBackButtonProps = {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  children?: ReactNode;
};

export function AnimatedBackButton({
  style,
  onPress,
  children,
}: AnimatedBackButtonProps) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && styles.buttonPressed,
      ]}
    >
      {children ?? <Text style={styles.icon}>‹</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  buttonPressed: {
    transform: [
      {
        scale: 0.88,
      },
    ],
    opacity: 0.7,
  },

  icon: {
    fontSize: 32,
    lineHeight: 34,
    color: '#111827',
    fontWeight: '300',
    marginTop: -2,
  },
});