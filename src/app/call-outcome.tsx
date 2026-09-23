import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useDialerSession } from '@/context/DialerSessionContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CallDraft, CallPayload, newCallId, readCallDraft, saveCallDraft, patchCallDraft, removeCallDraft } from '@/services/callDrafts';
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
import { apiRequest, ApiError } from '@/services/api';

import { CallHistory, Lead } from '@/types';

const outcomes = [
  { id: 'interested', label: 'Interested', icon: '👍' },
  { id: 'not_interested', label: 'Not Interested', icon: '👎' },
  { id: 'no_answer', label: 'No Answer', icon: '📵' },
  { id: 'busy', label: 'Busy', icon: '📞' },
  { id: 'call_back', label: 'Call Back', icon: '🔄' },
  { id: 'wrong_number', label: 'Wrong Number', icon: '❌' },
  { id: 'forwarded_calls', label: 'Forwarded Calls', icon: '\u2197' },
  { id: 'no_candidate', label: 'No Candidate', icon: '\uD83D\uDC64' },
  { id: 'disconnected', label: 'Disconnected', icon: '\uD83D\uDCF4' },
  { id: 'admission_done', label: 'Admission Done', icon: '\uD83C\uDF93' },
  { id: 'all_waiting', label: 'Call Waiting', icon: '\u23F3' },
  { id: 'not_reachable', label: 'Not Reachable', icon: '\uD83D\uDCF5' },
  { id: 'ringing', label: 'Ringing', icon: '\uD83D\uDD14' },
];

type BackendOutcome =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'CALL_BACK'
  | 'WRONG_NUMBER'
  | 'FORWARDED_CALLS'
  | 'NO_CANDIDATE'
  | 'DISCONNECTED'
  | 'ADMISSION_DONE'
  | 'ALL_WAITING'
  | 'NOT_REACHABLE'
  | 'RINGING';

const outcomeToBackend: Record<string, BackendOutcome> = {
  interested: 'INTERESTED',
  not_interested: 'NOT_INTERESTED',
  no_answer: 'NO_ANSWER',
  busy: 'BUSY',
  call_back: 'CALL_BACK',
  wrong_number: 'WRONG_NUMBER',
  forwarded_calls: 'FORWARDED_CALLS',
  no_candidate: 'NO_CANDIDATE',
  disconnected: 'DISCONNECTED',
  admission_done: 'ADMISSION_DONE',
  all_waiting: 'ALL_WAITING',
  not_reachable: 'NOT_REACHABLE',
  ringing: 'RINGING',
};

export default function CallOutcomeScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const {
    id,
    started_at,
    ended_at,
    duration_seconds,
    draft_id,
  } = useLocalSearchParams<{
    id?: string;
    draft_id?: string;
    started_at?: string;
    ended_at?: string;
    duration_seconds?: string;
  }>();

  const {
    leads,
    refresh,
    addCallHistory,
    getNextPendingLead,
  } = useLeads();

  const { recordCall } = useDialerSession();

  const { user, token } = useAuth();
  const [draft, setDraft] = useState<CallDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draftError, setDraftError] = useState('');
  const saveLock = useRef(false);
  const legacyId = useRef(newCallId());
  const lead = leads.find((item) => item.id === (draft?.leadId || id));
  const target = draft ? { name: draft.name, phone: draft.phone } : lead;

  const [selectedOutcome, setSelectedOutcome] = useState('');
  const [notes, setNotes] = useState('');

  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user) return;
      try {
        let saved = draft_id ? await readCallDraft(user.id, draft_id) : null;
        if (draft_id && !saved) throw new Error('This outcome draft is no longer available. Check call history.');
        if (!saved && lead && started_at && ended_at) {
          saved = { id: legacyId.current, userId: user.id, leadId: lead.id, phone: lead.phone,
            name: lead.name, direct: false, startedAt: started_at, endedAt: ended_at,
            durationSeconds: Number(duration_seconds || 0) };
          await saveCallDraft(saved);
        }
        if (!saved) throw new Error('Call timing information is missing. Return to the dialer.');
        if (active) {
          setDraft(saved); setSelectedOutcome(saved.outcome || ''); setNotes(saved.notes || '');
          setFollowUpDate(saved.callbackAt ? new Date(saved.callbackAt) : null); setLoaded(true);
        }
      } catch (error) { if (active) setDraftError(String(error)); }
    };
    void load();
    return () => { active = false; };
  }, [draft_id, user?.id]);

  useEffect(() => {
    if (!loaded || !draft || draft.payload) return;
    void patchCallDraft(draft.userId, draft.id, {
      outcome: selectedOutcome, notes, callbackAt: followUpDate?.toISOString(),
    }).catch(error => { setDraftError('Unable to save edits on this device. Keep this screen open and retry Save.'); console.error(error); });
  }, [loaded, selectedOutcome, notes, followUpDate, draft?.payload]);

  if (!loaded || !target || !draft) {
    return <SafeAreaView style={styles.container}>
      <Text style={styles.errorTitle}>{draftError || 'Loading call outcome...'}</Text>
      <AnimatedBackButton style={styles.backButton} onPress={() => router.replace('/direct-dialer')}>
        <Text style={styles.backButtonText}>Back to Dialer</Text>
      </AnimatedBackButton>
    </SafeAreaView>;
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
    if (saveLock.current) return;
    if (!selectedOutcome) { Alert.alert('Select Outcome', 'Please select what happened during the call.'); return; }
    if (selectedOutcome === 'call_back' && !followUpDate) {
      Alert.alert('Follow-up Required', 'Please select a follow-up date and time.'); return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      if (!draft.startedAt || !draft.endedAt || !Number.isFinite(draft.durationSeconds) || draft.durationSeconds! < 0) {
        throw new Error('Complete call timing is unavailable. This draft is retained for review.');
      }
      const payload: CallPayload = draft.payload || {
        client_event_id: draft.id,
        phone_number: draft.phone,
        ...(draft.leadId ? { lead: Number(draft.leadId) } : {}),
        started_at: draft.startedAt, ended_at: draft.endedAt,
        duration_seconds: Math.round(draft.durationSeconds!),
        outcome: outcomeToBackend[selectedOutcome], notes: notes.trim(),
        ...(selectedOutcome === 'call_back' && followUpDate ? { callback_at: followUpDate.toISOString() } : {}),
      };
      // Freeze the first submitted payload: a timeout may mean the server already saved it.
      await patchCallDraft(draft.userId, draft.id, {
        payload, outcome: selectedOutcome, notes, callbackAt: followUpDate?.toISOString(),
      });
      setDraft({ ...draft, payload });
      if (!token) throw new Error('Please log in again. Your call draft is saved on this device.');
      const saved = await apiRequest<{
        id: number; lead: number | null; lead_name: string | null; phone_number: string;
        followup: { scheduled_at: string; status: string } | null;
      }>('/calls/', { method: 'POST', body: payload, token });
      const mobileStatus = payload.outcome.toLowerCase() as Lead['status'];
      const newCall: CallHistory = {
        id: String(saved.id), leadId: saved.lead == null ? '' : String(saved.lead),
        leadName: saved.lead_name || saved.phone_number || draft.phone,
        phone: saved.phone_number || draft.phone, isExternal: saved.lead == null,
        durationSeconds: payload.duration_seconds, outcome: mobileStatus,
        notes: payload.notes, calledAt: payload.ended_at,
        followUpDate: saved.followup?.scheduled_at, followUpStatus: saved.followup?.status,
      };
      addCallHistory(newCall);
      // No second status PATCH: the call endpoint owns the lead/outcome transaction.
      await refresh();
      await removeCallDraft(draft.userId, draft.id);
      if (!draft.direct) recordCall(mobileStatus as Parameters<typeof recordCall>[0]);
      if (draft.direct) { router.replace('/direct-dialer'); return; }
      const nextLead = getNextPendingLead(draft.leadId);
      if (nextLead) router.replace({ pathname: '/dialer', params: { id: nextLead.id } });
      else router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to save call:', error);
      // A validation rejection did not create a call. Allow correcting its fields.
      // Timeouts, server errors and conflict responses must retain the original payload.
      if (error instanceof ApiError && error.status === 400) {
        try {
          await patchCallDraft(draft.userId, draft.id, { payload: undefined });
          setDraft({ ...draft, payload: undefined });
        } catch (storageError) { console.error('Call draft:', storageError); }
      }
      Alert.alert('Could Not Save Call', `${error instanceof Error ? error.message : 'Please try again.'}\nYour draft is retained. Retry Save or reopen it from Direct Dialer.`);
    } finally { saveLock.current = false; setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <AnimatedBackButton
            style={styles.backCircle}
            onPress={() => router.replace('/direct-dialer')}
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
              {target.name
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>

          <View style={styles.leadInfo}>
            <Text style={styles.leadName}>
              {target.name}
            </Text>

            <Text style={styles.phone}>
              {target.phone}
            </Text>
          </View>
        </View>

        {draftError ? <Text style={styles.errorTitle}>{draftError}</Text> : null}
        <Text style={styles.phone}>{draft.leadId ? 'Lead Call' : 'Direct Call'} • {draft.durationSeconds ?? 0}s</Text>
        {draft.payload ? <Text style={styles.phone}>Submission saved locally. Retry Save with the same details; check history before discarding.</Text> : null}
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
                accessibilityRole="button"
                accessibilityLabel={outcome.label}
                accessibilityState={{ selected, disabled: saving }}
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
                disabled={saving || !!draft.payload}
              >
                <Text style={styles.outcomeIcon} accessible={false}>{outcome.icon}</Text>
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

        <TextInput keyboardAppearance={mode}
          style={styles.notesInput}
          placeholder="Add notes about this call..."
          placeholderTextColor={colors.placeholder}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
          editable={!saving && !draft.payload}
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
              disabled={saving || !!draft.payload}
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
              disabled={saving || !!draft.payload}
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
              <DateTimePicker themeVariant={mode}
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
              <DateTimePicker themeVariant={mode}
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

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  backCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 28,
    color: colors.text,
    marginTop: -3,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  headerSpace: {
    width: 38,
  },

  leadCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    fontSize: 21,
    fontWeight: '700',
    color: colors.accent,
  },

  leadInfo: {
    flex: 1,
  },

  leadName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },

  phone: {
    fontSize: 14,
    color: colors.secondary,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },

  outcomeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  outcomeCard: {
    width: '48.8%',
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: 9,
    paddingVertical: 6,
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },

  outcomeCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },

  outcomeIcon: {
    fontSize: 17,
    marginRight: 6,
  },

  outcomeText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.secondary,
    textAlign: 'center',
  },

  outcomeTextSelected: {
    color: colors.accent,
  },

  notesInput: {
    height: 60,
    backgroundColor: colors.surface,
    borderRadius: 13,
    padding: 10,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },

  followUpCard: {
    backgroundColor: colors.orangeSoft,
    borderRadius: 13,
    padding: 12,
    marginBottom: 14,
  },

  followUpTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.orange,
    marginBottom: 8,
  },

  dateButton: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.secondary,
    fontWeight: '500',
  },

  calendarIcon: {
    color: colors.text,
    fontSize: 18,
  },

  followUpPreview: {
    marginTop: 9,
    fontSize: 13,
    color: colors.orange,
    fontWeight: '600',
  },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveButtonDisabled: {
    backgroundColor: colors.disabled,
  },

  saveButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 50,
    color: colors.text,
  },

  backButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 30,
    marginTop: 20,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },

  backButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
});
