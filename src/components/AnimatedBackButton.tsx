import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
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
  const styles = useAppStyles(createStyles);
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

const createStyles = (colors: AppColors) => StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
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
    color: colors.text,
    fontWeight: '300',
    marginTop: -2,
  },
});