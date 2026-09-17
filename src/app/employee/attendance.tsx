import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';
import { ActionButton, makeStyles } from '@/components/employee/shared';

export default function AttendanceScreen() {
  const { colors } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { data, refreshing, busy, load, photo } = useEmployeeWorkspace();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
        <Text style={styles.title}>Attendance</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Live-photo attendance</Text>
          <Text style={styles.subtitle}>Use your camera in good light with your face clearly visible. Photos are private and reviewed by management.</Text>
          {!data?.enrolled
            ? <ActionButton title="Capture enrollment photo" busy={busy} onPress={() => photo('ENROLL')} />
            : <View style={styles.row}>
                <ActionButton title="Photo check-in" busy={busy} onPress={() => photo('IN')} />
                <ActionButton title="Photo check-out" busy={busy} onPress={() => photo('OUT')} />
              </View>}
          <Text style={styles.subtitle}>Enrollment must be approved before check-in. Photo submission does not immediately mark attendance.</Text>
        </View>
        {data?.photo_requests?.map(r => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.label}>{r.action} - {r.status}</Text>
            <Text style={styles.subtitle}>{new Date(r.created_at).toLocaleString()}</Text>
            {!!r.review_note && <Text style={styles.subtitle}>{r.review_note}</Text>}
          </View>
        ))}
        <Text style={styles.heading}>My attendance</Text>
        {data?.attendance.map(r => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.label}>{r.date}</Text>
            <Text style={styles.subtitle}>In: {r.checked_in ? new Date(r.checked_in).toLocaleString() : 'Not checked in'}</Text>
            <Text style={styles.subtitle}>Out: {r.checked_out ? new Date(r.checked_out).toLocaleString() : 'Not checked out'}</Text>
          </View>
        ))}
        {!data?.attendance.length && <Text style={styles.subtitle}>No attendance records yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
