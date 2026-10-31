import React, { useCallback, useEffect, useState } from 'react';
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
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme, useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  formatDuration,
  useActivity,
} from '@/context/ActivityContext';
import {
  activityApi,
  type ActivityHistoryResponse,
  type HistoryFilterParams,
  type HistorySessionItem,
  type HistoryTimelineEvent,
} from '@/services/activity';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import {
  EndShiftModal,
  PauseModal,
  SwitchCategoryModal,
} from '@/components/ActivityActionModals';
import { AttendanceRequestModal } from '@/components/AttendanceRequestModal';
import { openLocationSettings } from '@/services/location';

type PresetType = 'today' | 'yesterday' | 'last_7_days' | 'this_month';

function formatSessionDate(dateStr?: string | null): string {
  if (!dateStr) return 'Unknown Date';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return String(dateStr);
}

function formatEventTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}


export default function ActivityScreen() {
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const { token, user } = useAuth();

  const {
    session,
    currentSegment,
    currentBreak,
    hasActiveSession,
    categories,
    breakReasons,
    loading: sessionLoading,
    refreshing: sessionRefreshing,
    mutating,
    elapsedGross,
    elapsedBreak,
    elapsedNet,
    breakElapsed,
    breakWarningExceeded,
    refreshCurrent,
    startShift,
    pause,
    resume,
    switchCategory,
    endShift,
  } = useActivity();

  // History state
  const [activePreset, setActivePreset] = useState<PresetType>('today');
  const [historyData, setHistoryData] = useState<ActivityHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Expanded session IDs for timeline view
  const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({});

  // Modals
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [endShiftModalOpen, setEndShiftModalOpen] = useState(false);
  const [earlyEndModalOpen, setEarlyEndModalOpen] = useState(false);

  // Load history data
  const loadHistory = useCallback(
    async (preset: PresetType) => {
      if (!token) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await activityApi.getActivityHistory(token, { preset });
        setHistoryData(res);
        // By default expand first session
        if (res?.sessions && Array.isArray(res.sessions) && res.sessions.length > 0) {
          setExpandedSessions((prev) => ({
            ...prev,
            [res.sessions[0].id]: true,
          }));
        }
      } catch (e: unknown) {
        setHistoryError(
          e instanceof Error ? e.message : 'Could not load activity history.'
        );
      } finally {
        setHistoryLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadHistory(activePreset);
  }, [activePreset, loadHistory]);

  useFocusEffect(
    useCallback(() => {
      void refreshCurrent();
      void loadHistory(activePreset);
    }, [refreshCurrent, loadHistory, activePreset])
  );

  const onPullToRefresh = async () => {
    await Promise.all([refreshCurrent(), loadHistory(activePreset)]);
  };

  const toggleSessionExpanded = (sessionId: number) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId],
    }));
  };

  const handleStartShift = async () => {
    try {
      await startShift();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start shift. Please try again.';
      const isGpsError =
        errorMsg.includes('GPS accuracy') ||
        errorMsg.includes('POOR_GPS_ACCURACY') ||
        errorMsg.includes('geofence') ||
        errorMsg.includes('GEOFENCE_VIOLATION') ||
        errorMsg.includes('Device location services') ||
        errorMsg.includes('Precise location') ||
        errorMsg.includes('MISSING_GPS_READING');

      if (isGpsError) {
        Alert.alert('Location Verification', errorMsg, [
          { text: 'Settings', onPress: () => void openLocationSettings() },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Start Shift Failed', errorMsg);
      }
    }
  };

  const handleResume = async () => {
    try {
      await resume();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to resume work. Please try again.';
      const isGpsError =
        errorMsg.includes('GPS accuracy') ||
        errorMsg.includes('POOR_GPS_ACCURACY') ||
        errorMsg.includes('geofence') ||
        errorMsg.includes('GEOFENCE_VIOLATION') ||
        errorMsg.includes('Device location services') ||
        errorMsg.includes('Precise location') ||
        errorMsg.includes('MISSING_GPS_READING') ||
        errorMsg.includes('MISSING_TIMESTAMP') ||
        errorMsg.includes('STALE_GPS_READING') ||
        errorMsg.includes('office');

      if (isGpsError) {
        Alert.alert('Location Verification', errorMsg, [
          { text: 'Settings', onPress: () => void openLocationSettings() },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Resume Failed', errorMsg);
      }
    }
  };

  const handleEndShift = async (note?: string) => {
    try {
      const res = await endShift(note);
      Alert.alert(
        'Shift Completed',
        `Great job today! Total net work time: ${formatDuration(
          res.session.net_seconds
        )}.`
      );
      void loadHistory(activePreset);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Could not complete shift.';
      const isGpsError =
        errorMsg.includes('GPS accuracy') ||
        errorMsg.includes('POOR_GPS_ACCURACY') ||
        errorMsg.includes('geofence') ||
        errorMsg.includes('GEOFENCE_VIOLATION') ||
        errorMsg.includes('Device location services') ||
        errorMsg.includes('Precise location') ||
        errorMsg.includes('MISSING_GPS_READING') ||
        errorMsg.includes('MISSING_TIMESTAMP') ||
        errorMsg.includes('STALE_GPS_READING') ||
        errorMsg.includes('office');

      if (isGpsError) {
        Alert.alert('Location Verification', errorMsg, [
          { text: 'Settings', onPress: () => void openLocationSettings() },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('End Shift Blocked', errorMsg);
      }
    }
  };

  const isPaused = session?.status === 'PAUSED';

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        <AnimatedBackButton />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pageTitle}>Work Activity & Sessions</Text>
          <Text style={styles.pageSubtitle}>Daily tracking & shift history</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={sessionRefreshing || historyLoading}
            onRefresh={onPullToRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* ======================================================== */}
        {/* SECTION 1: LIVE ACTIVE WORK SESSION */}
        {/* ======================================================== */}
        <Text style={styles.sectionHeading}>Current Shift</Text>

        {sessionLoading ? (
          <View style={styles.card}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : hasActiveSession && session ? (
          <View
            style={[
              styles.card,
              {
                borderColor: isPaused
                  ? breakWarningExceeded
                    ? colors.danger
                    : '#EAB308'
                  : colors.accent,
                borderWidth: 1.5,
              },
            ]}
          >
            {/* Header row: Status pill + Category */}
            <View style={styles.sessionHeaderRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowAlign}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: isPaused
                          ? breakWarningExceeded
                            ? '#FEE2E2'
                            : '#FEF9C3'
                          : colors.accentSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color: isPaused
                            ? breakWarningExceeded
                              ? colors.danger
                              : '#854D0E'
                            : colors.accent,
                        },
                      ]}
                    >
                      {isPaused ? 'PAUSED ON BREAK' : 'ACTIVE WORK SESSION'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.currentCategoryTitle}>
                  {isPaused
                    ? `Break: ${currentBreak?.reason?.name || 'Break'}`
                    : currentSegment?.category?.name || 'Work Activity'}
                </Text>
              </View>

              <View style={styles.mainTimerBox}>
                <Text style={styles.timerSubtitle}>
                  {isPaused ? 'BREAK DURATION' : 'NET WORK TIME'}
                </Text>
                <Text
                  style={[
                    styles.largeTimer,
                    isPaused
                      ? { color: breakWarningExceeded ? colors.danger : '#EAB308' }
                      : { color: colors.accent },
                  ]}
                >
                  {formatDuration(isPaused ? breakElapsed : elapsedNet)}
                </Text>
              </View>
            </View>

            {/* Warning alert if break threshold exceeded */}
            {isPaused && breakWarningExceeded && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ This break has exceeded the expected limit ({currentBreak?.warning_threshold_minutes} min).
                </Text>
              </View>
            )}

            {/* Duration metrics breakdown */}
            <View style={styles.durationBreakdownRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Net Work</Text>
                <Text style={[styles.metricValue, { color: colors.accent }]}>
                  {formatDuration(elapsedNet)}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Break Time</Text>
                <Text style={styles.metricValue}>{formatDuration(elapsedBreak)}</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Total Gross</Text>
                <Text style={styles.metricValue}>{formatDuration(elapsedGross)}</Text>
              </View>
            </View>

            {/* Control Buttons */}
            <View style={styles.controlButtonsRow}>
              {isPaused ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={mutating}
                  style={[styles.primaryBtn, mutating && { opacity: 0.6 }]}
                  onPress={handleResume}
                >
                  <Text style={styles.primaryBtnText}>▶ Resume Work</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={mutating}
                  style={[styles.secondaryBtn, mutating && { opacity: 0.6 }]}
                  onPress={() => setPauseModalOpen(true)}
                >
                  <Text style={styles.secondaryBtnText}>☕ Take Break</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={mutating}
                style={[styles.secondaryBtn, mutating && { opacity: 0.6 }]}
                onPress={() => setSwitchModalOpen(true)}
              >
                <Text style={styles.secondaryBtnText}>🔄 Switch</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={mutating}
                style={[styles.dangerBtn, mutating && { opacity: 0.6 }]}
                onPress={() => setEndShiftModalOpen(true)}
              >
                <Text style={styles.dangerBtnText}>End Shift</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            {user?.shift_workflow_enabled ? (
              <>
                <Text style={styles.cardHeading}>No Active Shift</Text>
                <Text style={styles.cardSubtitle}>
                  You are signed in. When you are ready to begin your workday, explicitly start your shift below.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={mutating}
                  style={[styles.primaryBtn, { marginTop: 10 }, mutating && { opacity: 0.6 }]}
                  onPress={handleStartShift}
                >
                  {mutating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Start Shift</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardHeading}>No Active Shift</Text>
                <Text style={styles.cardSubtitle}>
                  Work tracking starts automatically when you complete photo attendance check-in.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.primaryBtn, { marginTop: 10 }]}
                  onPress={() => router.push('/employee/attendance' as never)}
                >
                  <Text style={styles.primaryBtnText}>Go to Attendance Check-In</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ======================================================== */}
        {/* SECTION 2: HISTORY FILTERS & AGGREGATES */}
        {/* ======================================================== */}
        <Text style={[styles.sectionHeading, { marginTop: 14 }]}>Activity History</Text>

        {/* Filter Pills */}
        <View style={styles.filterPillsRow}>
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['last_7_days', 'Last 7 Days'],
              ['this_month', 'This Month'],
            ] as const
          ).map(([key, label]) => {
            const isSelected = activePreset === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.filterPill,
                  isSelected && {
                    backgroundColor: colors.accent,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => setActivePreset(key)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && { color: '#FFFFFF', fontWeight: '700' },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Summary Card for Selected Filter */}
        {historyData?.summary && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardHeading}>Period Summary</Text>
              <Text style={styles.cardBadge}>
                {historyData.summary.total_sessions} session
                {historyData.summary.total_sessions === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={styles.durationBreakdownRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Total Net</Text>
                <Text style={[styles.metricValue, { color: colors.accent }]}>
                  {formatDuration(historyData.summary.total_net_seconds)}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Total Breaks</Text>
                <Text style={styles.metricValue}>
                  {formatDuration(historyData.summary.total_break_seconds)}
                </Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Total Gross</Text>
                <Text style={styles.metricValue}>
                  {formatDuration(historyData.summary.total_gross_seconds)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Performance Points Card (Clearly Isolated) */}
        {historyData?.performance_points && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View points breakup"
            onPress={() => router.push('/points-breakup' as never)}
            style={[
              styles.card,
              { backgroundColor: colors.accentSoft, borderColor: colors.accent + '44' },
            ]}
          >
            <View style={styles.rowBetween}>
              <View style={styles.rowAlign}>
                <Text style={{ fontSize: 18 }}>🏆</Text>
                <Text style={[styles.cardHeading, { color: colors.accent }]}>
                  Performance Points
                </Text>
              </View>
              <Text style={styles.pointsBadgeValue}>
                {historyData.performance_points.total_points} pts
              </Text>
            </View>
            <Text style={styles.pointsDisclaimer}>
              {historyData.performance_points.note}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>
                View Points Breakup by Work →
              </Text>
            </View>
          </Pressable>
        )}

        {/* ======================================================== */}
        {/* SECTION 3: SESSIONS & TIMELINE LIST */}
        {/* ======================================================== */}
        {historyLoading && !historyData ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : historyError ? (
          <View style={styles.card}>
            <Text style={{ color: colors.danger }}>{historyError}</Text>
          </View>
        ) : !historyData?.sessions || historyData.sessions.length === 0 ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
            <Text style={{ fontSize: 24, marginBottom: 6 }}>📅</Text>
            <Text style={styles.cardHeading}>No recorded sessions</Text>
            <Text style={styles.cardSubtitle}>
              No completed or active work sessions found for this period.
            </Text>
          </View>
        ) : (
          historyData.sessions.map((item) => (
            <SessionHistoryCard
              key={item.id}
              session={item}
              expanded={!!expandedSessions[item.id]}
              onToggle={() => toggleSessionExpanded(item.id)}
            />
          ))
        )}
      </ScrollView>

      {/* Action Modals */}
      <PauseModal
        visible={pauseModalOpen}
        onClose={() => setPauseModalOpen(false)}
        onConfirm={pause}
        breakReasons={breakReasons}
        busy={mutating}
      />

      <SwitchCategoryModal
        visible={switchModalOpen}
        onClose={() => setSwitchModalOpen(false)}
        onConfirm={switchCategory}
        categories={categories}
        currentCategoryId={currentSegment?.category?.id}
        busy={mutating}
      />

      <EndShiftModal
        visible={endShiftModalOpen}
        onClose={() => setEndShiftModalOpen(false)}
        onConfirm={handleEndShift}
        elapsedNet={elapsedNet}
        elapsedBreak={elapsedBreak}
        elapsedGross={elapsedGross}
        busy={mutating}
        onRequestEarlyEnd={() => setEarlyEndModalOpen(true)}
      />

      {earlyEndModalOpen && (
        <AttendanceRequestModal
          visible={earlyEndModalOpen}
          onClose={() => setEarlyEndModalOpen(false)}
          onSuccess={() => {
            void refreshCurrent();
            void loadHistory(activePreset);
          }}
          initialType="EARLY_SHIFT_END"
        />
      )}
    </SafeAreaView>
  );
}

// ==========================================
// SUB-COMPONENT: SESSION HISTORY CARD & TIMELINE
// ==========================================
function SessionHistoryCard({
  session,
  expanded,
  onToggle,
}: {
  session: HistorySessionItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);

  const formattedDate = formatSessionDate(session.date);

  return (
    <View style={styles.historyCard}>
      {/* Header clickable row */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Session for ${formattedDate}`}
        style={styles.historyCardHeader}
        onPress={onToggle}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.rowAlign}>
            <Text style={styles.historyDateTitle}>{formattedDate}</Text>
            <View
              style={[
                styles.statusTag,
                session.status === 'ACTIVE'
                  ? { backgroundColor: colors.accentSoft }
                  : { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <Text
                style={[
                  styles.statusTagText,
                  session.status === 'ACTIVE'
                    ? { color: colors.accent }
                    : { color: colors.muted },
                ]}
              >
                {session.status}
              </Text>
            </View>
          </View>

          <View style={[styles.rowAlign, { marginTop: 4, gap: 12 }]}>
            <Text style={styles.historyDurationSnippet}>
              Net: <Text style={{ color: colors.accent, fontWeight: '700' }}>{formatDuration(session.net_seconds ?? 0)}</Text>
            </Text>
            <Text style={styles.historyDurationSnippet}>
              Break: {formatDuration(session.break_seconds ?? 0)}
            </Text>
            <Text style={styles.historyDurationSnippet}>
              Gross: {formatDuration(session.gross_seconds ?? 0)}
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: 16, color: colors.muted }}>
          {expanded ? '▲' : '▼'}
        </Text>
      </Pressable>

      {/* Expandable Timeline */}
      {expanded && (
        <View style={styles.timelineContainer}>
          <Text style={styles.timelineHeading}>Chronological Timeline</Text>
          {session.timeline && session.timeline.length > 0 ? (
            session.timeline.map((event, idx) => (
              <TimelineItem key={idx} event={event} isLast={idx === session.timeline.length - 1} />
            ))
          ) : (
            <Text style={styles.cardSubtitle}>No timeline events recorded.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function TimelineItem({
  event,
  isLast,
}: {
  event: HistoryTimelineEvent;
  isLast: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);

  const formatTime = formatEventTime;

  let dotColor = colors.accent;
  let title = '';
  let subtitle = '';
  let durationSnippet = '';
  let noteText = '';

  if (event.type === 'SHIFT_START') {
    dotColor = '#10B981';
    title = 'Shift Started';
    subtitle = formatTime(event.timestamp);
  } else if (event.type === 'SEGMENT') {
    dotColor = event.category?.color_hex || colors.accent;
    title = `Segment: ${event.category?.name || 'Work'}`;
    subtitle = `${formatTime(event.started_at)} – ${formatTime(event.ended_at) || 'Present'}`;
    durationSnippet = formatDuration(event.duration_seconds ?? 0);
    noteText = event.note;
  } else if (event.type === 'BREAK') {
    dotColor = event.exceeded ? colors.danger : '#EAB308';
    title = `Break: ${event.reason?.name || 'Break'}`;
    subtitle = `${formatTime(event.started_at)} – ${formatTime(event.ended_at) || 'Present'}`;
    durationSnippet = formatDuration(event.duration_seconds ?? 0);
    if (event.exceeded) {
      durationSnippet += ` (Exceeded ${event.warning_threshold_minutes}m)`;
    }
    noteText = event.note;
  } else if (event.type === 'SHIFT_END') {
    dotColor = '#64748B';
    title = `Shift Ended (${event.reason_display || event.reason})`;
    subtitle = formatTime(event.timestamp);
  }

  return (
    <View style={styles.timelineRow}>
      {/* Left indicator line and circle */}
      <View style={styles.timelineLineContainer}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
        {!isLast && <View style={styles.timelineConnectingLine} />}
      </View>

      {/* Right details */}
      <View style={styles.timelineDetailsBox}>
        <View style={styles.rowBetween}>
          <Text style={styles.timelineItemTitle}>{title}</Text>
          {!!durationSnippet && (
            <Text style={styles.timelineItemDuration}>{durationSnippet}</Text>
          )}
        </View>
        <Text style={styles.timelineItemSubtitle}>{subtitle}</Text>
        {!!noteText && (
          <Text style={styles.timelineItemNote}>“{noteText}”</Text>
        )}
      </View>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    topNav: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    pageTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
    },
    pageSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 1,
    },
    content: {
      padding: 16,
      gap: 12,
      paddingBottom: 40,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      letterSpacing: 0.2,
    },
    card: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    sessionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    currentCategoryTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
    mainTimerBox: {
      alignItems: 'flex-end',
    },
    timerSubtitle: {
      fontSize: 9,
      fontWeight: '700',
      color: c.muted,
      marginBottom: 2,
    },
    largeTimer: {
      fontSize: 22,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    warningBox: {
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FECACA',
      borderRadius: 8,
      padding: 8,
    },
    warningText: {
      color: '#DC2626',
      fontSize: 11,
      fontWeight: '600',
    },
    durationBreakdownRow: {
      flexDirection: 'row',
      backgroundColor: c.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metricItem: {
      flex: 1,
      alignItems: 'center',
    },
    metricLabel: {
      fontSize: 11,
      color: c.muted,
      marginBottom: 3,
    },
    metricValue: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    metricDivider: {
      width: 1,
      height: 26,
      backgroundColor: c.border,
    },
    controlButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.accent,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    secondaryBtn: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    secondaryBtnText: {
      color: c.text,
      fontWeight: '600',
      fontSize: 13,
    },
    dangerBtn: {
      paddingHorizontal: 14,
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FECACA',
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    dangerBtnText: {
      color: '#DC2626',
      fontWeight: '700',
      fontSize: 13,
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    filterPillText: {
      fontSize: 12,
      color: c.text,
      fontWeight: '500',
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowAlign: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    cardSubtitle: {
      fontSize: 12,
      lineHeight: 17,
      color: c.muted,
    },
    cardBadge: {
      fontSize: 12,
      fontWeight: '600',
      color: c.muted,
    },
    pointsBadgeValue: {
      fontSize: 16,
      fontWeight: '800',
      color: c.accent,
    },
    pointsDisclaimer: {
      fontSize: 11,
      lineHeight: 15,
      color: c.text,
      opacity: 0.8,
    },
    historyCard: {
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    historyCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
    },
    historyDateTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    statusTag: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusTagText: {
      fontSize: 10,
      fontWeight: '700',
    },
    historyDurationSnippet: {
      fontSize: 12,
      color: c.muted,
    },
    timelineContainer: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      padding: 14,
      backgroundColor: c.background,
      gap: 12,
    },
    timelineHeading: {
      fontSize: 12,
      fontWeight: '700',
      color: c.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    timelineLineContainer: {
      width: 20,
      alignItems: 'center',
      marginRight: 8,
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
    },
    timelineConnectingLine: {
      width: 2,
      flex: 1,
      minHeight: 28,
      backgroundColor: c.border,
      marginVertical: 2,
    },
    timelineDetailsBox: {
      flex: 1,
      paddingBottom: 10,
    },
    timelineItemTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    timelineItemDuration: {
      fontSize: 11,
      fontWeight: '700',
      color: c.accent,
    },
    timelineItemSubtitle: {
      fontSize: 11,
      color: c.muted,
      marginTop: 1,
    },
    timelineItemNote: {
      fontSize: 11,
      color: c.muted,
      fontStyle: 'italic',
      marginTop: 3,
    },
  });



export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const { colors } = useAppTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, padding: 20, justifyContent: 'center', alignItems: 'center' }}>
      <AnimatedBackButton style={{ position: 'absolute', top: 50, left: 20 }} />
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
        Workforce Activity
      </Text>
      <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 20 }}>
        {error?.message || 'An unexpected error occurred while loading activity.'}
      </Text>
      <Pressable
        onPress={retry}
        style={{ backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </SafeAreaView>
  );
}
