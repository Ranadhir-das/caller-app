import { StyleSheet, Switch, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AppUpdatePanel } from '@/components/AppUpdatePanel';

export default function SettingsScreen() {
  const { mode, colors, toggleTheme } = useAppTheme();
  const styles = useAppStyles(createStyles);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedBackButton />
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.description}>Personalize and manage your Vaani app.</Text>

        <Text style={styles.sectionHeader}>APPEARANCE</Text>
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Dark theme</Text>
            <Text style={styles.description}>{mode === 'dark' ? 'Dark appearance is on' : 'Light appearance is on'}</Text>
          </View>
          <Switch accessibilityLabel="Dark theme" value={mode === 'dark'} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.onPrimary} />
        </View>
        <Text style={styles.footnote}>Your theme preference is saved on this device and applies throughout the app.</Text>

        <Text style={styles.sectionHeader}>APP UPDATES</Text>
        <AppUpdatePanel />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  sectionHeader: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 8 },
  label: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 4 },
  card: { padding: 18, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  footnote: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: -4 },
});
