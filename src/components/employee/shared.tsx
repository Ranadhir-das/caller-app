import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppStyles, useAppTheme, AppColors } from '@/context/AppThemeContext';

export const makeStyles = (c: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '700', color: c.text }, heading: { fontSize: 18, fontWeight: '700', color: c.text },
  label: { fontSize: 14, fontWeight: '600', color: c.text }, subtitle: { fontSize: 13, lineHeight: 20, color: c.muted },
  card: { padding: 16, borderRadius: 16, backgroundColor: c.surface, gap: 12, borderWidth: 1, borderColor: c.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  button: { backgroundColor: c.primary, padding: 12, borderRadius: 10, minHeight: 44 }, buttonText: { color: c.onPrimary, fontWeight: '600', fontSize: 13 },
  input: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, color: c.text, backgroundColor: c.background, fontSize: 15 },
  dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, calendarIcon: { fontSize: 16 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, backgroundColor: c.accentSoft },
  chevron: { width: 9, height: 9, borderTopWidth: 2, borderRightWidth: 2, borderColor: c.muted, transform: [{ rotate: '45deg' }], marginRight: 4 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { flexGrow: 1, flexBasis: '30%', minWidth: 100, padding: 14, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, gap: 6 },
  actionCardPressed: { backgroundColor: c.surfaceMuted },
  actionIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  actionIconText: { fontSize: 18 },
  actionTitle: { fontSize: 14, fontWeight: '700', color: c.text },
  actionSubtitle: { fontSize: 11, color: c.muted },
});

export function ActionButton({ title, onPress, busy }: { title: string; onPress: () => void; busy: boolean }) {
  const styles = useAppStyles(makeStyles);
  return <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.button, busy && { opacity: 0.6 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}

export function FormInput({ label, value, onChangeText, multiline }: { label: string; value: string; onChangeText: (s: string) => void; multiline?: boolean }) {
  const styles = useAppStyles(makeStyles);
  const { colors, mode } = useAppTheme();
  return <View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, multiline && { minHeight: 85, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} multiline={multiline} keyboardAppearance={mode} placeholderTextColor={colors.placeholder} autoCapitalize="none" /></View>;
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const showDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function DateField({ label, value, onPress }: { label: string; value: Date | null; onPress: () => void }) {
  const styles = useAppStyles(makeStyles);
  const { colors } = useAppTheme();
  return <View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={label} style={[styles.input, styles.dateInput]} onPress={onPress}><Text style={{ color: value ? colors.text : colors.placeholder, fontSize: 15 }}>{value ? showDate(value) : 'Select date'}</Text><Text style={styles.calendarIcon}>📅</Text></Pressable></View>;
}
