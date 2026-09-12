import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';

import { useLeads } from '@/context/LeadContext';
import { Lead } from '@/types';

export default function LeadDetailsScreen() {
  const styles = useAppStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { leads } = useLeads();

  const lead = leads.find((item) => item.id === id);

  const getStatusLabel = (status: Lead['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';

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

  const getStatusStyle = (status: Lead['status']) => {
    switch (status) {
      case 'pending':
        return {
          container: styles.pendingStatus,
          text: styles.pendingStatusText,
        };

      case 'interested':
        return {
          container: styles.interestedStatus,
          text: styles.interestedStatusText,
        };

      case 'not_interested':
        return {
          container: styles.notInterestedStatus,
          text: styles.notInterestedStatusText,
        };

      case 'no_answer':
        return {
          container: styles.noAnswerStatus,
          text: styles.noAnswerStatusText,
        };

      case 'busy':
        return {
          container: styles.busyStatus,
          text: styles.busyStatusText,
        };

      case 'call_back':
        return {
          container: styles.callBackStatus,
          text: styles.callBackStatusText,
        };

      case 'wrong_number':
        return {
          container: styles.wrongNumberStatus,
          text: styles.wrongNumberStatusText,
        };

      default:
        return {
          container: styles.defaultStatus,
          text: styles.defaultStatusText,
        };
    }
  };

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>

          <Text style={styles.errorTitle}>
            Student not found
          </Text>

          <Text style={styles.errorText}>
            This student may no longer be available.
          </Text>

          <AnimatedBackButton
            style={styles.backButton}
            onPress={() => router.replace('/(tabs)/leads')}
          />
        </View>
      </SafeAreaView>
    );
  }

  const statusStyle = getStatusStyle(lead.status);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Header */}

        <View style={styles.header}>
          <AnimatedBackButton
            style={styles.backCircle}
            onPress={() => router.replace('/(tabs)/leads')}
          />

          <Text style={styles.headerTitle}>
            Student Details
          </Text>

          <View style={styles.headerSpace} />
        </View>

        {/* Profile */}

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {lead.name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.name}>
            {lead.name}
          </Text>

          <View
            style={[
              styles.statusBadge,
              statusStyle.container,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                statusStyle.text,
              ]}
            >
              {getStatusLabel(lead.status)}
            </Text>
          </View>
        </View>

        {/* Contact Information */}

        <Text style={styles.sectionTitle}>
          Contact Information
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>
              📞
            </Text>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                Phone
              </Text>

              <Text style={styles.infoValue}>
                {lead.phone}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}

        <Text style={styles.sectionTitle}>
          Notes
        </Text>

        <View style={styles.notesCard}>
          <Text style={styles.notesText}>
            {lead.notes || 'No notes added yet.'}
          </Text>
        </View>

        {/* Follow-up */}

        <Text style={styles.sectionTitle}>
          Follow-up
        </Text>

        <View style={styles.followUpCard}>
          <Text style={styles.followUpIcon}>
            📅
          </Text>

          <View style={styles.followUpContent}>
            <Text style={styles.infoLabel}>
              Follow-up Date
            </Text>

            <Text style={styles.infoValue}>
              {lead.followUpDate
                ? lead.followUpDate
                : 'No follow-up scheduled'}
            </Text>
          </View>
        </View>

        {/* Call Student */}

        <Pressable
          style={styles.callButton}
          onPress={() => {
            router.push({
              pathname: '/dialer',
              params: {
                id: lead.id,
              },
            });
          }}
        >
          <Text style={styles.callIcon}>
            📞
          </Text>

          <Text style={styles.callButtonText}>
            Call Student
          </Text>
        </Pressable>

        {/* Call Outcome */}

        <Pressable
          style={styles.outcomeButton}
          onPress={() => {
            router.push({
              pathname: '/call-outcome',
              params: {
                id: lead.id,
              },
            });
          }}
        >
          <Text style={styles.outcomeButtonText}>
            Record Call Outcome
          </Text>

          <Text style={styles.outcomeChevron}>
            ›
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 32,
    color: colors.text,
    marginTop: -4,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  headerSpace: {
    width: 42,
  },

  profileCard: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },

  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.accent,
  },

  name: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },

  statusBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },

  statusText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },

  pendingStatus: {
    backgroundColor: colors.warningSoft,
  },

  pendingStatusText: {
    color: colors.warning,
  },

  interestedStatus: {
    backgroundColor: colors.successSoft,
  },

  interestedStatusText: {
    color: colors.success,
  },

  notInterestedStatus: {
    backgroundColor: colors.dangerSoft,
  },

  notInterestedStatusText: {
    color: colors.danger,
  },

  noAnswerStatus: {
    backgroundColor: colors.surfaceMuted,
  },

  noAnswerStatusText: {
    color: colors.secondary,
  },

  busyStatus: {
    backgroundColor: colors.orangeSoft,
  },

  busyStatusText: {
    color: colors.orange,
  },

  callBackStatus: {
    backgroundColor: colors.accentSoft,
  },

  callBackStatusText: {
    color: colors.accent,
  },

  wrongNumberStatus: {
    backgroundColor: colors.dangerSoft,
  },

  wrongNumberStatusText: {
    color: colors.danger,
  },

  defaultStatus: {
    backgroundColor: colors.surfaceMuted,
  },

  defaultStatusText: {
    color: colors.secondary,
  },

  sectionTitle: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },

  infoIcon: {
    color: colors.text,
    width: 40,
    fontSize: 20,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: colors.placeholder,
  },

  infoValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondary,
  },

  notesCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    minHeight: 70,
  },

  notesText: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },

  followUpCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  followUpIcon: {
    color: colors.text,
    width: 40,
    fontSize: 20,
  },

  followUpContent: {
    flex: 1,
  },

  callButton: {
    marginTop: 25,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callIcon: {
    color: colors.text,
    fontSize: 20,
    marginRight: 8,
  },

  callButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  outcomeButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  outcomeButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },

  outcomeChevron: {
    position: 'absolute',
    right: 16,
    fontSize: 24,
    color: colors.accent,
  },

  errorContainer: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorIcon: {
    color: colors.text,
    fontSize: 42,
    marginBottom: 12,
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  errorText: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },

  backButton: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },

  backButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
});