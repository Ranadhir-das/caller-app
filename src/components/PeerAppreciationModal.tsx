import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/context/AppThemeContext';
import {
  getPeerAppreciationStatus,
  submitPeerAppreciation,
  type PeerAppreciationStatus,
  type PeerReviewEmployee,
} from '@/services/points';

export function PeerAppreciationModal() {
  const { user, token } = useAuth();
  const { colors } = useAppTheme();

  const [status, setStatus] = useState<PeerAppreciationStatus | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = useCallback(async () => {
    if (!token || !user) return;
    try {
      const res = await getPeerAppreciationStatus(token);
      setStatus(res);
      setCurrentIndex(0);
      setScore(7);
      setError('');
    } catch {
      // Graceful fallback if network unavailable
    }
  }, [token, user?.id]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  if (!status || status.is_complete || !status.pending_employees || status.pending_employees.length === 0) {
    return null;
  }

  const pendingList = status.pending_employees;
  const currentEmployee: PeerReviewEmployee | undefined = pendingList[currentIndex];

  if (!currentEmployee) {
    return null;
  }

  const totalReviews = status.total_peers;
  const currentStep = status.completed_count + currentIndex + 1;
  const isLast = currentIndex === pendingList.length - 1;

  const handleSubmitScore = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await submitPeerAppreciation(token, {
        employee: currentEmployee.id,
        score,
        month: status.month,
      });

      if (!isLast) {
        setCurrentIndex((prev) => prev + 1);
        setScore(7);
      } else {
        // All completed!
        await checkStatus();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = Math.min(100, Math.round((currentStep / totalReviews) * 100));

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={false}
      onRequestClose={() => {
        // Mandatory month-end review: cannot dismiss until complete
      }}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
          {/* Top Header */}
          <View style={styles.header}>
            <Text style={[styles.badge, { backgroundColor: colors.accent + '20', color: colors.accent }]}>
              MONTHLY PEER APPRECIATION · {status.month}
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>Employee Review</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Rate your colleagues for this month. This mandatory review helps recognize teamwork.
            </Text>
          </View>

          {/* Progress Tracker */}
          <View style={styles.progressContainer}>
            <View style={styles.progressLabels}>
              <Text style={[styles.stepText, { color: colors.text }]}>
                Review {currentStep} of {totalReviews}
              </Text>
              <Text style={[styles.percentText, { color: colors.muted }]}>{progressPercent}%</Text>
            </View>
            <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  { backgroundColor: colors.accent, width: `${progressPercent}%` },
                ]}
              />
            </View>
          </View>

          {/* Employee Profile Card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {(currentEmployee.name || currentEmployee.username).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.employeeName, { color: colors.text }]}>
              {currentEmployee.name || currentEmployee.username}
            </Text>
            <Text style={[styles.employeeRole, { color: colors.muted }]}>
              @{currentEmployee.username} {currentEmployee.designation ? `· ${currentEmployee.designation}` : ''}
            </Text>
          </View>

          {/* Score Selector (1 to 10) */}
          <View style={[styles.ratingBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.ratingTitle, { color: colors.text }]}>Rate Collaboration & Support</Text>
            <View style={styles.scoreDisplayRow}>
              <Text style={[styles.scoreValue, { color: colors.accent }]}>{score}</Text>
              <Text style={[styles.scoreScale, { color: colors.muted }]}>/ 10</Text>
            </View>

            {/* Visual Slider / Progress Track */}
            <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.sliderFill,
                  { backgroundColor: colors.accent, width: `${((score - 1) / 9) * 100}%` },
                ]}
              />
              <View
                style={[
                  styles.sliderThumb,
                  {
                    backgroundColor: colors.accent,
                    borderColor: colors.surface,
                    left: `${Math.min(95, Math.max(0, ((score - 1) / 9) * 94))}%`,
                  },
                ]}
              />
            </View>

            {/* Integer Selection Pills (1 to 10) */}
            <View style={styles.pillsRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = score === num;
                return (
                  <Pressable
                    key={num}
                    accessibilityRole="button"
                    accessibilityLabel={`Score ${num}`}
                    onPress={() => setScore(num)}
                    style={[
                      styles.scorePill,
                      {
                        backgroundColor: isSelected ? colors.accent : colors.background,
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: isSelected ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      {num}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Error Message */}
          {!!error && (
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          )}

          {/* Submit / Next Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Finish reviews' : 'Next employee'}
            disabled={submitting}
            onPress={handleSubmitScore}
            style={[styles.nextButton, { backgroundColor: colors.accent, opacity: submitting ? 0.7 : 1 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.nextButtonText}>
                {isLast ? 'Finish Appreciation ✓' : 'Next Employee →'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
  },
  percentText: {
    fontSize: 12,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  card: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  employeeName: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  employeeRole: {
    fontSize: 13,
    textAlign: 'center',
  },
  ratingBox: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    alignItems: 'center',
  },
  ratingTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  scoreDisplayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '900',
    lineHeight: 52,
  },
  scoreScale: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  sliderTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    position: 'relative',
    marginBottom: 20,
  },
  sliderFill: {
    height: '100%',
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  scorePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  nextButton: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

