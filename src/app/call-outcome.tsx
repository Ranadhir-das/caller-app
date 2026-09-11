import { getStoredToken } from '@/services/auth';
import { useDialerSession } from '@/context/DialerSessionContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';

import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeads } from '@/context/LeadContext';
import { apiRequest } from '@/services/api';

import { CallHistory, Lead } from '@/types';

const outcomes = [
  { id: 'interested', label: 'Interested', icon: '👍' },
  { id: 'not_interested', label: 'Not Interested', icon: '👎' },
  { id: 'no_answer', label: 'No Answer', icon: '📵' },
  { id: 'busy', label: 'Busy', icon: '📞' },
  { id: 'call_back', label: 'Call Back', icon: '🔄' },
  { id: 'wrong_number', label: 'Wrong Number', icon: '❌' },
];

type BackendOutcome =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'CALL_BACK'
  | 'WRONG_NUMBER';

const outcomeToBackend: Record<string, BackendOutcome> = {
  interested: 'INTERESTED',
  not_interested: 'NOT_INTERESTED',
  no_answer: 'NO_ANSWER',
  busy: 'BUSY',
  call_back: 'CALL_BACK',
  wrong_number: 'WRONG_NUMBER',
};

export default function CallOutcomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    leads,
    updateLead,
    addCallHistory,
    getNextPendingLead,
  } = useLeads();

  const { recordCall } = useDialerSession();

  const lead = leads.find((item) => item.id === id);

  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [notes, setNotes] = useState('');

  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [saving, setSaving] = useState(false);

  if (!lead) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorTitle}>Lead not found</Text>

        <AnimatedBackButton
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </AnimatedBackButton>
      </SafeAreaView>
    );
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleOutcomeChange = (outcomeId: string) => {
    setSelectedOutcome(outcomeId);

    if (outcomeId !== 'call_back') {
      setFollowUpDate(null);
      setShowDatePicker(false);
      setShowTimePicker(false);
    }
  };

  const handleDateChange = (
    event: unknown,
    selectedDate?: Date
  ) => {
    setShowDatePicker(false);

    if (!selectedDate) {
      return;
    }

    const currentDate = followUpDate || new Date();

    // Preserve the existing selected time when changing date.
    selectedDate.setHours(
      currentDate.getHours(),
      currentDate.getMinutes(),
      0,
      0
    );

    setFollowUpDate(selectedDate);

    // After selecting a date, open time picker.
    setShowTimePicker(true);
  };

  const handleTimeChange = (
    event: unknown,
    selectedTime?: Date
  ) => {
    setShowTimePicker(false);

    if (!selectedTime) {
      return;
    }

    const currentDate = followUpDate || new Date();

    currentDate.setHours(
      selectedTime.getHours(),
      selectedTime.getMinutes(),
      0,
      0
    );

    setFollowUpDate(new Date(currentDate));
  };

  const handleSave = async () => {
    if (!selectedOutcome) {
      Alert.alert(
        'Select Outcome',
        'Please select what happened during the call.'
      );
      return;
    }

    if (
      selectedOutcome === 'call_back' &&
      !followUpDate
    ) {
      Alert.alert(
        'Follow-up Required',
        'Please select both a follow-up date and time.'
      );
      return;
    }

    if (saving) {
      return;
    }

    setSaving(true);

    try {
      const backendOutcome =
        outcomeToBackend[selectedOutcome];

      if (!backendOutcome) {
        throw new Error('Invalid call outcome.');
      }

      /*
       * Django expects the lead ID as an integer.
       */
      const leadId = Number(lead.id);

      if (!Number.isInteger(leadId)) {
        throw new Error('Invalid lead ID.');
      }

      /*
       * Build the Call API request.
       *
       * Django will:
       * 1. Create the Call
       * 2. Attach it to the logged-in caller
       * 3. Update the Lead status
       * 4. Create FollowUp when outcome = CALL_BACK
       */
      const callPayload: {
        lead: number;
        outcome: BackendOutcome;
        notes: string;
        callback_at?: string;
      } = {
        lead: leadId,
        outcome: backendOutcome,
        notes: notes.trim(),
      };

      if (
        selectedOutcome === 'call_back' &&
        followUpDate
      ) {
        /*
         * toISOString() converts the local Date to UTC.
         * Django will parse the datetime correctly.
         */
        callPayload.callback_at =
          followUpDate.toISOString();
      }

      console.log(
        'Creating call in Django:',
        callPayload
      );

      /*
       * IMPORTANT:
       * This is now the main source of truth for calls.
       */
      const token = await getStoredToken();

      if (!token) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        );
      }

      await apiRequest('/calls/', {
        method: 'POST',
        body: callPayload,
        token,
      });
      /*
       * The backend has already updated the lead status.
       *
       * We update the local LeadContext as well so the
       * current mobile session immediately reflects the
       * new status without requiring a full reload.
       *
       * NOTE:
       * updateLead currently also sends a PATCH request.
       * We will remove that duplicate request in the next
       * LeadContext cleanup step.
       */
      const mobileStatus =
        selectedOutcome as Lead['status'];

      const savedFollowUpDate = followUpDate
        ? `${followUpDate.getFullYear()}-${String(
            followUpDate.getMonth() + 1
          ).padStart(2, '0')}-${String(
            followUpDate.getDate()
          ).padStart(2, '0')}`
        : undefined;

      await updateLead(lead.id, {
        status: mobileStatus,
        notes: notes.trim(),
        ...(savedFollowUpDate
          ? {
              followUpDate: savedFollowUpDate,
            }
          : {
              followUpDate: undefined,
            }),
      });

      /*
       * Keep local call history working for the existing
       * mobile History screen.
       *
       * Later we can change History to read directly
       * from Django.
       */
      const newCall: CallHistory = {
        id: `${lead.id}-${Date.now()}`,
        leadId: lead.id,
        leadName: lead.name,
        phone: lead.phone,
        outcome: mobileStatus,
        notes: notes.trim(),
        calledAt: new Date().toISOString(),

        ...(savedFollowUpDate
          ? {
              followUpDate: savedFollowUpDate,
            }
          : {}),
      };

      addCallHistory(newCall);

      /*
       * Keep the existing dialer session behaviour.
       */
      recordCall(
        selectedOutcome as Parameters<
          typeof recordCall
        >[0]
      );

      console.log(
        'Call successfully saved in Django:',
        newCall
      );

      /*
       * Find the next pending student.
       */
      const nextLead =
        getNextPendingLead(lead.id);

      if (nextLead) {
        router.replace({
          pathname: '/dialer',
          params: {
            id: nextLead.id,
          },
        });
      } else {
        Alert.alert(
          'All Students Completed',
          'There are no more pending students.',
          [
            {
              text: 'OK',
              onPress: () =>
                router.replace('/(tabs)'),
            },
          ]
        );
      }
    } catch (error) {
      console.error(
        'Failed to save call:',
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save the call. Please try again.';

      Alert.alert(
        'Could Not Save Call',
        message
      );
    } finally {
      setSaving(false);
    }
  };

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
            onPress={() => router.back()}
          >
            <Text style={styles.backIcon}>‹</Text>
          </AnimatedBackButton>

          <Text style={styles.headerTitle}>
            Call Outcome
          </Text>

          <View style={styles.headerSpace} />
        </View>

        {/* Lead information */}
        <View style={styles.leadCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {lead.name
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>

          <View style={styles.leadInfo}>
            <Text style={styles.leadName}>
              {lead.name}
            </Text>

            <Text style={styles.phone}>
              {lead.phone}
            </Text>
          </View>
        </View>

        {/* Outcome */}
        <Text style={styles.sectionTitle}>
          What happened?
        </Text>

        <View style={styles.outcomeGrid}>
          {outcomes.map((outcome) => {
            const selected =
              selectedOutcome === outcome.id;

            return (
              <Pressable
                key={outcome.id}
                style={[
                  styles.outcomeCard,
                  selected &&
                    styles.outcomeCardSelected,
                ]}
                onPress={() =>
                  handleOutcomeChange(
                    outcome.id
                  )
                }
                disabled={saving}
              >
                <Text style={styles.outcomeIcon}>
                  {outcome.icon}
                </Text>

                <Text
                  style={[
                    styles.outcomeText,
                    selected &&
                      styles.outcomeTextSelected,
                  ]}
                >
                  {outcome.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>
          Notes
        </Text>

        <TextInput
          style={styles.notesInput}
          placeholder="Add notes about this call..."
          placeholderTextColor="#999"
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
          editable={!saving}
        />

        {/* Follow-up */}
        {selectedOutcome === 'call_back' && (
          <View style={styles.followUpCard}>
            <Text style={styles.followUpTitle}>
              📅 Follow-up Date & Time
            </Text>

            {/* Date */}
            <Pressable
              style={styles.dateButton}
              onPress={() =>
                setShowDatePicker(true)
              }
              disabled={saving}
            >
              <Text style={styles.dateButtonText}>
                {followUpDate
                  ? formatDate(followUpDate)
                  : 'Select follow-up date'}
              </Text>

              <Text style={styles.calendarIcon}>
                📅
              </Text>
            </Pressable>

            {/* Time */}
            <Pressable
              style={[
                styles.dateButton,
                styles.timeButton,
              ]}
              onPress={() => {
                if (!followUpDate) {
                  Alert.alert(
                    'Select Date First',
                    'Please select the follow-up date first.'
                  );
                  return;
                }

                setShowTimePicker(true);
              }}
              disabled={saving}
            >
              <Text style={styles.dateButtonText}>
                {followUpDate
                  ? formatTime(followUpDate)
                  : 'Select follow-up time'}
              </Text>

              <Text style={styles.calendarIcon}>
                🕐
              </Text>
            </Pressable>

            {followUpDate && (
              <Text style={styles.followUpPreview}>
                Follow-up:
                {' '}
                {formatDate(followUpDate)}
                {' at '}
                {formatTime(followUpDate)}
              </Text>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={
                  followUpDate || new Date()
                }
                mode="date"
                display={
                  Platform.OS === 'android'
                    ? 'default'
                    : 'spinner'
                }
                minimumDate={new Date()}
                onChange={handleDateChange}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={
                  followUpDate || new Date()
                }
                mode="time"
                display={
                  Platform.OS === 'android'
                    ? 'default'
                    : 'spinner'
                }
                onChange={handleTimeChange}
              />
            )}
          </View>
        )}

        {/* Save */}
        <Pressable
          style={[
            styles.saveButton,
            (!selectedOutcome || saving) &&
              styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!selectedOutcome || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving
              ? 'Saving...'
              : 'Save Outcome'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  content: {
    padding: 20,
    paddingBottom: 30,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  backCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 28,
    color: '#222',
    marginTop: -3,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
  },

  headerSpace: {
    width: 38,
  },

  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    fontSize: 21,
    fontWeight: '700',
    color: '#2563EB',
  },

  leadInfo: {
    flex: 1,
  },

  leadName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },

  phone: {
    fontSize: 14,
    color: '#333',
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 9,
  },

  outcomeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 17,
  },

  outcomeCard: {
    width: '48%',
    minHeight: 65,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  outcomeCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },

  outcomeIcon: {
    fontSize: 19,
    marginRight: 7,
  },

  outcomeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
  },

  outcomeTextSelected: {
    color: '#2563EB',
  },

  notesInput: {
    minHeight: 82,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    padding: 12,
    fontSize: 14,
    color: '#222',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
  },

  followUpCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 13,
    padding: 12,
    marginBottom: 14,
  },

  followUpTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C2410C',
    marginBottom: 8,
  },

  dateButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  timeButton: {
    marginTop: 8,
  },

  dateButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },

  calendarIcon: {
    fontSize: 18,
  },

  followUpPreview: {
    marginTop: 9,
    fontSize: 13,
    color: '#9A3412',
    fontWeight: '600',
  },

  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    backgroundColor: '#AFC3E8',
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 50,
    color: '#111',
  },

  backButton: {
    backgroundColor: '#2563EB',
    marginHorizontal: 30,
    marginTop: 20,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },

  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});