import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAppTheme, useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import { formatDuration, useActivity } from '@/context/ActivityContext';
import { openLocationSettings } from '@/services/location';
import { PauseModal, SwitchCategoryModal } from './ActivityActionModals';

export function ActivityStatusWidget({
  onPressDetails,
}: {
  onPressDetails?: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useAppStyles(createWidgetStyles);
  const { user } = useAuth();

  const {
    session,
    currentSegment,
    currentBreak,
    hasActiveSession,
    categories,
    breakReasons,
    loading,
    mutating,
    elapsedNet,
    breakElapsed,
    breakWarningExceeded,
    startShift,
    pause,
    resume,
    switchCategory,
  } = useActivity();

  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);

  const handleOpenDetails = () => {
    if (onPressDetails) {
      onPressDetails();
    } else {
      router.push('/activity' as never);
    }
  };

  const handleStartShift = async () => {
    try {
      await startShift();
    } catch (err: unknown) {
      console.warn('Start shift error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to start shift. Please try again.';
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
          { text: 'View Details', onPress: () => router.push('/activity' as never) },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        router.push('/activity' as never);
      }
    }
  };

  const handleResume = async () => {
    try {
      await resume();
    } catch (err: unknown) {
      console.warn('Resume error:', err);
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
          { text: 'View Details', onPress: () => router.push('/activity' as never) },
          { text: 'OK', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Resume Failed', errorMsg, [
          { text: 'View Details', onPress: () => router.push('/activity' as never) },
          { text: 'OK', style: 'cancel' },
        ]);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.centerRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Syncing work session...</Text>
        </View>
      </View>
    );
  }

  // Case 1: No active session today
  if (!hasActiveSession || !session) {
    if (user?.shift_workflow_enabled) {
      return (
        <View style={[styles.card, { borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <View style={styles.rowAlign}>
              <View style={[styles.statusDot, { backgroundColor: colors.muted }]} />
              <Text style={styles.categoryTitle}>No Active Session</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View activity history"
              onPress={handleOpenDetails}
            >
              <Text style={styles.historyLink}>History →</Text>
            </Pressable>
          </View>
          <Text style={styles.infoText}>
            You are signed in. When you are ready to begin, explicitly start your shift.
          </Text>
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              disabled={mutating}
              style={[styles.smallButton, { backgroundColor: colors.accentSoft }]}
              onPress={handleStartShift}
            >
              <Text style={[styles.smallButtonText, { color: colors.accent, fontWeight: '700' }]}>
                {mutating ? 'Starting...' : 'Start Shift'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.smallButton, { backgroundColor: colors.surfaceMuted }]}
              onPress={handleOpenDetails}
            >
              <Text style={[styles.smallButtonText, { color: colors.text }]}>
                Shift Details
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // Default legacy workflow (when shift_workflow_enabled is false)
    return (
      <View style={[styles.card, { borderColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.rowAlign}>
            <View style={[styles.statusDot, { backgroundColor: colors.muted }]} />
            <Text style={styles.categoryTitle}>Attendance & Shift</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View activity history"
            onPress={handleOpenDetails}
          >
            <Text style={styles.historyLink}>History →</Text>
          </Pressable>
        </View>
        <Text style={styles.infoText}>
          Work tracking starts automatically when you complete photo attendance check-in.
        </Text>
        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            style={[styles.smallButton, { backgroundColor: colors.accentSoft }]}
            onPress={() => router.push('/employee/attendance' as never)}
          >
            <Text style={[styles.smallButtonText, { color: colors.accent, fontWeight: '700' }]}>
              Check-In Attendance
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.smallButton, { backgroundColor: colors.surfaceMuted }]}
            onPress={handleOpenDetails}
          >
            <Text style={[styles.smallButtonText, { color: colors.text }]}>
              View Past Shifts
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isPaused = session.status === 'PAUSED';
  const categoryName = currentSegment?.category?.name || 'Work Activity';
  const categoryColor = currentSegment?.category?.color_hex || colors.accent;
  const breakReasonName = currentBreak?.reason?.name || 'On Break';

  return (
    <>
      <View
        style={[
          styles.card,
          isPaused
            ? { borderColor: breakWarningExceeded ? colors.danger : '#EAB308' }
            : { borderColor: colors.accent },
        ]}
      >
        {/* Top bar: Category / Break label & Live Timer */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open activity details"
          style={styles.headerRow}
          onPress={handleOpenDetails}
        >
          <View style={styles.rowAlign}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isPaused ? '#EAB308' : colors.accent },
              ]}
            />
            <View>
              <Text style={styles.categoryTitle}>
                {isPaused ? `Break: ${breakReasonName}` : categoryName}
              </Text>
              <Text style={styles.statusSubtitle}>
                {isPaused ? 'Session Paused' : 'Active Work Session'}
              </Text>
            </View>
          </View>

          <View style={styles.timerBadge}>
            <Text style={styles.timerLabel}>
              {isPaused ? 'BREAK' : 'NET WORK'}
            </Text>
            <Text
              style={[
                styles.timerText,
                isPaused
                  ? { color: breakWarningExceeded ? colors.danger : '#EAB308' }
                  : { color: colors.accent },
              ]}
            >
              {formatDuration(isPaused ? breakElapsed : elapsedNet)}
            </Text>
          </View>
        </Pressable>

        {/* Warning threshold alert banner if exceeded */}
        {isPaused && breakWarningExceeded && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⚠️ Break exceeded {currentBreak?.warning_threshold_minutes}m target limit. Please resume when ready.
            </Text>
          </View>
        )}

        {/* Actions Row */}
        <View style={styles.actionsRow}>
          {isPaused ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume work session"
              disabled={mutating}
              style={[styles.primaryActionBtn, mutating && { opacity: 0.6 }]}
              onPress={handleResume}
            >
              {mutating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryActionText}>▶ Resume Work</Text>
              )}
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take a break"
                disabled={mutating}
                style={[styles.secondaryActionBtn, mutating && { opacity: 0.6 }]}
                onPress={() => setPauseModalOpen(true)}
              >
                <Text style={styles.secondaryActionText}>☕ Take Break</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch work category"
                disabled={mutating}
                style={[styles.secondaryActionBtn, mutating && { opacity: 0.6 }]}
                onPress={() => setSwitchModalOpen(true)}
              >
                <Text style={styles.secondaryActionText}>🔄 Switch</Text>
              </Pressable>
            </>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View full activity details"
            style={[styles.smallDetailsBtn, { borderColor: colors.border }]}
            onPress={handleOpenDetails}
          >
            <Text style={[styles.smallDetailsText, { color: colors.muted }]}>
              Details →
            </Text>
          </Pressable>
        </View>
      </View>

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
    </>
  );
}

const createWidgetStyles = (c: AppColors) =>
  StyleSheet.create({
    card: {
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1.5,
      gap: 10,
      marginVertical: 4,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowAlign: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    categoryTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    statusSubtitle: {
      fontSize: 11,
      color: c.muted,
      marginTop: 1,
    },
    timerBadge: {
      alignItems: 'flex-end',
    },
    timerLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.6,
      color: c.muted,
      marginBottom: 1,
    },
    timerText: {
      fontSize: 17,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    infoText: {
      fontSize: 12,
      lineHeight: 16,
      color: c.muted,
    },
    historyLink: {
      fontSize: 12,
      fontWeight: '600',
      color: c.accent,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    primaryActionBtn: {
      flex: 1,
      backgroundColor: c.accent,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    primaryActionText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    secondaryActionBtn: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    secondaryActionText: {
      color: c.text,
      fontWeight: '600',
      fontSize: 13,
    },
    smallDetailsBtn: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
    },
    smallDetailsText: {
      fontSize: 12,
      fontWeight: '600',
    },
    smallButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallButtonText: {
      fontSize: 12,
      fontWeight: '600',
    },
    warningBanner: {
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FECACA',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    warningText: {
      color: '#DC2626',
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 15,
    },
    centerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    loadingText: {
      fontSize: 13,
      color: c.muted,
    },
  });

