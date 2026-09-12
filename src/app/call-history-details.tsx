import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';

import { useLeads } from '@/context/LeadContext';
import { CallHistory } from '@/types';

export default function CallHistoryDetailsScreen() {
  const styles = useAppStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { callHistory } = useLeads();

  const call = callHistory.find((item) => item.id === id);

  const getOutcomeLabel = (
    outcome: CallHistory['outcome']
  ) => {
    switch (outcome) {
      case 'interested':
        return 'Interested';

      case 'not_interested':
        return 'Not Interested';

      case 'no_answer':
        return 'No Answer';

      case 'busy':
        return 'Busy';

      case 'call_back':
        return 'Call Back';

      case 'wrong_number':
        return 'Wrong Number';

      default:
        return 'Called';
    }
  };

  const getOutcomeStyle = (
    outcome: CallHistory['outcome']
  ) => {
    switch (outcome) {
      case 'interested':
        return {
          container: styles.interestedBadge,
          text: styles.interestedText,
          icon: '✓',
        };

      case 'not_interested':
        return {
          container: styles.notInterestedBadge,
          text: styles.notInterestedText,
          icon: '✕',
        };

      case 'no_answer':
        return {
          container: styles.noAnswerBadge,
          text: styles.noAnswerText,
          icon: '−',
        };

      case 'busy':
        return {
          container: styles.busyBadge,
          text: styles.busyText,
          icon: '!',
        };

      case 'call_back':
        return {
          container: styles.callBackBadge,
          text: styles.callBackText,
          icon: '↻',
        };

      case 'wrong_number':
        return {
          container: styles.wrongNumberBadge,
          text: styles.wrongNumberText,
          icon: '✕',
        };

      default:
        return {
          container: styles.defaultBadge,
          text: styles.defaultText,
          icon: '✓',
        };
    }
  };

  const formatCallDate = (date: string) => {
    const value = new Date(date);

    return value.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCallTime = (date: string) => {
    const value = new Date(date);

    return value.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatFollowUpDate = (date: string) => {
    const value = new Date(date);

    return value.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleCallStudent = () => {
    if (!call?.phone) {
      Alert.alert(
        'Phone Number Missing',
        'This student does not have a valid phone number.'
      );
      return;
    }

    router.push({
      pathname: '/dialer',
      params: {
        id: call.leadId,
      },
    });
  };

  if (!call) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundIcon}>📞</Text>

          <Text style={styles.notFoundTitle}>
            Call record not found
          </Text>

          <Text style={styles.notFoundText}>
            This call record may have been removed.
          </Text>

          <AnimatedBackButton style={styles.backButton} onPress={() => router.replace('/(tabs)/history')} />
        </View>
      </SafeAreaView>
    );
  }

  const outcomeStyle = getOutcomeStyle(call.outcome);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedBackButton 
          style={styles.backIconButton}
          onPress={() => router.replace('/(tabs)/history')}
        >
          <Text style={styles.backIcon}>‹</Text>
        </AnimatedBackButton >

        <Text style={styles.headerTitle}>
          Call Details
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.studentCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {call.leadName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.studentName}>
            {call.leadName}
          </Text>

          <Text style={styles.studentPhone}>
            {call.phone}
          </Text>

          <View
            style={[
              styles.outcomeBadge,
              outcomeStyle.container,
            ]}
          >
            <Text
              style={[
                styles.outcomeIcon,
                outcomeStyle.text,
              ]}
            >
              {outcomeStyle.icon}
            </Text>

            <Text
              style={[
                styles.outcomeText,
                outcomeStyle.text,
              ]}
            >
              {getOutcomeLabel(call.outcome)}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Call Information
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text>📅</Text>
              </View>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>
                  Call Date
                </Text>

                <Text style={styles.infoValue}>
                  {formatCallDate(call.calledAt)}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text>🕐</Text>
              </View>

              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>
                  Call Time
                </Text>

                <Text style={styles.infoValue}>
                  {formatCallTime(call.calledAt)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {call.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Notes
            </Text>

            <View style={styles.notesCard}>
              <Text style={styles.notesText}>
                {call.notes}
              </Text>
            </View>
          </View>
        ) : null}

        {call.followUpDate ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Follow-up
            </Text>

            <View style={styles.followUpCard}>
              <View style={styles.followUpIconContainer}>
                <Text style={styles.followUpIcon}>
                  📅
                </Text>
              </View>

              <View style={styles.followUpContent}>
                <Text style={styles.followUpLabel}>
                  Scheduled Follow-up
                </Text>

                <Text style={styles.followUpDate}>
                  {formatFollowUpDate(
                    call.followUpDate
                  )}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <Pressable
          style={styles.callButton}
          onPress={handleCallStudent}
        >
          <Text style={styles.callButtonIcon}>
            📞
          </Text>

          <Text style={styles.callButtonText}>
            Call Student
          </Text>
        </Pressable>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 34,
    lineHeight: 36,
    color: colors.text,
    marginTop: -3,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },

  headerSpacer: {
    width: 42,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },

  studentCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.secondary,
  },

  studentName: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },

  studentPhone: {
    marginTop: 5,
    fontSize: 14,
    color: colors.muted,
  },

  outcomeBadge: {
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },

  outcomeIcon: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
  },

  outcomeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  interestedBadge: {
    backgroundColor: colors.successSoft,
  },

  interestedText: {
    color: colors.success,
  },

  notInterestedBadge: {
    backgroundColor: colors.dangerSoft,
  },

  notInterestedText: {
    color: colors.danger,
  },

  noAnswerBadge: {
    backgroundColor: colors.surfaceMuted,
  },

  noAnswerText: {
    color: colors.secondary,
  },

  busyBadge: {
    backgroundColor: colors.orangeSoft,
  },

  busyText: {
    color: colors.orange,
  },

  callBackBadge: {
    backgroundColor: colors.accentSoft,
  },

  callBackText: {
    color: colors.accent,
  },

  wrongNumberBadge: {
    backgroundColor: colors.dangerSoft,
  },

  wrongNumberText: {
    color: colors.danger,
  },

  defaultBadge: {
    backgroundColor: colors.surfaceMuted,
  },

  defaultText: {
    color: colors.secondary,
  },

  section: {
    marginTop: 20,
  },

  sectionTitle: {
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '700',
    color: colors.secondary,
  },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
  },

  infoRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
  },

  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  infoContent: {
    marginLeft: 12,
  },

  infoLabel: {
    fontSize: 12,
    color: colors.muted,
  },

  infoValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },

  divider: {
    height: 1,
    backgroundColor: colors.surfaceMuted,
  },

  notesCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },

  notesText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.secondary,
  },

  followUpCard: {
    backgroundColor: colors.orangeSoft,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  followUpIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  followUpIcon: {
    color: colors.text,
    fontSize: 20,
  },

  followUpContent: {
    marginLeft: 12,
  },

  followUpLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.orange,
  },

  followUpDate: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '700',
    color: colors.orange,
  },

  callButton: {
    marginTop: 24,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callButtonIcon: {
    color: colors.text,
    fontSize: 18,
    marginRight: 8,
  },

  callButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimary,
  },

  bottomSpace: {
    height: 30,
  },

  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  notFoundIcon: {
    color: colors.text,
    fontSize: 42,
    marginBottom: 14,
  },

  notFoundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  notFoundText: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },

  backButton: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },

  backButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
