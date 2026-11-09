import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { AttendanceRequestModal } from '@/components/AttendanceRequestModal';

type SubTab = 'records' | 'requests' | 'photos';

function formatTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '—';
  }
}

function formatDateLong(dateStr?: string | null): string {
  if (!dateStr) return 'Today';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      const date = new Date(y, m - 1, d);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr || 'Today';
  }
}

function calculateShiftDuration(inStr?: string | null, outStr?: string | null): string {
  if (!inStr) return '—';
  const start = new Date(inStr).getTime();
  if (isNaN(start)) return '—';
  const end = outStr ? new Date(outStr).getTime() : Date.now();
  if (isNaN(end) || end < start) return '—';
  const diffMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function AttendanceScreen() {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const { data, refreshing, busy, load, photo, cancelAttendanceRequest } = useEmployeeWorkspace();

  const [activeTab, setActiveTab] = useState<SubTab>('records');
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const todayDate = data?.date || new Date().toISOString().slice(0, 10);
  const todayRecord = useMemo(() => {
    return data?.attendance?.find((a) => a.date === todayDate);
  }, [data?.attendance, todayDate]);

  const isCheckedIn = !!todayRecord?.checked_in;
  const isCheckedOut = !!todayRecord?.checked_out;
  const isEnrolled = !!data?.enrolled;

  const requests = data?.attendance_requests || [];
  const attendanceList = data?.attendance || [];
  const photoRequests = data?.photo_requests || [];

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Attendance</Text>
            <Text style={styles.pageSubtitle}>{formatDateLong(todayDate)}</Text>
          </View>
          <View
            style={[
              styles.enrollmentBadge,
              {
                backgroundColor: isEnrolled ? colors.successSoft : colors.warningSoft,
                borderColor: isEnrolled ? colors.success : colors.warning,
              },
            ]}
          >
            <Text
              style={[
                styles.enrollmentBadgeText,
                { color: isEnrolled ? (mode === 'dark' ? colors.success : '#047857') : colors.warning },
              ]}
            >
              {isEnrolled ? '✓ Face ID Enrolled' : '⚠️ Not Enrolled'}
            </Text>
          </View>
        </View>

        {/* ================= 1. TODAY'S SHIFT STATUS CARD ================= */}
        <View style={styles.todayCard}>
          <View style={styles.todayCardHeader}>
            <View style={{ gap: 2 }}>
              <Text style={styles.todayLabel}>TODAY'S SHIFT</Text>
              <Text style={styles.todayDateText}>{todayDate}</Text>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isCheckedOut
                    ? colors.successSoft
                    : isCheckedIn
                    ? colors.accentSoft
                    : colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color: isCheckedOut
                      ? (mode === 'dark' ? colors.success : '#047857')
                      : isCheckedIn
                      ? colors.primary
                      : colors.muted,
                  },
                ]}
              >
                {isCheckedOut ? '● Shift Completed' : isCheckedIn ? '● In Shift (Active)' : '○ Not Checked In'}
              </Text>
            </View>
          </View>

          {/* Time Columns Grid */}
          <View style={styles.timeGrid}>
            <View style={styles.timeCol}>
              <Text style={styles.timeColLabel}>IN TIME</Text>
              <Text style={styles.timeColValue}>{formatTime(todayRecord?.checked_in)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeCol}>
              <Text style={styles.timeColLabel}>OUT TIME</Text>
              <Text style={styles.timeColValue}>{formatTime(todayRecord?.checked_out)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeCol}>
              <Text style={styles.timeColLabel}>DURATION</Text>
              <Text
                style={[
                  styles.timeColValue,
                  isCheckedIn && !isCheckedOut && { color: colors.primary, fontWeight: '800' },
                ]}
              >
                {calculateShiftDuration(todayRecord?.checked_in, todayRecord?.checked_out)}
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            {!isEnrolled ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => photo('ENROLL')}
                style={[styles.primaryPunchBtn, busy && { opacity: 0.6 }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <>
                    <Text style={styles.punchBtnIcon}>📸</Text>
                    <Text style={styles.punchBtnText}>Capture Enrollment Photo</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => photo('IN')}
                  style={[
                    styles.punchInBtn,
                    isCheckedIn && !isCheckedOut && styles.punchBtnDone,
                    busy && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.punchBtnIcon}>📥</Text>
                  <Text style={[styles.punchInText, isCheckedIn && !isCheckedOut && { color: colors.muted }]}>
                    {isCheckedIn ? 'Checked In' : 'Photo Check-in'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => photo('OUT')}
                  style={[
                    styles.punchOutBtn,
                    isCheckedOut && styles.punchBtnDone,
                    busy && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.punchBtnIcon}>📤</Text>
                  <Text style={[styles.punchOutText, isCheckedOut && { color: colors.muted }]}>
                    {isCheckedOut ? 'Checked Out' : 'Photo Check-out'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <Text style={styles.guidanceNotice}>
            💡 Photos are private and verified automatically with AI face recognition.
          </Text>
        </View>

        {/* ================= 2. ATTENDANCE METRICS STRIP ================= */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricNumber}>{attendanceList.length}</Text>
            <Text style={styles.metricLabel}>Total Days</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricNumber, { color: mode === 'dark' ? colors.success : '#047857' }]}>
              {attendanceList.filter((a) => !!a.checked_out).length}
            </Text>
            <Text style={styles.metricLabel}>Completed</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricNumber, { color: colors.warning }]}>
              {requests.filter((r) => r.status === 'PENDING').length}
            </Text>
            <Text style={styles.metricLabel}>Pending Req</Text>
          </View>
        </View>

        {/* ================= 3. SECTION SEGMENT TABS ================= */}
        <View style={styles.segmentedContainer}>
          <Pressable
            accessibilityRole="tab"
            style={[styles.segmentBtn, activeTab === 'records' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('records')}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === 'records' ? styles.segmentBtnTextActive : { color: colors.muted },
              ]}
            >
              📅 Records ({attendanceList.length})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            style={[styles.segmentBtn, activeTab === 'requests' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('requests')}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === 'requests' ? styles.segmentBtnTextActive : { color: colors.muted },
              ]}
            >
              ⏰ Requests ({requests.length})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            style={[styles.segmentBtn, activeTab === 'photos' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('photos')}
          >
            <Text
              style={[
                styles.segmentBtnText,
                activeTab === 'photos' ? styles.segmentBtnTextActive : { color: colors.muted },
              ]}
            >
              📸 Photos ({photoRequests.length})
            </Text>
          </Pressable>
        </View>

        {/* ================= TAB 1: ATTENDANCE RECORDS ================= */}
        {activeTab === 'records' && (
          <View style={{ gap: 10 }}>
            {attendanceList.length > 0 ? (
              attendanceList.map((r) => {
                const isComplete = !!r.checked_out;
                const isInProgress = !!r.checked_in && !r.checked_out;
                const duration = calculateShiftDuration(r.checked_in, r.checked_out);

                return (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ gap: 2 }}>
                        <Text style={styles.cardDateTitle}>{formatDateLong(r.date)}</Text>
                        <Text style={styles.cardDateSub}>{r.date}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isComplete
                              ? colors.successSoft
                              : isInProgress
                              ? colors.accentSoft
                              : colors.surfaceMuted,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: isComplete
                                ? (mode === 'dark' ? colors.success : '#047857')
                                : isInProgress
                                ? colors.primary
                                : colors.muted,
                            },
                          ]}
                        >
                          {isComplete ? 'Completed' : isInProgress ? 'In Shift' : 'Pending'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.recordTimeRow}>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeBlockLabel}>IN TIME</Text>
                        <Text style={styles.timeBlockValue}>{formatTime(r.checked_in)}</Text>
                      </View>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeBlockLabel}>OUT TIME</Text>
                        <Text style={styles.timeBlockValue}>{formatTime(r.checked_out)}</Text>
                      </View>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeBlockLabel}>TOTAL HOURS</Text>
                        <Text style={[styles.timeBlockValue, { color: colors.primary, fontWeight: '700' }]}>
                          {duration}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📅</Text>
                <Text style={styles.emptyTitle}>No Attendance Records</Text>
                <Text style={styles.emptySubtitle}>
                  Mark your photo check-in today to start building your attendance record history.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 2: SHIFT & ATTENDANCE REQUESTS ================= */}
        {activeTab === 'requests' && (
          <View style={{ gap: 12 }}>
            <View style={styles.requestsActionBar}>
              <Text style={styles.sectionHeading}>Late & Early Requests</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.newRequestBtn}
                onPress={() => setRequestModalVisible(true)}
              >
                <Text style={styles.newRequestBtnText}>+ New Request</Text>
              </Pressable>
            </View>

            {requests.length > 0 ? (
              requests.map((cr) => {
                const isLate = cr.request_type === 'LATE_ARRIVAL';
                const isPending = cr.status === 'PENDING';
                const isApproved = cr.status === 'APPROVED';

                const badgeBg = isPending
                  ? colors.warningSoft
                  : isApproved
                  ? colors.successSoft
                  : colors.dangerSoft;
                const badgeColor = isPending
                  ? colors.warning
                  : isApproved
                  ? (mode === 'dark' ? colors.success : '#047857')
                  : colors.danger;

                const typeBg = isLate ? colors.warningSoft : colors.accentSoft;
                const typeBorder = isLate ? colors.warning : colors.primary;
                const typeColor = isLate
                  ? colors.warning
                  : mode === 'dark'
                  ? colors.wavePurple
                  : '#6B21A8';

                return (
                  <View key={cr.id} style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <View style={[styles.typeBadge, { backgroundColor: typeBg, borderColor: typeBorder }]}>
                        <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                          {isLate ? '⏰ ' : '🚪 '}
                          {cr.request_type_display}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
                          {cr.status_display}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.requestDate}>
                      For date: <Text style={{ fontWeight: '700', color: colors.text }}>{cr.date}</Text>
                    </Text>

                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonText}>{cr.reason}</Text>
                    </View>

                    {!!cr.reviewed_by_name && (
                      <View style={styles.reviewBox}>
                        <Text style={styles.reviewMetaText}>
                          Reviewed by <Text style={{ fontWeight: '600', color: colors.text }}>{cr.reviewed_by_name}</Text>
                          {cr.reviewed_at ? ` on ${new Date(cr.reviewed_at).toLocaleDateString()}` : ''}
                        </Text>
                        {!!cr.review_notes && (
                          <Text style={styles.reviewNotesText}>
                            &ldquo;{cr.review_notes}&rdquo;
                          </Text>
                        )}
                      </View>
                    )}

                    {isPending && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={cancellingId === cr.id}
                        style={styles.cancelLink}
                        onPress={() => handleCancelRequest(cr)}
                      >
                        <Text style={styles.cancelLinkText}>
                          {cancellingId === cr.id ? 'Cancelling...' : 'Cancel this request'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>⏰</Text>
                <Text style={styles.emptyTitle}>No Shift Requests</Text>
                <Text style={styles.emptySubtitle}>
                  Submit a request in advance if you anticipate arriving late or departing early.
                </Text>
                <Pressable
                  style={[styles.newRequestBtn, { marginTop: 12 }]}
                  onPress={() => setRequestModalVisible(true)}
                >
                  <Text style={styles.newRequestBtnText}>+ Create Request</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 3: PHOTO VERIFICATION LOGS ================= */}
        {activeTab === 'photos' && (
          <View style={{ gap: 10 }}>
            {photoRequests.length > 0 ? (
              photoRequests.map((r) => {
                const isApproved = r.status.toUpperCase() === 'APPROVED';
                const isPending = r.status.toUpperCase() === 'PENDING';
                const badgeBg = isApproved
                  ? colors.successSoft
                  : isPending
                  ? colors.warningSoft
                  : colors.dangerSoft;
                const badgeColor = isApproved
                  ? (mode === 'dark' ? colors.success : '#047857')
                  : isPending
                  ? colors.warning
                  : colors.danger;

                const actionIcon = r.action === 'ENROLL' ? '👤' : r.action === 'IN' ? '📥' : '📤';

                return (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 18 }}>{actionIcon}</Text>
                        <Text style={styles.photoActionTitle}>
                          {r.action === 'ENROLL'
                            ? 'Face Enrollment'
                            : r.action === 'IN'
                            ? 'Check-In Verification'
                            : 'Check-Out Verification'}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
                          {r.status}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.photoTimestamp}>
                      {new Date(r.created_at).toLocaleString()}
                    </Text>

                    {!!r.review_note && (
                      <View style={styles.photoReviewBox}>
                        <Text style={styles.photoReviewNote}>{r.review_note}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📸</Text>
                <Text style={styles.emptyTitle}>No Photo Logs</Text>
                <Text style={styles.emptySubtitle}>
                  Photo captures submitted during check-in, check-out, or enrollment will appear here.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <AttendanceRequestModal
        visible={requestModalVisible}
        onClose={() => setRequestModalVisible(false)}
        onSuccess={load}
      />
    </SafeAreaView>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: 16,
      gap: 14,
      paddingBottom: 110,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    pageTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    pageSubtitle: {
      fontSize: 13,
      color: c.muted,
      marginTop: 2,
    },
    enrollmentBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
    },
    enrollmentBadgeText: {
      fontSize: 11.5,
      fontWeight: '700',
    },
    todayCard: {
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    todayCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    todayLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: c.muted,
      letterSpacing: 0.8,
    },
    todayDateText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
    },
    statusPillText: {
      fontSize: 11.5,
      fontWeight: '700',
    },
    timeGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 8,
    },
    timeCol: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    timeColLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: c.muted,
      letterSpacing: 0.5,
    },
    timeColValue: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    timeDivider: {
      width: 1,
      height: 26,
      backgroundColor: c.border,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    primaryPunchBtn: {
      flex: 1,
      backgroundColor: c.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      minHeight: 48,
    },
    punchInBtn: {
      flex: 1,
      backgroundColor: c.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 13,
      borderRadius: 12,
      minHeight: 48,
    },
    punchOutBtn: {
      flex: 1,
      backgroundColor: c.orangeSoft,
      borderWidth: 1,
      borderColor: c.orange,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 13,
      borderRadius: 12,
      minHeight: 48,
    },
    punchBtnDone: {
      opacity: 0.65,
    },
    punchBtnIcon: {
      fontSize: 16,
    },
    punchBtnText: {
      color: c.onPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    punchInText: {
      color: c.onPrimary,
      fontWeight: '700',
      fontSize: 13.5,
    },
    punchOutText: {
      color: c.orange,
      fontWeight: '700',
      fontSize: 13.5,
    },
    guidanceNotice: {
      fontSize: 11.5,
      color: c.muted,
      textAlign: 'center',
      lineHeight: 16,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metricCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 2,
    },
    metricNumber: {
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
    },
    metricLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.muted,
    },
    segmentedContainer: {
      flexDirection: 'row',
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      padding: 4,
      gap: 4,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    segmentBtnActive: {
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    segmentBtnText: {
      fontSize: 11.5,
      fontWeight: '600',
    },
    segmentBtnTextActive: {
      color: c.primary,
      fontWeight: '700',
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardDateTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    cardDateSub: {
      fontSize: 11.5,
      color: c.muted,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    recordTimeRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    timeBlock: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
      padding: 8,
      borderRadius: 10,
      gap: 2,
    },
    timeBlockLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: c.muted,
      letterSpacing: 0.4,
    },
    timeBlockValue: {
      fontSize: 12.5,
      fontWeight: '600',
      color: c.text,
    },
    requestsActionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    newRequestBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    newRequestBtnText: {
      color: c.onPrimary,
      fontSize: 12,
      fontWeight: '700',
    },
    typeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
    },
    typeBadgeText: {
      fontSize: 11.5,
      fontWeight: '700',
    },
    requestDate: {
      fontSize: 12.5,
      color: c.muted,
    },
    reasonBox: {
      backgroundColor: c.surfaceMuted,
      padding: 10,
      borderRadius: 10,
    },
    reasonText: {
      fontSize: 13,
      color: c.text,
      lineHeight: 18,
    },
    reviewBox: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      gap: 3,
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
      paddingVertical: 4,
    },
    cancelLinkText: {
      fontSize: 12,
      fontWeight: '600',
      color: c.danger,
    },
    photoActionTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: c.text,
    },
    photoTimestamp: {
      fontSize: 12,
      color: c.muted,
    },
    photoReviewBox: {
      backgroundColor: c.surfaceMuted,
      padding: 8,
      borderRadius: 8,
    },
    photoReviewNote: {
      fontSize: 12,
      color: c.secondary,
    },
    emptyCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 36,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    emptyIcon: {
      fontSize: 32,
      marginBottom: 2,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    emptySubtitle: {
      fontSize: 12.5,
      color: c.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
