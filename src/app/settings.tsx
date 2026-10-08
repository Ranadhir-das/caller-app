import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AppUpdatePanel } from '@/components/AppUpdatePanel';

export default function SettingsScreen() {
  const { mode, colors, toggleTheme } = useAppTheme();
  const styles = useAppStyles(createStyles);

  const [showUpdater, setShowUpdater] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedBackButton />
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.description}>Personalize your Vaani app.</Text>
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Dark theme</Text>
            <Text style={styles.description}>{mode === 'dark' ? 'Dark appearance is on' : 'Light appearance is on'}</Text>
          </View>
          <Switch accessibilityLabel="Dark theme" value={mode === 'dark'} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.onPrimary} />
        </View>
        <Text style={styles.description}>Your theme preference is saved on this device and applies throughout the app.</Text>

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showUpdater }} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={() => setShowUpdater(value => !value)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Update app</Text>
            <Text style={styles.description}>Check, download and install Android app updates.</Text>
          </View>
          <Text style={styles.chevron}>↗</Text>
        </Pressable>
        {showUpdater && <AppUpdatePanel />}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 6 },
  card: { padding: 18, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  chevron: { fontSize: 18, color: colors.muted },
});
