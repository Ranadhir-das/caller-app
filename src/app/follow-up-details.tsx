import { router, useLocalSearchParams } from 'expo-router';

import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeads } from '@/context/LeadContext';

export default function FollowUpDetailsScreen() {
  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const {
    leads,
    updateLead,
  } = useLeads();

  const lead = leads.find(
    (item) => item.id === id
  );

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>

          <Text style={styles.errorTitle}>
            Student not found
          </Text>

          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              Go Back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = lead.followUpDate
    ? new Date(
        lead.followUpDate
      ).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'No date';

  const handleCall = () => {
    router.push({
      pathname: '/dialer',
      params: {
        id: lead.id,
      },
    });
  };

  const handleComplete = () => {
    Alert.alert(
      'Complete Follow-up',
      `Mark the follow-up for ${lead.name} as completed?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Complete',
          onPress: () => {
            updateLead(lead.id, {
              status: 'called',
              notes: lead.notes,
              followUpDate: undefined,
            });

            Alert.alert(
              'Follow-up Completed',
              `${lead.name}'s follow-up has been completed.`,
              [
                {
                  text: 'OK',
                  onPress: () =>
                    router.replace('/(tabs)'),
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={
          styles.scrollContent
        }
      >
        {/* Header */}

        <View style={styles.header}>
          <Pressable
            style={styles.backIconButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backIcon}>
              ‹
            </Text>
          </Pressable>

          <Text style={styles.headerTitle}>
            Follow-up
          </Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* Student */}

        <View style={styles.studentCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {lead.name
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>

          <Text style={styles.studentName}>
            {lead.name}
          </Text>

          <Text style={styles.phone}>
            {lead.phone}
          </Text>
        </View>

        {/* Follow-up date */}

        <View style={styles.dateCard}>
          <Text style={styles.dateIcon}>
            📅
          </Text>

          <View style={styles.dateInfo}>
            <Text style={styles.dateLabel}>
              Follow-up Date
            </Text>

            <Text style={styles.dateValue}>
              {formattedDate}
            </Text>
          </View>
        </View>

        {/* Status */}

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>
            Status
          </Text>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              Call Back
            </Text>
          </View>
        </View>

        {/* Notes */}

        {lead.notes ? (
          <View style={styles.notesCard}>
            <Text style={styles.infoLabel}>
              Notes
            </Text>

            <Text style={styles.notesText}>
              {lead.notes}
            </Text>
          </View>
        ) : null}

        {/* Actions */}

        <View style={styles.actions}>
          <Pressable
            style={styles.callButton}
            onPress={handleCall}
          >
            <Text style={styles.callButtonText}>
              📞 Call Student
            </Text>
          </Pressable>

          <Pressable
            style={styles.completeButton}
            onPress={handleComplete}
          >
            <Text
              style={
                styles.completeButtonText
              }
            >
              ✓ Mark Follow-up Complete
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 32,
    lineHeight: 32,
    color: '#111827',
    marginTop: -3,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },

  headerSpacer: {
    width: 42,
  },

  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginTop: 10,
  },

  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2563EB',
  },

  studentName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },

  phone: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
  },

  dateCard: {
    marginTop: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  dateIcon: {
    fontSize: 28,
    marginRight: 14,
  },

  dateInfo: {
    flex: 1,
  },

  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },

  dateValue: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '700',
    color: '#2563EB',
  },

  infoCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },

  statusBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },

  notesCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },

  notesText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#374151',
  },

  actions: {
    marginTop: 24,
  },

  callButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },

  callButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  completeButton: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  completeButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },

  errorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },

  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },

  backButton: {
    marginTop: 20,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});