import { StyleSheet } from 'react-native';
import type { AppColors } from '@/context/AppThemeContext';

export const createStyles = (c: AppColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: c.text }, name: { fontSize: 18, fontWeight: '700', color: c.text },
  text: { color: c.text, lineHeight: 23 }, muted: { color: c.muted }, link: { color: c.accent, fontWeight: '700', paddingVertical: 8 },
  card: { backgroundColor: c.surface, padding: 16, borderWidth: 1, borderColor: c.border, borderRadius: 16, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  input: { color: c.text, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 14 },
  button: { backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' }, error: { color: c.danger },
});
