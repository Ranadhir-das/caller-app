import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { useEmployeeWorkspace, type AttendanceRequestItem } from '@/context/EmployeeWorkspaceContext';
import { ActionButton, makeStyles } from '@/components/employee/shared';
import { AttendanceRequestModal } from '@/components/AttendanceRequestModal';

export default function AttendanceScreen() {
  const { colors } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const extraStyles = useAppStyles(createExtraStyles);
  const { data, refreshing, busy, load, photo, cancelAttendanceRequest } = useEmployeeWorkspace();

  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const handleCancelRequest = (req: AttendanceRequestItem) => {
    Alert.alert(
      'Cancel Request',
      `Are you sure you want to cancel your ${req.request_type_display} for ${req.date}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(req.id);
            try {
              await cancelAttendanceRequest(req.id);
              Alert.alert('Request Cancelled', 'Your request has been cancelled.');
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to cancel request.');
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };

  const requests = data?.attendance_requests || [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>Attendance</Text>

        {/* Live-photo attendance */}
        <View style={styles.card}>
          <Text style={styles.heading}>Live-photo attendance</Text>
          <Text style={styles.subtitle}>
            Use your camera in good light with your face clearly visible. Photos are private and reviewed by management.
          </Text>
          {!data?.enrolled ? (
            <ActionButton title="Capture enrollment photo" busy={busy} onPress={() => photo('ENROLL')} />
          ) : (
            <View style={styles.row}>
              <ActionButton title="Photo check-in" busy={busy} onPress={() => photo('IN')} />
              <ActionButton title="Photo check-out" busy={busy} onPress={() => photo('OUT')} />
            </View>
          )}
          <Text style={styles.subtitle}>
            Enrollment must be approved before check-in. Photo submission does not immediately mark attendance.
          </Text>
        </View>

        {data?.photo_requests?.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.label}>
              {r.action} - {r.status}
            </Text>
            <Text style={styles.subtitle}>{new Date(r.created_at).toLocaleString()}</Text>
            {!!r.review_note && <Text style={styles.subtitle}>{r.review_note}</Text>}
          </View>
        ))}

        {/* Shift & Attendance Requests */}
        <View style={extraStyles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Shift &amp; Attendance Requests</Text>
            <Text style={styles.subtitle}>
              Submit requests for late arrival or leaving shift early.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={[extraStyles.newRequestButton, { backgroundColor: colors.accent }]}
            onPress={() => setRequestModalVisible(true)}
          >
            <Text style={extraStyles.newRequestButtonText}>+ New Request</Text>
          </Pressable>
        </View>

        {requests.length > 0 ? (
          requests.map((cr) => {
            const isLate = cr.request_type === 'LATE_ARRIVAL';
            const isPending = cr.status === 'PENDING';
            const isApproved = cr.status === 'APPROVED';

            const badgeBg = isPending
              ? 'rgba(245, 158, 11, 0.15)'
              : isApproved
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(239, 68, 68, 0.15)';
            const badgeColor = isPending
              ? '#f59e0b'
              : isApproved
              ? '#22c55e'
              : '#ef4444';

            return (
              <View key={cr.id} style={styles.card}>
                <View style={extraStyles.cardTopRow}>
                  <View
                    style={[
                      extraStyles.typeBadge,
                      {
                        backgroundColor: isLate
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(168, 85, 247, 0.15)',
                        borderColor: isLate
                          ? 'rgba(245, 158, 11, 0.3)'
                          : 'rgba(168, 85, 247, 0.3)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        extraStyles.typeBadgeText,
                        { color: isLate ? '#f59e0b' : '#c084fc' },
                      ]}
                    >
                      {isLate ? '⏰ ' : '🚪 '}
                      {cr.request_type_display}
                    </Text>
                  </View>

                  <View style={[extraStyles.statusBadge, { backgroundColor: badgeBg }]}>
                    <Text style={[extraStyles.statusBadgeText, { color: badgeColor }]}>
                      {cr.status_display}
                    </Text>
                  </View>
                </View>

                <Text style={extraStyles.requestDateText}>
                  Date: <Text style={{ fontWeight: '700', color: colors.text }}>{cr.date}</Text>
                </Text>

                <Text style={extraStyles.reasonText}>{cr.reason}</Text>

                {!!cr.reviewed_by_name && (
                  <View style={[extraStyles.reviewBox, { borderColor: colors.border }]}>
                    <Text style={extraStyles.reviewMetaText}>
                      Reviewed by: <Text style={{ fontWeight: '600' }}>{cr.reviewed_by_name}</Text>
                      {cr.reviewed_at ? ` on ${new Date(cr.reviewed_at).toLocaleDateString()}` : ''}
                    </Text>
                    {!!cr.review_notes && (
                      <Text style={extraStyles.reviewNotesText}>
                        &ldquo;{cr.review_notes}&rdquo;
                      </Text>
                    )}
                  </View>
                )}

                {isPending && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={cancellingId === cr.id}
                    style={extraStyles.cancelLink}
                    onPress={() => handleCancelRequest(cr)}
                  >
                    <Text style={[extraStyles.cancelLinkText, { color: colors.danger }]}>
                      {cancellingId === cr.id ? 'Cancelling...' : 'Cancel Request'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        ) : (
          <Text style={styles.subtitle}>No attendance requests submitted yet.</Text>
        )}

        {/* My attendance records */}
        <Text style={[styles.heading, { marginTop: 10 }]}>My attendance</Text>
        {data?.attendance?.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.label}>{r.date}</Text>
            <Text style={styles.subtitle}>
              In: {r.checked_in ? new Date(r.checked_in).toLocaleString() : 'Not checked in'}
            </Text>
            <Text style={styles.subtitle}>
              Out: {r.checked_out ? new Date(r.checked_out).toLocaleString() : 'Not checked out'}
            </Text>
          </View>
        ))}
        {!data?.attendance?.length && <Text style={styles.subtitle}>No attendance records yet.</Text>}
      </ScrollView>

      <AttendanceRequestModal
        visible={requestModalVisible}
        onClose={() => setRequestModalVisible(false)}
        onSuccess={load}
      />
    </SafeAreaView>
  );
}

const createExtraStyles = (c: AppColors) =>
  StyleSheet.create({
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 8,
    },
    newRequestButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    newRequestButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    typeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
    },
    typeBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    requestDateText: {
      fontSize: 13,
      color: c.muted,
    },
    reasonText: {
      fontSize: 13,
      lineHeight: 18,
      color: c.text,
    },
    reviewBox: {
      marginTop: 4,
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      backgroundColor: c.background,
      gap: 2,
    },
    reviewMetaText: {
      fontSize: 11,
      color: c.muted,
    },
    reviewNotesText: {
      fontSize: 12,
      color: c.text,
      fontStyle: 'italic',
    },
    cancelLink: {
      alignSelf: 'flex-start',
      marginTop: 4,
      paddingVertical: 4,
    },
    cancelLinkText: {
      fontSize: 12,
      fontWeight: '600',
    },
  });
