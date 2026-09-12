import { Pressable, Text } from 'react-native';
import { useAppTheme } from '@/context/AppThemeContext';

export function ThemeToggle() {
  const { mode, colors, toggleTheme } = useAppTheme();
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${next} mode`} onPress={toggleTheme}
      style={({ pressed }) => ({ paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 12,
        backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '600' }}>{mode === 'dark' ? '☀ Light mode' : '☾ Dark mode'}</Text>
    </Pressable>
  );
}
