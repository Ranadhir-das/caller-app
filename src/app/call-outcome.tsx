import { InterestedCourseSteps } from '@/components/InterestedCourseSteps';
import { OutcomeWhatsAppEditor } from '@/components/OutcomeWhatsAppEditor';
import { ForwardCounselorModal } from '@/components/ForwardCounselorModal';
import { canOfferForward } from '@/services/counselor';
import { courseLabel, allowsContact, completeInterestedSelection } from '@/services/courses';
import { launchWhatsAppHandoff } from '@/services/whatsapp';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useDialerSession } from '@/context/DialerSessionContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CallDraft, CallPayload, newCallId, readCallDraft, saveCallDraft, patchCallDraft, removeCallDraft } from '@/services/callDrafts';
import { buildOutcomePayload, incompleteInterestedPayload } from '@/services/callOutcome';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareContainer } from '@/components/KeyboardAwareContainer';
import { NoteInputWithVoice } from '@/components/NoteInputWithVoice';

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
  { id: 'all_waiting', label: 'Call Waiting', icon: '\u23F3' },
  { id: 'not_reachable', label: 'Not Reachable', icon: '\uD83D\uDCF5' },
  { id: 'ringing', label: 'Ringing', icon: '\uD83D\uDD14' },
  { id: 'admission_done_by_other_consultancy', label: 'Admission done by other consultancy', icon: '🏛️' },
  { id: 'b2b', label: 'B2B', icon: '💼' },
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
  | 'ALL_WAITING'
  | 'NOT_REACHABLE'
  | 'RINGING'
  | 'ADMISSION_DONE_BY_OTHER_CONSULTANCY'
  | 'B2B';

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
  all_waiting: 'ALL_WAITING',
  not_reachable: 'NOT_REACHABLE',
  ringing: 'RINGING',
  admission_done_by_other_consultancy: 'ADMISSION_DONE_BY_OTHER_CONSULTANCY',
  b2b: 'B2B',
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
  const [selectedCourse, setSelectedCourse] = useState('');
  const [customCourse, setCustomCourse] = useState('');
  const [admissionYear, setAdmissionYear] = useState('');
  const [courseSteps, setCourseSteps] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappTemplate, setWhatsappTemplate] = useState<number>();


  const isCaller = (user?.role || '').toUpperCase() === 'CALLER';
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [hasSelectedTime, setHasSelectedTime] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedCallId, setSavedCallId] = useState<number>();
  // Optional step after a caller saves Interested: offer "Forward to Counselor".
  const [forwardLeadId, setForwardLeadId] = useState<number | null>(null);

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
        const needsCourse = !saved.savedCallId && (incompleteInterestedPayload(saved.payload) ||
          (!saved.payload && saved.outcome === 'interested' && !completeInterestedSelection(
            saved.selectedCourse || '', saved.customCourse || '', saved.admissionYear || '')));
        if (needsCourse && saved.payload) {
          // Keep the same event ID: if an older server accepted this request, it will
          // return a conflict rather than create a duplicate with changed details.
          await patchCallDraft(saved.userId, saved.id, { payload: undefined, outcome: 'interested' });
          saved = { ...saved, payload: undefined, outcome: 'interested' };
        }
        if (active) {
          setSavedCallId(saved.savedCallId);
          setCourseSteps(needsCourse);
          setDraft(saved); setSelectedOutcome(saved.payload?.outcome.toLowerCase() || saved.outcome || ''); setNotes(saved.payload?.notes ?? saved.notes ?? '');
          setSelectedCourse(saved.payload?.selected_course || saved.selectedCourse || '');
          setCustomCourse(saved.payload?.selected_course_custom || saved.customCourse || '');
          setAdmissionYear(String(saved.payload?.expected_admission_year || saved.admissionYear || ''));
          setWhatsappMessage(saved.payload?.whatsapp_message || saved.whatsappMessage || '');
          setWhatsappTemplate(saved.payload?.whatsapp_template || saved.whatsappTemplate);
          if (saved.payload?.callback_at || saved.callbackAt) {
            setFollowUpDate(new Date(saved.payload?.callback_at || saved.callbackAt!));
            setHasSelectedDate(true);
            setHasSelectedTime(true);
          } else {
            setFollowUpDate(null);
            setHasSelectedDate(false);
            setHasSelectedTime(false);
          }
          setLoaded(true);
        }
      } catch (error) { if (active) setDraftError(String(error)); }
    };
    void load();
    return () => { active = false; };
  }, [draft_id, user?.id]);

  useEffect(() => {
    if (!loaded || !draft || draft.payload || savedCallId || saving) return;
    // Coalesce typing; do not queue an AsyncStorage write for every keystroke.
    const timer = setTimeout(() => {
      void patchCallDraft(draft.userId, draft.id, {
        outcome: selectedOutcome, notes, callbackAt: followUpDate?.toISOString(),
        selectedCourse, customCourse, admissionYear, whatsappMessage, whatsappTemplate,
      }).catch(error => { setDraftError('Unable to save edits on this device. Keep this screen open and retry Save.'); console.warn(error); });
    }, 300);
    return () => clearTimeout(timer);
  }, [loaded, selectedOutcome, notes, followUpDate, selectedCourse, customCourse, admissionYear, whatsappMessage, whatsappTemplate, draft?.payload, savedCallId, saving]);

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
    if (outcomeId === 'interested') setCourseSteps(true);
    else { setSelectedCourse(''); setCustomCourse(''); setAdmissionYear(''); }
    setWhatsappMessage(''); setWhatsappTemplate(undefined);

    if (outcomeId !== 'call_back') {
      setFollowUpDate(null);
      setHasSelectedDate(false);
      setHasSelectedTime(false);
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
    setHasSelectedDate(true);

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
    setHasSelectedTime(true);
  };

  const interestedReady = completeInterestedSelection(selectedCourse, customCourse, admissionYear);
  const canSave = !!selectedOutcome && !saving && !savedCallId && !courseSteps &&
    (selectedOutcome !== 'interested' || interestedReady);

  const finish = () => {
    if (draft.direct) { router.replace('/direct-dialer'); return; }
    const nextLead = getNextPendingLead(draft.leadId);
    if (nextLead) router.replace({ pathname: '/dialer', params: { id: nextLead.id } });
    else router.replace('/(tabs)');
  };

  const handleSave = async () => {
    if (saveLock.current || savedCallId) return;
    if (!selectedOutcome) return;
    if (selectedOutcome === 'interested' && !interestedReady) { setCourseSteps(true); return; }

    // Caller mandatory follow-up check whenever follow-up is available
    if (isCaller && allowsContact(selectedOutcome)) {
      if (!followUpDate || !hasSelectedDate) {
        Alert.alert('Follow-up Date Required', 'Please select a follow-up date for this lead.');
        return;
      }
      if (!hasSelectedTime) {
        Alert.alert('Follow-up Time Required', 'Please select a follow-up time for this lead.');
        return;
      }
    }

    // Call back outcome always requires follow-up date and time
    if (!isCaller && selectedOutcome === 'call_back' && (!followUpDate || !hasSelectedDate || !hasSelectedTime)) {
      Alert.alert('Follow-up Required', 'Please select a follow-up date and time.');
      return;
    }
    if (!token) { Alert.alert('Session required', 'Please sign in again. Your draft is kept on this device.'); return; }
    saveLock.current = true;
    setSaving(true);
    setDraftError('');
    let payload: CallPayload;
    try {
      payload = buildOutcomePayload(draft, {
        outcome: outcomeToBackend[selectedOutcome], notes, course: selectedCourse,
        customCourse, year: admissionYear, callbackAt: followUpDate?.toISOString(),
        whatsappMessage, whatsappTemplate,
      });
      // Persist the exact request before sending. Network retries reuse its event ID.
      await patchCallDraft(draft.userId, draft.id, {
        payload, outcome: selectedOutcome, notes, callbackAt: followUpDate?.toISOString(),
        selectedCourse, customCourse, admissionYear, whatsappMessage, whatsappTemplate,
      });
      setDraft({ ...draft, payload });
    } catch (error) {
      Alert.alert('Draft needs attention', `${error instanceof Error ? error.message : 'Could not preserve this draft.'} No request was sent.`);
      saveLock.current = false; setSaving(false); return;
    }

    let saved: {
      id: number; lead: number | null; lead_name: string | null; phone_number: string;
      followup: { scheduled_at: string; status: string } | null;
      selected_course?: string | null; selected_course_custom?: string; expected_admission_year?: number | null;
      course_classification?: string; outcome_points?: number; whatsapp_message?: string;
    };
    try {
      saved = await apiRequest('/calls/', { method: 'POST', body: payload, token });
    } catch (error) {
      // Only a failed API request is reported as an outcome-save failure.
      // A 400 is a definite rejection; timeouts/conflicts keep the frozen payload.
      if (error instanceof ApiError && error.status === 400) {
        setDraft({ ...draft, payload: undefined });
        await patchCallDraft(draft.userId, draft.id, { payload: undefined }).catch(console.warn);
      }
      Alert.alert('Could Not Save Call', `${error instanceof Error ? error.message : 'Please try again.'} Your draft is kept for retry.`);
      saveLock.current = false; setSaving(false); return;
    }

    // Success is final immediately after the API responds. Recording never runs here.
    setSavedCallId(saved.id);
    setDraft({ ...draft, payload, savedCallId: saved.id });
    setSaving(false);
    const mobileStatus = payload.outcome.toLowerCase() as Lead['status'];
    const newCall: CallHistory = {
      id: String(saved.id), leadId: saved.lead == null ? '' : String(saved.lead),
      leadName: saved.lead_name || saved.phone_number || draft.phone,
      phone: saved.phone_number || draft.phone, isExternal: saved.lead == null,
      durationSeconds: payload.duration_seconds, outcome: mobileStatus,
      selectedCourse: saved.selected_course, customCourse: saved.selected_course_custom,
      admissionYear: saved.expected_admission_year, courseClassification: saved.course_classification,
      outcomePoints: saved.outcome_points, whatsappMessage: saved.whatsapp_message,
      notes: payload.notes, calledAt: payload.ended_at,
      followUpDate: saved.followup?.scheduled_at, followUpStatus: saved.followup?.status,
    };
    try {
      addCallHistory(newCall);
      if (!draft.direct) recordCall(mobileStatus as Parameters<typeof recordCall>[0]);
    } catch (error) { console.warn('Outcome saved; local display update pending', error); }

    // Retain existing recording metadata/files for later explicit use. No upload is queued.
    void patchCallDraft(draft.userId, draft.id, { savedCallId: saved.id })
      .then(() => draft.recordingPath ? undefined : removeCallDraft(draft.userId, draft.id))
      .catch(error => console.warn('Outcome saved; local draft cleanup pending', error));
    void refresh().catch(error => console.warn('Outcome saved; refresh pending', error));

    // Forwarding is an optional extra step; it never alters the saved outcome, course, year or points.
    const savedLeadId = saved.lead;
    const proceed = canOfferForward(user, payload.outcome, savedLeadId) && savedLeadId != null
      ? () => setForwardLeadId(savedLeadId)
      : finish;

    if (payload.whatsapp_message) {
      Alert.alert('Outcome saved', 'Open your prepared message in WhatsApp? You must press Send there.', [
        { text: 'Done', onPress: proceed },
        { text: 'Open WhatsApp', onPress: () => { void (async () => {
          try {
            const handoff = await apiRequest<{ phone: string; message: string }>(`/calls/${saved.id}/whatsapp/initiate/`, { token, method: 'POST', body: {} });
            const opened = await launchWhatsAppHandoff(handoff.phone, handoff.message);
            if (!opened.success) Alert.alert('WhatsApp unavailable', opened.error || 'Try again from call history.');
          } catch (error) { Alert.alert('Outcome saved; WhatsApp unavailable', error instanceof Error ? error.message : 'Try again from call history.'); }
          finally { proceed(); }
        })(); } },
      ], { cancelable: false });
    } else {
      Alert.alert('Outcome saved', 'Your call outcome has been saved successfully.', [{ text: 'Continue', onPress: proceed }], { cancelable: false });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareContainer
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
        {draft.payload && !savedCallId ? <Text style={styles.phone}>Submission saved locally. Retry Save with the same details; check history before discarding.</Text> : null}
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
                disabled={saving || !!savedCallId || !!draft.payload}
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

        {courseSteps && <InterestedCourseSteps visible course={selectedCourse} custom={customCourse} year={admissionYear}
          onCancel={() => { setCourseSteps(false); if (!interestedReady) setSelectedOutcome(''); }}
          onComplete={(course, custom, year) => { setSelectedCourse(course); setCustomCourse(custom); setAdmissionYear(year); setCourseSteps(false); }} />}
        {selectedOutcome === 'interested' && <View style={styles.followUpCard}>
          <Text style={styles.sectionTitle}>Interested: {courseLabel(selectedCourse, customCourse)}</Text>
          <Text style={styles.phone}>Expected admission: {admissionYear || 'Select year'}</Text>
          <Pressable disabled={saving || !!savedCallId || !!draft.payload} style={styles.dateButton} onPress={() => setCourseSteps(true)}><Text style={styles.dateButtonText}>Edit course and year</Text></Pressable>
        </View>}
        {allowsContact(selectedOutcome) && <OutcomeWhatsAppEditor message={whatsappMessage} templateId={whatsappTemplate} disabled={saving || !!savedCallId || !!draft.payload}
          values={{ student_name: target.name, name: target.name, phone: target.phone, course: selectedCourse ? courseLabel(selectedCourse, customCourse) : '', year: admissionYear, caller_name: user?.username || '' }}
          onChange={(message, template) => { setWhatsappMessage(message); setWhatsappTemplate(template); }} />}
        {/* Notes */}
        <Text style={styles.sectionTitle}>
          Notes
        </Text>

        <NoteInputWithVoice
          placeholder="Add notes about this call (tap mic to speak)..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          editable={!saving && !savedCallId && !draft.payload}
        />

        {/* Follow-up */}
        {allowsContact(selectedOutcome) && (
          <View style={styles.followUpCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.followUpTitle}>
                📅 Follow-up Date & Time {isCaller && <Text style={{ color: colors.danger }}>*</Text>}
              </Text>
              {isCaller && (
                <View style={{ backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Required</Text>
                </View>
              )}
            </View>

            <Text style={styles.phone}>
              {isCaller
                ? 'Mandatory for callers — select date and time before saving'
                : selectedOutcome === 'call_back'
                ? 'Required for Call Back'
                : 'Optional - leave empty if no reminder is needed'}
            </Text>

            {followUpDate && selectedOutcome !== 'call_back' && !isCaller && (
              <Pressable
                disabled={saving || !!savedCallId || !!draft.payload}
                style={styles.dateButton}
                onPress={() => {
                  setFollowUpDate(null);
                  setHasSelectedDate(false);
                  setHasSelectedTime(false);
                }}
              >
                <Text style={styles.dateButtonText}>Remove follow-up</Text>
              </Pressable>
            )}

            {/* Date */}
            <Pressable
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
              disabled={saving || !!savedCallId || !!draft.payload}
            >
              <Text style={styles.dateButtonText}>
                {followUpDate && hasSelectedDate
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
                if (!followUpDate || !hasSelectedDate) {
                  Alert.alert(
                    'Select Date First',
                    'Please select the follow-up date first.'
                  );
                  return;
                }

                setShowTimePicker(true);
              }}
              disabled={saving || !!savedCallId || !!draft.payload}
            >
              <Text style={styles.dateButtonText}>
                {followUpDate && hasSelectedTime
                  ? formatTime(followUpDate)
                  : 'Select follow-up time'}
              </Text>

              <Text style={styles.calendarIcon}>
                🕐
              </Text>
            </Pressable>

            {followUpDate && hasSelectedDate && hasSelectedTime && (
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

        {selectedOutcome === 'interested' && !interestedReady && <Text style={styles.phone}>Complete Course and Year before saving.</Text>}
        {!!savedCallId && <View style={styles.leadCard}><Text accessibilityRole="alert" style={styles.sectionTitle}>Outcome saved successfully.</Text></View>}
        {/* Save */}
        <Pressable
          style={[
            styles.saveButton,
            !canSave &&
              styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveButtonText}>
            {saving
              ? 'Saving...'
              : savedCallId ? 'Outcome Saved' : 'Save Outcome'}
          </Text>
        </Pressable>
        {!!savedCallId && <Pressable style={styles.dateButton} onPress={finish}><Text style={styles.dateButtonText}>Continue</Text></Pressable>}
      </KeyboardAwareContainer>
      <ForwardCounselorModal
        visible={forwardLeadId != null}
        leadId={forwardLeadId}
        leadName={target.name}
        onForwarded={name => Alert.alert('Forwarded', `Lead forwarded to ${name}.`)}
        onClose={() => { setForwardLeadId(null); finish(); }}
      />
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
