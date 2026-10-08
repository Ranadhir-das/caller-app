import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { availabilityTone, COUNSELOR_TEAL, counselorApi, type CounselorOption } from '@/services/counselor';

type Props = {
  visible: boolean;
  leadId: number | string | null;
  leadName?: string;
  /** Counselor currently holding the lead (shown as "Current"). */
  currentCounselorId?: number | null;
  /** Called after Skip/close, or after a successful forward. */
  onClose: () => void;
  onForwarded?: (counselorName: string) => void;
};

/** Optional caller step after an Interested save. Never changes outcome, course, year or points. */
export function ForwardCounselorModal({ visible, leadId, leadName, currentCounselorId, onClose, onForwarded }: Props) {
  const { token } = useAuth();
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const [counselors, setCounselors] = useState<CounselorOption[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !token) return;
    let active = true;
    setLoading(true); setError(''); setSelected(null);
    counselorApi.directory(token)
      .then(data => { if (active) setCounselors(data.counselors); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load counselors.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, token]);

  const forward = async () => {
    if (!token || leadId == null || selected == null || submitting) return;
    setSubmitting(true); setError('');
    try {
      const result = await counselorApi.forward(token, leadId, selected);
      onForwarded?.(result.assignment.counselor_name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not forward this lead.');
    } finally { setSubmitting(false); }
  };

  const toneColor = (option: CounselorOption) => {
    const tone = availabilityTone(option.availability);
    return tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.muted;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Forward to Counselor</Text>
          <Text style={styles.subtitle}>
            {leadName ? `${leadName} stays your lead. ` : ''}The counselor gets read access and handles counselling.
          </Text>
          {loading ? <ActivityIndicator color={COUNSELOR_TEAL} style={{ marginVertical: 24 }} /> : (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: 10 }}>
              {counselors.length === 0 && !error ? <Text style={styles.empty}>No active counselors are available.</Text> : null}
              {counselors.map(option => {
                const isSelected = selected === option.id;
                const isCurrent = currentCounselorId === option.id;
                return (
                  <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${option.name}, ${option.availability_label}`}
                    onPress={() => setSelected(option.id)}
                    style={({ pressed }) => [styles.row, isSelected && styles.rowSelected, pressed && { opacity: 0.8 }]}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{option.initials}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{option.name}{isCurrent ? '  · Current' : ''}</Text>
                      <View style={styles.metaRow}>
                        <View style={[styles.dot, { backgroundColor: toneColor(option) }]} />
                        <Text style={styles.meta}>{option.availability_label} · {option.active_leads} active</Text>
                      </View>
                    </View>
                    <View style={[styles.radio, isSelected && styles.radioOn]} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={[styles.button, styles.secondary]} onPress={onClose} disabled={submitting}>
              <Text style={styles.secondaryText}>Skip</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Forward"
              style={[styles.button, styles.primary, (selected == null || submitting || selected === currentCounselorId) && styles.disabled]}
              onPress={forward} disabled={selected == null || submitting || selected === currentCounselorId}>
              <Text style={styles.primaryText}>{submitting ? 'Forwarding…' : 'Forward'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: AppColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  title: { fontSize: 20, fontWeight: '800', color: c.text },
  subtitle: { color: c.muted, marginTop: 6, marginBottom: 14, lineHeight: 20 },
  list: { maxHeight: 380 },
  empty: { color: c.muted, textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1,
    borderColor: c.border, backgroundColor: c.surfaceMuted },
  rowSelected: { borderColor: COUNSELOR_TEAL, borderWidth: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COUNSELOR_TEAL, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800' },
  name: { color: c.text, fontWeight: '700', fontSize: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { color: c.muted, fontSize: 13 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.border },
  radioOn: { borderColor: COUNSELOR_TEAL, backgroundColor: COUNSELOR_TEAL },
  error: { color: c.danger, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  button: { flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: c.surfaceMuted },
  secondaryText: { color: c.text, fontWeight: '700' },
  primary: { backgroundColor: COUNSELOR_TEAL },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
