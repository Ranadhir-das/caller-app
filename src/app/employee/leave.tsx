import { useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';
import { ActionButton, DateField, FormInput, isoDate, makeStyles } from '@/components/employee/shared';

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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
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
        {data?.leaves.map(l => (
          <View key={l.id} style={styles.card}>
            <Text style={styles.label}>{l.start_date} to {l.end_date} - {l.status}</Text>
            <Text style={styles.subtitle}>{l.reason}</Text>
            {!!l.review_note && <Text style={styles.subtitle}>{l.review_note}</Text>}
            {l.status === 'PENDING' && <ActionButton title="Cancel request" busy={busy} onPress={() => run(async () => { await request(`leaves/${l.id}/`, undefined, 'DELETE'); })} />}
          </View>
        ))}
        <Text style={styles.heading}>Upcoming holidays</Text>
        {data?.holidays.map(h => <Text key={h.id} style={styles.subtitle}>{h.date} - {h.name}</Text>)}
      </ScrollView>
    </SafeAreaView>
  );
}
