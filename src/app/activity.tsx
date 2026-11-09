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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Navigation Bar */}
      <View style={styles.topNav}>
        <AnimatedBackButton />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pageTitle}>Work Activity & Sessions</Text>
          <Text style={styles.pageSubtitle}>Daily tracking & shift history</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh activity"
          style={styles.refreshBtn}
          onPress={onPullToRefresh}
        >
          {sessionRefreshing || historyLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{ fontSize: 16 }}>🔄</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={sessionRefreshing || historyLoading}
            onRefresh={onPullToRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* ======================================================== */}
        {/* SECTION 1: LIVE ACTIVE WORK SESSION */}
        {/* ======================================================== */}
        <Text style={styles.sectionHeading}>Current Shift</Text>

        {sessionLoading ? (
          <View style={styles.card}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : hasActiveSession && session ? (
          <View
            style={[
              styles.liveCard,
              {
                borderColor: isPaused
                  ? breakWarningExceeded
                    ? colors.danger
                    : colors.warning
                  : colors.primary,
              },
            ]}
          >
            {/* Header row: Status pill + Category */}
            <View style={styles.sessionHeaderRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: isPaused
                        ? breakWarningExceeded
                          ? colors.dangerSoft
                          : colors.warningSoft
                        : colors.successSoft,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.statusBadgeDot,
                      {
                        backgroundColor: isPaused
                          ? breakWarningExceeded
                            ? colors.danger
                            : colors.warning
                          : colors.success,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: isPaused
                          ? breakWarningExceeded
                            ? colors.danger
                            : colors.warning
                          : colors.success,
                      },
                    ]}
                  >
                    {isPaused
                      ? breakWarningExceeded
                        ? 'BREAK LIMIT EXCEEDED'
                        : 'PAUSED ON BREAK'
                      : 'ACTIVE WORK SESSION'}
                  </Text>
                </View>

                <Text style={styles.currentCategoryTitle} numberOfLines={2}>
                  {isPaused
                    ? `Break: ${currentBreak?.reason?.name || 'Break'}`
                    : currentSegment?.category?.name || 'Work Activity'}
                </Text>
              </View>

              <View style={styles.mainTimerBox}>
                <Text style={styles.timerSubtitle}>
                  {isPaused ? 'BREAK TIME' : 'NET WORK TIME'}
                </Text>
                <Text
                  style={[
                    styles.largeTimer,
                    isPaused
                      ? { color: breakWarningExceeded ? colors.danger : colors.warning }
                      : { color: colors.primary },
                  ]}
                >
                  {formatDuration(isPaused ? breakElapsed : elapsedNet)}
                </Text>
              </View>
            </View>

            {/* Warning alert if break threshold exceeded */}
            {isPaused && breakWarningExceeded && (
              <View style={styles.warningBox}>
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={styles.warningText}>
                  This break has exceeded the expected limit ({currentBreak?.warning_threshold_minutes} min).
                </Text>
              </View>
            )}

            {/* Duration metrics breakdown */}
            <View style={styles.durationBreakdownGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>⏱️ Net Work</Text>
                <Text style={[styles.metricCardValue, { color: colors.primary }]}>
                  {formatDuration(elapsedNet)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>☕ Break Time</Text>
                <Text style={[styles.metricCardValue, { color: colors.warning }]}>
                  {formatDuration(elapsedBreak)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>⌛ Total Gross</Text>
                <Text style={styles.metricCardValue}>
                  {formatDuration(elapsedGross)}
                </Text>
              </View>
            </View>

            {/* Control Buttons */}
            <View style={styles.controlButtonsRow}>
              {isPaused ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Resume work session"
                  disabled={mutating}
                  style={[styles.resumeBtn, mutating && { opacity: 0.7 }]}
                  onPress={handleResume}
                >
                  {mutating ? (
                    <View style={styles.btnRowWithSpinner}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text
                        style={[styles.resumeBtnText, { marginLeft: 6 }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        Resuming...
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={styles.resumeBtnText}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      ▶ Resume Work
                    </Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Take a break"
                  disabled={mutating}
                  style={[styles.takeBreakBtn, mutating && { opacity: 0.7 }]}
                  onPress={() => setPauseModalOpen(true)}
                >
                  <Text
                    style={styles.takeBreakBtnText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    ☕ Take Break
                  </Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch work category"
                disabled={mutating}
                style={[styles.secondaryBtn, mutating && { opacity: 0.7 }]}
                onPress={() => setSwitchModalOpen(true)}
              >
                <Text
                  style={styles.secondaryBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  🔄 Switch
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="End shift"
                disabled={mutating}
                style={[styles.dangerBtn, mutating && { opacity: 0.7 }]}
                onPress={() => setEndShiftModalOpen(true)}
              >
                <Text
                  style={styles.dangerBtnText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  End Shift
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            {user?.shift_workflow_enabled ? (
              <>
                <View style={styles.emptyStateHeader}>
                  <Text style={{ fontSize: 32 }}>⏱️</Text>
                  <Text style={styles.cardHeading}>No Active Shift</Text>
                </View>
                <Text style={styles.cardSubtitle}>
                  You are signed in. When you are ready to begin your workday, explicitly start your shift below.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={mutating}
                  style={[styles.primaryBtn, { marginTop: 12 }, mutating && { opacity: 0.6 }]}
                  onPress={handleStartShift}
                >
                  {mutating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>🚀 Start Shift</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.emptyStateHeader}>
                  <Text style={{ fontSize: 32 }}>📸</Text>
                  <Text style={styles.cardHeading}>No Active Shift</Text>
                </View>
                <Text style={styles.cardSubtitle}>
                  Work tracking starts automatically when you complete photo attendance check-in.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.primaryBtn, { marginTop: 12 }]}
                  onPress={() => router.push('/employee/attendance' as never)}
                >
                  <Text style={styles.primaryBtnText}>Go to Attendance Check-In →</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ======================================================== */}
        {/* SECTION 2: HISTORY FILTERS & AGGREGATES */}
        {/* ======================================================== */}
        <Text style={[styles.sectionHeading, { marginTop: 14 }]}>Activity History</Text>

        {/* Filter Pills (Horizontal Scroll for Responsive Layout) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsRow}
        >
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
                  isSelected && styles.filterPillActive,
                ]}
                onPress={() => setActivePreset(key)}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Summary Card for Selected Filter */}
        {historyData?.summary && (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardHeading}>Period Summary</Text>
              <View style={styles.sessionCountPill}>
                <Text style={styles.sessionCountText}>
                  {historyData.summary.total_sessions} session
                  {historyData.summary.total_sessions === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <View style={styles.durationBreakdownGrid}>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>⏱️ Total Net</Text>
                <Text style={[styles.metricCardValue, { color: colors.primary }]}>
                  {formatDuration(historyData.summary.total_net_seconds)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>☕ Breaks</Text>
                <Text style={[styles.metricCardValue, { color: colors.warning }]}>
                  {formatDuration(historyData.summary.total_break_seconds)}
                </Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricCardLabel}>⌛ Gross</Text>
                <Text style={styles.metricCardValue}>
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
            style={styles.pointsCard}
          >
            <View style={styles.rowBetween}>
              <View style={styles.rowAlign}>
                <View style={styles.trophyCircle}>
                  <Text style={{ fontSize: 20 }}>🏆</Text>
                </View>
                <View>
                  <Text style={styles.pointsCardHeading}>Performance Points</Text>
                  <Text style={styles.pointsDisclaimer}>
                    {historyData.performance_points.note}
                  </Text>
                </View>
              </View>
              <Text style={styles.pointsBadgeValue}>
                {historyData.performance_points.total_points} pts
              </Text>
            </View>
            <View style={styles.pointsLinkRow}>
              <Text style={styles.pointsLinkText}>
                View Points Breakup by Work →
              </Text>
            </View>
          </Pressable>
        )}

        {/* ======================================================== */}
        {/* SECTION 3: SESSIONS & TIMELINE LIST */}
        {/* ======================================================== */}
        {historyLoading && !historyData ? (
          <View style={{ paddingVertical: 28, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : historyError ? (
          <View style={styles.card}>
            <Text style={{ color: colors.danger, fontWeight: '600' }}>{historyError}</Text>
          </View>
        ) : !historyData?.sessions || historyData.sessions.length === 0 ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
            <View style={styles.emptyIconCircle}>
              <Text style={{ fontSize: 28 }}>📅</Text>
            </View>
            <Text style={[styles.cardHeading, { marginTop: 10 }]}>No recorded sessions</Text>
            <Text style={[styles.cardSubtitle, { textAlign: 'center', marginTop: 4, maxWidth: 280 }]}>
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
  const isActive = session.status === 'ACTIVE';
  const isPaused = session.status === 'PAUSED';

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
          <View style={styles.historyTopRow}>
            <Text style={styles.historyDateTitle}>{formattedDate}</Text>
            <View
              style={[
                styles.statusTag,
                isActive
                  ? { backgroundColor: colors.successSoft }
                  : isPaused
                  ? { backgroundColor: colors.warningSoft }
                  : { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <Text
                style={[
                  styles.statusTagText,
                  isActive
                    ? { color: colors.success }
                    : isPaused
                    ? { color: colors.warning }
                    : { color: colors.muted },
                ]}
              >
                {session.status}
              </Text>
            </View>
          </View>

          <View style={styles.historyMetricsPillRow}>
            <View style={styles.historyMetricBadge}>
              <Text style={styles.historyMetricLabel}>Net</Text>
              <Text style={[styles.historyMetricValue, { color: colors.primary }]}>
                {formatDuration(session.net_seconds ?? 0)}
              </Text>
            </View>
            <View style={styles.historyMetricBadge}>
              <Text style={styles.historyMetricLabel}>Break</Text>
              <Text style={[styles.historyMetricValue, { color: colors.warning }]}>
                {formatDuration(session.break_seconds ?? 0)}
              </Text>
            </View>
            <View style={styles.historyMetricBadge}>
              <Text style={styles.historyMetricLabel}>Gross</Text>
              <Text style={styles.historyMetricValue}>
                {formatDuration(session.gross_seconds ?? 0)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.chevronCircle}>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </Pressable>

      {/* Expandable Timeline */}
      {expanded && (
        <View style={styles.timelineContainer}>
          <View style={styles.rowBetween}>
            <Text style={styles.timelineHeading}>Chronological Timeline</Text>
            <Text style={styles.timelineEventCount}>
              {session.timeline?.length || 0} event{session.timeline?.length === 1 ? '' : 's'}
            </Text>
          </View>

          {session.timeline && session.timeline.length > 0 ? (
            session.timeline.map((event, idx) => (
              <TimelineItem
                key={idx}
                event={event}
                isLast={idx === session.timeline.length - 1}
              />
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

  let dotColor = colors.primary;
  let title = '';
  let subtitle = '';
  let durationSnippet = '';
  let noteText = '';
  let badgeType: 'START' | 'SEGMENT' | 'BREAK' | 'END' = 'SEGMENT';
  const isBreak = event.type === 'BREAK';
  const isOverdue = isBreak && Boolean(event.exceeded);

  if (event.type === 'SHIFT_START') {
    dotColor = colors.success;
    title = 'Shift Started';
    subtitle = formatTime(event.timestamp);
    badgeType = 'START';
  } else if (event.type === 'SEGMENT') {
    dotColor = event.category?.color_hex || colors.primary;
    title = event.category?.name || 'Work Activity';
    subtitle = `${formatTime(event.started_at)} – ${formatTime(event.ended_at) || 'Present'}`;
    durationSnippet = formatDuration(event.duration_seconds ?? 0);
    noteText = event.note;
    badgeType = 'SEGMENT';
  } else if (event.type === 'BREAK') {
    dotColor = event.exceeded ? colors.danger : colors.warning;
    title = `Break: ${event.reason?.name || 'Break'}`;
    subtitle = `${formatTime(event.started_at)} – ${formatTime(event.ended_at) || 'Present'}`;
    durationSnippet = formatDuration(event.duration_seconds ?? 0);
    if (event.exceeded) {
      durationSnippet += ` (Exceeded ${event.warning_threshold_minutes}m)`;
    }
    noteText = event.note;
    badgeType = 'BREAK';
  } else if (event.type === 'SHIFT_END') {
    dotColor = colors.muted;
    title = `Shift Ended (${event.reason_display || event.reason})`;
    subtitle = formatTime(event.timestamp);
    badgeType = 'END';
  }

  return (
    <View style={styles.timelineRow}>
      {/* Left indicator line and circle */}
      <View style={styles.timelineLineContainer}>
        <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
        {!isLast && <View style={styles.timelineConnectingLine} />}
      </View>

      {/* Right details card */}
      <View style={styles.timelineDetailsBox}>
        <View style={styles.timelineEventCard}>
          <View style={styles.rowBetween}>
            <View style={[styles.rowAlign, { flex: 1, flexWrap: 'wrap' }]}>
              <Text style={styles.timelineItemTitle}>{title}</Text>
              {isBreak && (
                <View
                  style={[
                    styles.microBadge,
                    {
                      backgroundColor: isOverdue
                        ? colors.dangerSoft
                        : colors.warningSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.microBadgeText,
                      { color: isOverdue ? colors.danger : colors.warning },
                    ]}
                  >
                    {isOverdue ? 'OVERDUE' : 'BREAK'}
                  </Text>
                </View>
              )}
            </View>
            {!!durationSnippet && (
              <View style={styles.durationPill}>
                <Text
                  style={[
                    styles.durationPillText,
                    {
                      color:
                        badgeType === 'BREAK' ? colors.warning : colors.primary,
                    },
                  ]}
                >
                  {durationSnippet}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.timelineItemSubtitle}>{subtitle}</Text>
          {!!noteText && (
            <View style={styles.noteBubble}>
              <Text style={styles.timelineItemNote}>“{noteText}”</Text>
            </View>
          )}
        </View>
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
      fontSize: 18,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.2,
    },
    pageSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 1,
    },
    refreshBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      padding: 16,
      gap: 14,
      paddingBottom: 48,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '800',
      color: c.text,
      letterSpacing: 0.2,
      marginBottom: 2,
    },
    card: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    liveCard: {
      padding: 16,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      gap: 14,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    },
    sessionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    statusBadgeDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    currentCategoryTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.3,
    },
    mainTimerBox: {
      alignItems: 'flex-end',
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    timerSubtitle: {
      fontSize: 9,
      fontWeight: '800',
      color: c.muted,
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    largeTimer: {
      fontSize: 22,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    warningBox: {
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 10,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    warningText: {
      color: c.danger,
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
      lineHeight: 16,
    },
    durationBreakdownGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    metricCard: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 10,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    metricCardLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: c.muted,
      marginBottom: 4,
    },
    metricCardValue: {
      fontSize: 14,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    controlButtonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    btnRowWithSpinner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.primary,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 12.5,
      textAlign: 'center',
    },
    resumeBtn: {
      flex: 1.35,
      backgroundColor: c.success,
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    resumeBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 12.5,
      textAlign: 'center',
    },
    takeBreakBtn: {
      flex: 1.2,
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: c.warning,
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    takeBreakBtnText: {
      color: c.warning,
      fontWeight: '700',
      fontSize: 12.5,
      textAlign: 'center',
    },
    secondaryBtn: {
      flex: 0.95,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    secondaryBtnText: {
      color: c.text,
      fontWeight: '700',
      fontSize: 12.5,
      textAlign: 'center',
    },
    dangerBtn: {
      flex: 0.95,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 46,
    },
    dangerBtnText: {
      color: c.danger,
      fontWeight: '700',
      fontSize: 12.5,
      textAlign: 'center',
    },
    emptyStateHeader: {
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    filterPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    filterPillActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterPillText: {
      fontSize: 13,
      color: c.text,
      fontWeight: '600',
    },
    filterPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
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
      fontWeight: '800',
      color: c.text,
      letterSpacing: -0.2,
    },
    cardSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      color: c.muted,
    },
    sessionCountPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    sessionCountText: {
      fontSize: 11,
      fontWeight: '700',
      color: c.muted,
    },
    pointsCard: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: c.accentSoft,
      borderWidth: 1,
      borderColor: c.accent + '33',
      gap: 10,
    },
    trophyCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    pointsCardHeading: {
      fontSize: 15,
      fontWeight: '800',
      color: c.accent,
    },
    pointsBadgeValue: {
      fontSize: 18,
      fontWeight: '800',
      color: c.accent,
      fontVariant: ['tabular-nums'],
    },
    pointsDisclaimer: {
      fontSize: 11,
      lineHeight: 15,
      color: c.text,
      opacity: 0.8,
      marginTop: 2,
    },
    pointsLinkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 4,
    },
    pointsLinkText: {
      fontSize: 12,
      fontWeight: '700',
      color: c.accent,
    },
    emptyIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
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
      gap: 10,
    },
    historyTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    historyDateTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    statusTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    statusTagText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    historyMetricsPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    historyMetricBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
    },
    historyMetricLabel: {
      fontSize: 10,
      color: c.muted,
      fontWeight: '600',
    },
    historyMetricValue: {
      fontSize: 11,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    chevronCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timelineContainer: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      padding: 14,
      backgroundColor: c.background,
      gap: 12,
    },
    timelineHeading: {
      fontSize: 11,
      fontWeight: '800',
      color: c.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    timelineEventCount: {
      fontSize: 11,
      fontWeight: '600',
      color: c.muted,
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    timelineLineContainer: {
      width: 18,
      alignItems: 'center',
      marginRight: 10,
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 6,
    },
    timelineConnectingLine: {
      width: 2,
      flex: 1,
      minHeight: 28,
      backgroundColor: c.border,
      marginVertical: 4,
    },
    timelineDetailsBox: {
      flex: 1,
      paddingBottom: 8,
    },
    timelineEventCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
    },
    timelineItemTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
    },
    microBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      marginLeft: 6,
    },
    microBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    durationPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    durationPillText: {
      fontSize: 11,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    timelineItemSubtitle: {
      fontSize: 11,
      color: c.muted,
    },
    noteBubble: {
      marginTop: 4,
      padding: 8,
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
    },
    timelineItemNote: {
      fontSize: 11,
      color: c.text,
      fontStyle: 'italic',
      lineHeight: 15,
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
        style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </SafeAreaView>
  );
}
