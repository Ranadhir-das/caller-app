import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { WhatsAppModal } from '@/components/WhatsAppModal';
import CallstateModule, { CallState } from '../../modules/callstate/src/CallstateModule';
import {
  COUNSELOR_TEAL,
  counselorApi,
  formatContactTime,
  formatDuration,
  type CounselorLeadDetail,
} from '@/services/counselor';
import { relativeDate } from '@/components/counselor/ui';

export default function CounselorLeadDetailScreen() {
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const { token, user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const leadId = params.id;

  const [detail, setDetail] = useState<CounselorLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showAdmissionModal, setShowAdmissionModal] = useState(false);
  const [admissionMessage, setAdmissionMessage] = useState('');
  const [submittingAdmission, setSubmittingAdmission] = useState(false);

  // Call tracking refs
  const callStartedAtRef = useRef<string | null>(null);
  const callEndedAtRef = useRef<string | null>(null);
  const callDurationRef = useRef<number>(0);
  const hasSeenOffhookRef = useRef(false);
  const callWasStartedRef = useRef(false);
  const callRequestedRef = useRef(false);
  const outcomeAlreadyOpenedRef = useRef(false);
  const listenerRef = useRef<any>(null);
  const appStateRef = useRef(AppState.currentState);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!token || !leadId) return;
    try {
      const data = await counselorApi.lead(token, leadId);
      setDetail(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load student details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, leadId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // --------------------------------------------------
  // CALL STATE LISTENER
  // --------------------------------------------------
  const finishCallAndOpenNote = () => {
    if (outcomeAlreadyOpenedRef.current || !detail) return;
    outcomeAlreadyOpenedRef.current = true;

    if (!callEndedAtRef.current) {
      callEndedAtRef.current = new Date().toISOString();
      if (callStartedAtRef.current) {
        const start = new Date(callStartedAtRef.current).getTime();
        const end = new Date(callEndedAtRef.current).getTime();
        callDurationRef.current = Math.max(0, Math.round((end - start) / 1000));
      }
    }

    router.push({
      pathname: '/counselor-note' as never,
      params: {
        leadId: String(detail.lead.id),
        leadName: detail.lead.name,
        phone: detail.lead.phone,
        started_at: callStartedAtRef.current || '',
        ended_at: callEndedAtRef.current || '',
        duration_seconds: String(callDurationRef.current),
      },
    } as never);
  };

  useEffect(() => {
    mountedRef.current = true;
    try {
      CallstateModule.startMonitoring();
    } catch (e) {
      console.warn('CallstateModule monitor error:', e);
    }

    listenerRef.current = CallstateModule.addListener('onCallStateChanged', (event) => {
      if (event.state === 'OFFHOOK' && callRequestedRef.current) {
        hasSeenOffhookRef.current = true;
        callWasStartedRef.current = true;
        if (!callStartedAtRef.current) {
          callStartedAtRef.current = new Date().toISOString();
        }
      } else if (event.state === 'IDLE') {
        if (hasSeenOffhookRef.current || callWasStartedRef.current) {
          finishCallAndOpenNote();
        }
      }
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current !== 'active';
      appStateRef.current = nextState;

      if (wasBackground && nextState === 'active') {
        try {
          const state = CallstateModule.getCurrentState();
          if (state === 'IDLE' && (hasSeenOffhookRef.current || callWasStartedRef.current)) {
            finishCallAndOpenNote();
          }
        } catch (e) {
          console.warn('AppState check state error:', e);
        }
      }
    });

    return () => {
      mountedRef.current = false;
      if (listenerRef.current) {
        listenerRef.current.remove?.();
      }
      subscription.remove();
    };
  }, [detail]);

  const requestCallPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      ]);
      return (
        result[PermissionsAndroid.PERMISSIONS.CALL_PHONE] === PermissionsAndroid.RESULTS.GRANTED &&
        result[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  };

  const handleStartCall = async () => {
    if (!detail?.lead.phone) return;
    const ok = await requestCallPermission();
    if (!ok) {
      Alert.alert('Permission Required', 'Call and Phone permissions are required to dial the student.');
      return;
    }

    callStartedAtRef.current = null;
    callEndedAtRef.current = null;
    callDurationRef.current = 0;
    hasSeenOffhookRef.current = false;
    callWasStartedRef.current = false;
    callRequestedRef.current = true;
    outcomeAlreadyOpenedRef.current = false;

    try {
      CallstateModule.startMonitoring();
      CallstateModule.startCall(detail.lead.phone);
    } catch (err) {
      Alert.alert('Call Failed', err instanceof Error ? err.message : 'Could not place the call.');
      callRequestedRef.current = false;
    }
  };

  const handleRequestAdmission = async () => {
    if (!token || !leadId || submittingAdmission) return;
    setSubmittingAdmission(true);
    try {
      await counselorApi.requestAdmission(token, leadId, admissionMessage);
      setShowAdmissionModal(false);
      setAdmissionMessage('');
      Alert.alert('Request Sent', 'Your admission request has been submitted for Admin/Manager review.');
      void load();
    } catch (err) {
      Alert.alert('Request Failed', err instanceof Error ? err.message : 'Please check your connection and try again.');
    } finally {
      setSubmittingAdmission(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COUNSELOR_TEAL} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Lead Not Found</Text>
          <Text style={styles.errorText}>
            {error || 'This lead is not actively forwarded to you or no longer exists.'}
          </Text>
          <AnimatedBackButton style={styles.backButton} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const { lead, interested, caller, assignment, calls, counsellings, counselor_notes, admission_requests, has_pending_admission_request } = detail;
  const contactStatus = detail.counselor_contact_status ?? detail.lead.counselor_contact_status ?? 'PENDING';
  const isContacted = contactStatus === 'CONTACTED';
  const lastContactedAt = detail.last_contacted_at ?? detail.lead.last_contacted_at;
  const lastDuration = detail.last_call_duration ?? detail.lead.last_call_duration;
  const callCount = detail.counselor_call_count ?? detail.lead.counselor_call_count ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={COUNSELOR_TEAL} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <AnimatedBackButton style={styles.backCircle} onPress={() => router.back()}>
            <Text style={styles.backIcon}>‹</Text>
          </AnimatedBackButton>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{lead.name}</Text>
            <Text style={styles.headerSubtitle}>
              Forwarded by {caller.forwarded_by_name || caller.name || 'Caller'} • {relativeDate(assignment.forwarded_at)}
            </Text>
          </View>
        </View>

        {/* Contact Status Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.itemLabel}>Contact Status</Text>
              <View style={{ marginTop: 4 }}>
                <View style={isContacted ? styles.contactDoneBadge : styles.contactPendingBadge}>
                  <Text style={isContacted ? styles.contactDoneBadgeText : styles.contactPendingBadgeText}>
                    {isContacted ? 'CONTACTED' : 'PENDING'}
                  </Text>
                </View>
              </View>
            </View>
            {isContacted ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.itemLabel}>Calls</Text>
                <Text style={[styles.itemValue, { fontSize: 18, fontWeight: '800', color: COUNSELOR_TEAL }]}>
                  {callCount}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.divider} />

          {isContacted ? (
            <View style={styles.grid}>
              <View style={styles.gridItem}>
                <Text style={styles.itemLabel}>Last contacted</Text>
                <Text style={styles.itemValue}>{formatContactTime(lastContactedAt)}</Text>
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.itemLabel}>Last call</Text>
                <Text style={styles.itemValue}>
                  {lastDuration != null ? formatDuration(lastDuration) : '–'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              <Text style={[styles.itemValue, { color: colors.muted, fontSize: 14 }]}>
                Never contacted
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Forwarded by {caller.forwarded_by_name || caller.name || 'Caller'} • Tap Call Student to initiate counselling.
              </Text>
            </View>
          )}
        </View>

        {/* Lead Identity Card */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.studentName}>{lead.name}</Text>
              <Text style={styles.studentPhone}>{lead.phone}</Text>
              {lead.email ? <Text style={styles.metaText}>{lead.email}</Text> : null}
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{lead.status_display}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.grid}>
            {lead.location ? (
              <View style={styles.gridItem}>
                <Text style={styles.itemLabel}>Location</Text>
                <Text style={styles.itemValue}>{lead.location}</Text>
              </View>
            ) : null}
            {lead.college ? (
              <View style={styles.gridItem}>
                <Text style={styles.itemLabel}>College</Text>
                <Text style={styles.itemValue}>{lead.college}</Text>
              </View>
            ) : null}
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Lead Source</Text>
              <Text style={styles.itemValue}>{lead.source || 'Direct'}</Text>
            </View>
            {lead.service ? (
              <View style={styles.gridItem}>
                <Text style={styles.itemLabel}>Service</Text>
                <Text style={styles.itemValue}>{lead.service}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Interested Details (from Interested Call) */}
        <View style={styles.tealCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.tealCardEyebrow}>INTERESTED COURSE & YEAR</Text>
            <Text style={styles.lockBadge}>Read Only</Text>
          </View>
          <Text style={styles.courseValue}>
            {interested?.course_label || 'Course not selected'}
          </Text>
          <Text style={styles.yearValue}>
            Expected Admission Year: {interested?.expected_admission_year || 'Not recorded'}
          </Text>
          <Text style={styles.callerNotice}>
            Assigned caller: {caller.name || 'Unassigned'} • Outcome points and caller ownership are preserved.
          </Text>
        </View>

        {/* Caller Notes */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionHeading}>Caller & Lead Notes</Text>
            <Text style={styles.lockBadge}>Read Only</Text>
          </View>
          <Text style={styles.notesBody}>
            {lead.notes || 'No general notes recorded on this lead.'}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call Student"
            style={[styles.actionBtn, styles.callBtn]}
            onPress={handleStartCall}
          >
            <Text style={styles.actionBtnIcon}>📞</Text>
            <Text style={styles.actionBtnText}>Call Student</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="WhatsApp Student"
            style={[styles.actionBtn, styles.whatsappBtn]}
            onPress={() => setShowWhatsApp(true)}
          >
            <Text style={styles.actionBtnIcon}>💬</Text>
            <Text style={[styles.actionBtnText, { color: colors.text }]}>WhatsApp</Text>
          </Pressable>
        </View>

        <View style={styles.actionsContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Consultation Note"
            style={[styles.actionBtn, styles.noteBtn]}
            onPress={() => {
              router.push({
                pathname: '/counselor-note' as never,
                params: {
                  leadId: String(lead.id),
                  leadName: lead.name,
                  phone: lead.phone,
                },
              } as never);
            }}
          >
            <Text style={styles.actionBtnIcon}>📝</Text>
            <Text style={styles.actionBtnText}>Add Note</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Request Admission"
            style={[
              styles.actionBtn,
              styles.admissionBtn,
              has_pending_admission_request && styles.actionBtnDisabled,
            ]}
            disabled={has_pending_admission_request}
            onPress={() => setShowAdmissionModal(true)}
          >
            <Text style={styles.actionBtnIcon}>🎓</Text>
            <Text style={styles.actionBtnText}>
              {has_pending_admission_request ? 'Admission Pending' : 'Request Admission'}
            </Text>
          </Pressable>
        </View>

        {/* Counselor Private Notes */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionHeading}>My Consultation Notes</Text>
            <Text style={styles.privateBadge}>Private to You</Text>
          </View>
          {counselor_notes.length === 0 ? (
            <Text style={styles.emptyText}>No consultation notes recorded yet.</Text>
          ) : (
            counselor_notes.map((note) => (
              <View key={note.id} style={styles.timelineItem}>
                <View style={styles.timelineHeader}>
                  <View style={styles.rowCenter}>
                    <Text style={styles.noteKindPill}>{note.kind_display}</Text>
                    {note.duration_seconds > 0 ? (
                      <Text style={styles.noteDuration}>({formatDuration(note.duration_seconds)})</Text>
                    ) : null}
                  </View>
                  <Text style={styles.timelineTime}>{relativeDate(note.created_at)}</Text>
                </View>
                <Text style={styles.noteContent}>{note.body}</Text>
              </View>
            ))
          )}
        </View>

        {/* Admission Requests */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Admission Requests</Text>
          {admission_requests.length === 0 ? (
            <Text style={styles.emptyText}>No admission requests submitted yet.</Text>
          ) : (
            admission_requests.map((req) => (
              <View key={req.id} style={styles.timelineItem}>
                <View style={styles.timelineHeader}>
                  <Text
                    style={[
                      styles.statusBadge,
                      req.status === 'APPROVED'
                        ? styles.approvedBadge
                        : req.status === 'REJECTED'
                        ? styles.rejectedBadge
                        : styles.pendingBadge,
                    ]}
                  >
                    {req.status_display}
                  </Text>
                  <Text style={styles.timelineTime}>{relativeDate(req.created_at)}</Text>
                </View>
                {req.message ? <Text style={styles.reqMessage}>{req.message}</Text> : null}
                {req.review_note ? (
                  <Text style={styles.reviewNote}>
                    Review note: {req.review_note} {req.reviewed_at ? `(${relativeDate(req.reviewed_at)})` : ''}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Previous Calls & Outlines */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>Caller History</Text>
          {calls.length === 0 ? (
            <Text style={styles.emptyText}>No previous calls recorded.</Text>
          ) : (
            calls.map((call) => (
              <View key={call.id} style={styles.timelineItem}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.callOutcomeText}>{call.outcome_display}</Text>
                  <Text style={styles.timelineTime}>{relativeDate(call.started_at)}</Text>
                </View>
                <Text style={styles.metaText}>
                  Caller: {call.caller_name || 'Caller'} • Duration: {formatDuration(call.duration_seconds)}
                </Text>
                {call.notes ? <Text style={styles.callNotesText}>{call.notes}</Text> : null}
              </View>
            ))
          )}
        </View>

        {/* Previous Counselling */}
        {counsellings.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionHeading}>Counselling Records</Text>
            {counsellings.map((c) => (
              <View key={c.id} style={styles.timelineItem}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.callOutcomeText}>{c.type_display}</Text>
                  <Text style={styles.timelineTime}>{relativeDate(c.conducted_at)}</Text>
                </View>
                {c.course ? <Text style={styles.metaText}>Course: {c.course}</Text> : null}
                {c.notes ? <Text style={styles.callNotesText}>{c.notes}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* WhatsApp Modal */}
      <WhatsAppModal
        visible={showWhatsApp}
        onClose={() => setShowWhatsApp(false)}
        leadId={String(lead.id)}
        leadName={lead.name}
        leadPhone={lead.phone}
      />

      {/* Request Admission Modal */}
      <Modal visible={showAdmissionModal} transparent animationType="slide" onRequestClose={() => setShowAdmissionModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Request Admission Review</Text>
            <Text style={styles.modalSubtitle}>
              Ask an Administrator or Manager to review {lead.name} for admission. Note: Submitting does NOT finalize the admission.
            </Text>

            <TextInput
              value={admissionMessage}
              onChangeText={setAdmissionMessage}
              placeholder="Add details for the reviewer (e.g. documents verified, eligibility checked)..."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              style={styles.modalInput}
            />

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setShowAdmissionModal(false)}
                disabled={submittingAdmission}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Submit Request"
                style={[styles.modalBtn, styles.modalSubmitBtn]}
                onPress={handleRequestAdmission}
                disabled={submittingAdmission}
              >
                <Text style={styles.modalSubmitText}>
                  {submittingAdmission ? 'Submitting...' : 'Submit Request'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: AppColors) => {
  const isDark = c.background === '#070B14';
  const softTeal = isDark ? '#0B2A27' : '#E6F4F1';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 18, paddingBottom: 40, gap: 14 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    backIcon: { color: c.text, fontSize: 28, marginTop: -3 },
    headerTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
    headerSubtitle: { color: c.muted, fontSize: 13, marginTop: 2 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    tealCard: {
      backgroundColor: softTeal,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: COUNSELOR_TEAL,
      gap: 6,
    },
    tealCardEyebrow: { color: COUNSELOR_TEAL, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    courseValue: { color: COUNSELOR_TEAL, fontSize: 22, fontWeight: '800' },
    yearValue: { color: c.text, fontSize: 14, fontWeight: '700' },
    callerNotice: { color: c.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    studentName: { color: c.text, fontSize: 20, fontWeight: '800' },
    studentPhone: { color: c.muted, fontSize: 14, marginTop: 2 },
    statusPill: {
      backgroundColor: softTeal,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusText: { color: COUNSELOR_TEAL, fontSize: 12, fontWeight: '800' },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridItem: { flexBasis: '46%', flexGrow: 1, gap: 2 },
    itemLabel: { color: c.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    itemValue: { color: c.text, fontSize: 14, fontWeight: '600' },
    sectionHeading: { color: c.text, fontSize: 16, fontWeight: '800' },
    notesBody: { color: c.secondary, fontSize: 14, lineHeight: 20 },
    lockBadge: {
      color: c.muted,
      fontSize: 11,
      fontWeight: '700',
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    privateBadge: {
      color: COUNSELOR_TEAL,
      fontSize: 11,
      fontWeight: '700',
      backgroundColor: softTeal,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    actionsContainer: { flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1,
      minHeight: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
    },
    actionBtnDisabled: { opacity: 0.6 },
    actionBtnIcon: { fontSize: 18 },
    actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    callBtn: { backgroundColor: '#10B981' },
    whatsappBtn: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    noteBtn: { backgroundColor: COUNSELOR_TEAL },
    admissionBtn: { backgroundColor: '#7C3AED' },
    emptyText: { color: c.muted, fontSize: 13, fontStyle: 'italic', paddingVertical: 4 },
    timelineItem: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      padding: 12,
      gap: 4,
    },
    timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    timelineTime: { color: c.muted, fontSize: 11 },
    noteKindPill: {
      color: COUNSELOR_TEAL,
      fontSize: 11,
      fontWeight: '800',
      backgroundColor: softTeal,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    noteDuration: { color: c.muted, fontSize: 11 },
    noteContent: { color: c.text, fontSize: 14, lineHeight: 19, marginTop: 4 },
    contactPendingBadge: {
      backgroundColor: isDark ? '#451A03' : '#FEF3C7',
      borderColor: '#F59E0B',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    contactPendingBadgeText: {
      color: isDark ? '#FBBF24' : '#B45309',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    contactDoneBadge: {
      backgroundColor: isDark ? '#064E3B' : '#D1FAE5',
      borderColor: '#10B981',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    contactDoneBadgeText: {
      color: isDark ? '#34D399' : '#047857',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    statusBadge: {
      fontSize: 11,
      fontWeight: '800',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
    },
    pendingBadge: { backgroundColor: '#FEF3C7', color: '#D97706' },
    approvedBadge: { backgroundColor: '#DCFCE7', color: '#10B981' },
    rejectedBadge: { backgroundColor: '#FFE4E6', color: '#E11D48' },
    reqMessage: { color: c.text, fontSize: 13, marginTop: 4 },
    reviewNote: { color: c.muted, fontSize: 12, marginTop: 2 },
    callOutcomeText: { color: c.text, fontSize: 13, fontWeight: '700' },
    metaText: { color: c.muted, fontSize: 12 },
    callNotesText: { color: c.secondary, fontSize: 13, marginTop: 2 },
    errorIcon: { fontSize: 44, marginBottom: 12 },
    errorTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
    errorText: { color: c.muted, fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 20 },
    backButton: { marginTop: 10 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      gap: 14,
    },
    modalTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    modalSubtitle: { color: c.muted, fontSize: 13, lineHeight: 18 },
    modalInput: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      color: c.text,
      fontSize: 14,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    modalBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelBtn: { backgroundColor: c.surfaceMuted },
    modalCancelText: { color: c.text, fontWeight: '700' },
    modalSubmitBtn: { backgroundColor: COUNSELOR_TEAL },
    modalSubmitText: { color: '#FFFFFF', fontWeight: '800' },
  });
};
