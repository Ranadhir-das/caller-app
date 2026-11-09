import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Platform, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';
import { ActionButton, DateField, FormInput, isoDate, makeStyles } from '@/components/employee/shared';
import { KeyboardAwareContainer } from '@/components/KeyboardAwareContainer';

export default function LeaveScreen() {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { data, refreshing, busy, load, run, request } = useEmployeeWorkspace();
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);
  const [reason, setReason] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareContainer contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
        <Text style={styles.title}>Leave</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Apply for leave</Text>
          <DateField label="Start date" value={start} onPress={() => setOpenPicker('start')} />
          <DateField label="End date" value={end} onPress={() => setOpenPicker('end')} />
          <FormInput label="Reason" value={reason} onChangeText={setReason} multiline />
          <ActionButton title="Submit request" busy={busy} onPress={() => {
            if (!start || !end) { Alert.alert('Leave', 'Please select a start and end date.'); return; }
            void run(async () => {
              await request('leaves/', { start_date: isoDate(start), end_date: isoDate(end), reason });
              setReason(''); setStart(null); setEnd(null);
              Alert.alert('Submitted', 'Your leave request is awaiting approval.');
            });
          }} />
          {openPicker === 'start' && <DateTimePicker themeVariant={mode} value={start || new Date()} mode="date" display={Platform.OS === 'android' ? 'default' : 'spinner'} minimumDate={new Date()} onChange={(_, d) => { setOpenPicker(null); if (d) { setStart(d); if (end && end < d) setEnd(null); } }} />}
          {openPicker === 'end' && <DateTimePicker themeVariant={mode} value={end || start || new Date()} mode="date" display={Platform.OS === 'android' ? 'default' : 'spinner'} minimumDate={start || new Date()} onChange={(_, d) => { setOpenPicker(null); if (d) setEnd(d); }} />}
        </View>
        {data?.leaves && data.leaves.length > 0 && (
          <View style={{ gap: 10, marginTop: 4 }}>
            <Text style={styles.heading}>My Leave Requests</Text>
            {data.leaves.map(l => {
              const isPending = l.status === 'PENDING';
              const isApproved = l.status === 'APPROVED';
              const badgeBg = isPending ? colors.warningSoft : isApproved ? colors.successSoft : colors.dangerSoft;
              const badgeColor = isPending ? colors.warning : isApproved ? (mode === 'dark' ? colors.success : '#047857') : colors.danger;

              return (
                <View key={l.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.label, { fontSize: 15 }]}>{l.start_date} to {l.end_date}</Text>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: badgeBg }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: badgeColor }}>{l.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.subtitle}>{l.reason}</Text>
                  {!!l.review_note && (
                    <View style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted }}>
                      <Text style={[styles.subtitle, { fontStyle: 'italic' }]}>&ldquo;{l.review_note}&rdquo;</Text>
                    </View>
                  )}
                  {l.status === 'PENDING' && (
                    <ActionButton
                      title="Cancel request"
                      busy={busy}
                      onPress={() => run(async () => { await request(`leaves/${l.id}/`, undefined, 'DELETE'); })}
                    />
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={styles.heading}>Upcoming Holidays</Text>
          {data?.holidays && data.holidays.length > 0 ? (
            <View style={styles.card}>
              {data.holidays.map((h, i) => (
                <View
                  key={h.id}
                  style={[
                    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 16 }}>🌴</Text>
                    <Text style={[styles.label, { fontWeight: '600' }]}>{h.name}</Text>
                  </View>
                  <View style={{ backgroundColor: colors.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{h.date}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.subtitle}>No upcoming holidays scheduled.</Text>
          )}
        </View>
      </KeyboardAwareContainer>
    </SafeAreaView>
  );
}
