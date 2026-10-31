import { maskPhoneNumber } from '@/utils/phoneMask';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { WhatsAppModal } from '@/components/WhatsAppModal';
import {
  COUNSELOR_TEAL,
  COUNSELOR_TEAL_SOFT_DARK,
  COUNSELOR_TEAL_SOFT_LIGHT,
  counselorApi,
  type CounselorCreatedLeadDetail,
  type EligibleCaller,
} from '@/services/counselor';
import { initialsOf, relativeDate } from '@/components/counselor/ui';

export default function CounselorCreatedLeadScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const { token } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const leadId = params.id;

  const [lead, setLead] = useState<CounselorCreatedLeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Reassignment Modal State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [callers, setCallers] = useState<EligibleCaller[]>([]);
  const [loadingCallers, setLoadingCallers] = useState(false);
  const [selectedCallerId, setSelectedCallerId] = useState<number | null>(null);
  const [callerSearch, setCallerSearch] = useState('');
  const [submittingReassign, setSubmittingReassign] = useState(false);

  // WhatsApp Modal
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  const loadLead = useCallback(async () => {
    if (!token || !leadId) return;
    try {
      const data = await counselorApi.createdLeadDetail(token, leadId);
      setLead(data.lead);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load lead details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, leadId]);

  useFocusEffect(
    useCallback(() => {
      void loadLead();
    }, [loadLead])
  );

  const loadCallers = useCallback(async () => {
    if (!token) return;
    setLoadingCallers(true);
    try {
      const res = await counselorApi.callers(token);
      setCallers(res.callers || []);
    } catch (err) {
      console.warn('Failed to load eligible callers:', err);
    } finally {
      setLoadingCallers(false);
    }
  }, [token]);

  const openReassignModal = () => {
    setSelectedCallerId(null);
    setCallerSearch('');
    setShowReassignModal(true);
    void loadCallers();
  };

  const handleCallStudent = () => {
    if (!lead?.phone) return;
    const url = `tel:${lead.phone.replace(/[^0-9+]/g, '')}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url);
        else Alert.alert('Dialer Unavailable', 'Cannot open dialer on this device.');
      })
      .catch((err) => console.warn('Error launching phone call:', err));
  };

  const handleConfirmReassign = () => {
    if (!selectedCallerId || !lead) return;
    if (selectedCallerId === lead.assigned_caller_id) {
      Alert.alert('Already Assigned', 'This lead is already assigned to the selected caller.');
      return;
    }

    const targetCaller = callers.find((c) => c.id === selectedCallerId);
    const callerName = targetCaller ? targetCaller.name : 'the selected caller';

    Alert.alert(
      'Confirm Reassignment',
      `Are you sure you want to reassign ${lead.name} to ${callerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reassign',
          style: 'default',
          onPress: () => {
            void executeReassign(selectedCallerId);
          },
        },
      ]
    );
  };

  const executeReassign = async (newCallerId: number) => {
    if (!token || !leadId) return;
    setSubmittingReassign(true);
    try {
      const res = await counselorApi.reassignCreatedLead(token, leadId, newCallerId);
      Alert.alert('Lead Reassigned', res.message || 'Lead successfully reassigned.');
      setShowReassignModal(false);
      // Reload lead details to fetch updated history & caller info
      await loadLead();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to reassign lead. Please try again.';
      Alert.alert('Reassignment Failed', message);
    } finally {
      setSubmittingReassign(false);
    }
  };

  const filteredCallers = useMemo(() => {
    if (!callerSearch.trim()) return callers;
    const q = callerSearch.toLowerCase().trim();
    return callers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [callers, callerSearch]);

  const selectedCaller = useMemo(
    () => callers.find((c) => c.id === selectedCallerId),
    [callers, selectedCallerId]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={COUNSELOR_TEAL} />
        <Text style={styles.loadingText}>Loading student details...</Text>
      </SafeAreaView>
    );
  }

  if (error || !lead) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.headerBar}>
          <AnimatedBackButton />
          <Text style={styles.headerTitle}>Created Lead</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Lead Not Available</Text>
          <Text style={styles.errorBody}>
            {error || 'This lead either does not exist or was not created by your account.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={loadLead}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <AnimatedBackButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>COUNSELOR INTAKE</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {lead.name}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + 32 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadLead();
            }}
            tintColor={COUNSELOR_TEAL}
          />
        }
      >
        {/* Lead Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{initialsOf(lead.name)}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.heroName}>{lead.name}</Text>
              <Text style={styles.heroPhone}>{lead.phone}</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>
                  {lead.status_display || lead.status}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Actions: Call & WhatsApp */}
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              onPress={handleCallStudent}
              accessibilityRole="button"
              accessibilityLabel={`Call ${lead.name}`}
            >
              <Text style={styles.actionButtonIcon}>📞</Text>
              <Text style={styles.actionButtonText}>Call Student</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.whatsappActionButton,
                pressed && styles.pressed,
              ]}
              onPress={() => setShowWhatsApp(true)}
              accessibilityRole="button"
              accessibilityLabel={`Send WhatsApp to ${lead.name}`}
            >
              <Text style={styles.actionButtonIcon}>💬</Text>
              <Text style={[styles.actionButtonText, styles.whatsappActionButtonText]}>
                WhatsApp
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Assigned Caller Card & Reassign Action */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>CURRENT ASSIGNED CALLER</Text>
          <View style={styles.callerInfoBox}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.callerDisplayName}>
                {lead.assigned_caller_name || 'No caller assigned'}
              </Text>
              {lead.assigned_caller_phone ? (
                <Text style={styles.callerMeta}>Phone: {lead.assigned_caller_phone}</Text>
              ) : null}
              {lead.assigned_at ? (
                <Text style={styles.callerMeta}>
                  Assigned on: {relativeDate(lead.assigned_at)}
                </Text>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.reassignButton,
                pressed && styles.pressed,
              ]}
              onPress={openReassignModal}
              accessibilityRole="button"
              accessibilityLabel="Reassign to another caller"
            >
              <Text style={styles.reassignButtonText}>Reassign</Text>
            </Pressable>
          </View>
        </View>

        {/* Academic Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>ACADEMIC INFORMATION</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>COURSE</Text>
              <Text style={styles.infoValue}>
                {lead.course_label || 'Not specified'}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>COLLEGE / SCHOOL</Text>
              <Text style={styles.infoValue}>{lead.college || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>NEET STATUS</Text>
              <Text style={styles.infoValue}>{lead.neet_status || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>PCB PERCENTAGE</Text>
              <Text style={styles.infoValue}>
                {lead.pcb_percentage != null ? `${lead.pcb_percentage}%` : '—'}
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>PREFERRED INTAKE</Text>
              <Text style={styles.infoValue}>{lead.preferred_intake || '—'}</Text>
            </View>
          </View>
        </View>

        {/* Lead Source & General Details */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>LEAD DETAILS</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>LOCATION</Text>
              <Text style={styles.infoValue}>{lead.location || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>EMAIL</Text>
              <Text style={styles.infoValue}>{lead.email || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>SOURCE</Text>
              <Text style={styles.infoValue}>{lead.source || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>CAMPAIGN</Text>
              <Text style={styles.infoValue}>{lead.campaign || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>SERVICE</Text>
              <Text style={styles.infoValue}>{lead.service || '—'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>CREATED AT</Text>
              <Text style={styles.infoValue}>{relativeDate(lead.created_at)}</Text>
            </View>
          </View>
        </View>

        {/* Notes & Remarks */}
        {lead.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardHeader}>NOTES & REMARKS</Text>
            <Text style={styles.notesBody}>{lead.notes}</Text>
          </View>
        ) : null}

        {/* Assignment History Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>ASSIGNMENT HISTORY</Text>

          {lead.assignment_history && lead.assignment_history.length > 0 ? (
            <View style={styles.timeline}>
              {lead.assignment_history.map((h, idx) => {
                const isInitial = !h.previous_caller_name;
                return (
                  <View key={h.id || idx} style={styles.timelineItem}>
                    <View style={styles.timelineDot} />
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle}>
                        {isInitial
                          ? `Created and assigned to ${h.new_caller_name || 'Caller'}`
                          : `Reassigned to ${h.new_caller_name || 'Caller'}`}
                      </Text>
                      {h.previous_caller_name && (
                        <Text style={styles.timelineMeta}>
                          Previous: {h.previous_caller_name}
                        </Text>
                      )}
                      {h.assigned_by_name && (
                        <Text style={styles.timelineMeta}>
                          By: {h.assigned_by_name}
                        </Text>
                      )}
                      <Text style={styles.timelineTime}>
                        {relativeDate(h.assigned_at)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyHistory}>No assignment history recorded.</Text>
          )}
        </View>
      </ScrollView>

      {/* Reassignment Modal */}
      <Modal
        visible={showReassignModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!submittingReassign) setShowReassignModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Reassign Lead</Text>
                <Text style={styles.modalSubtitle}>
                  Select an eligible caller to take over this student lead.
                </Text>
              </View>
              <Pressable
                onPress={() => setShowReassignModal(false)}
                disabled={submittingReassign}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            {callers.length > 5 && (
              <TextInput
                style={styles.modalSearch}
                placeholder="Search callers by name or username..."
                placeholderTextColor={colors.muted}
                value={callerSearch}
                onChangeText={setCallerSearch}
              />
            )}

            <ScrollView style={styles.modalCallerList} keyboardShouldPersistTaps="handled">
              {loadingCallers ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={COUNSELOR_TEAL} />
                  <Text style={styles.modalHint}>Loading eligible callers...</Text>
                </View>
              ) : filteredCallers.length === 0 ? (
                <Text style={styles.modalEmpty}>No active callers available.</Text>
              ) : (
                filteredCallers.map((caller) => {
                  const isCurrent = caller.id === lead.assigned_caller_id;
                  const isSelected = selectedCallerId === caller.id;

                  return (
                    <Pressable
                      key={caller.id}
                      style={[
                        styles.callerModalRow,
                        isSelected && styles.callerModalRowSelected,
                        isCurrent && styles.callerModalRowDisabled,
                      ]}
                      onPress={() => {
                        if (!isCurrent) {
                          setSelectedCallerId(caller.id);
                        }
                      }}
                      disabled={isCurrent || submittingReassign}
                    >
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleSelected,
                          isCurrent && { opacity: 0.4 },
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>

                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[
                            styles.modalCallerName,
                            isSelected && { color: COUNSELOR_TEAL },
                          ]}
                          numberOfLines={1}
                        >
                          {caller.name}{' '}
                          {isCurrent ? (
                            <Text style={styles.currentTag}>(Currently Assigned)</Text>
                          ) : null}
                        </Text>
                        <Text style={styles.modalCallerUsername} numberOfLines={1}>
                          @{caller.username}
                          {caller.phone ? ` · ${maskPhoneNumber(caller.phone)}` : ''}
                        </Text>
                      </View>

                      <View style={styles.modalCallerBadge}>
                        <Text style={styles.modalCallerBadgeText}>
                          {caller.designation || 'Caller'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setShowReassignModal(false)}
                disabled={submittingReassign}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalBtn,
                  styles.modalConfirmBtn,
                  (!selectedCallerId ||
                    selectedCallerId === lead.assigned_caller_id ||
                    submittingReassign) &&
                    styles.modalConfirmBtnDisabled,
                ]}
                onPress={handleConfirmReassign}
                disabled={
                  !selectedCallerId ||
                  selectedCallerId === lead.assigned_caller_id ||
                  submittingReassign
                }
              >
                {submittingReassign ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalConfirmBtnText}>
                    {selectedCaller
                      ? `Reassign to ${selectedCaller.name}`
                      : 'Confirm Reassignment'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* WhatsApp Modal */}
      {showWhatsApp && (
        <WhatsAppModal
          visible={showWhatsApp}
          onClose={() => setShowWhatsApp(false)}
          leadId={String(lead.id)}
          leadName={lead.name}
          leadPhone={lead.phone}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: AppColors) => {
  const dark = c.background === '#070B14';
  const soft = dark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    centerContainer: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: { color: c.muted, fontSize: 14 },
    content: { padding: 18, gap: 16 },

    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    headerEyebrow: {
      color: COUNSELOR_TEAL,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
    },
    headerTitle: { color: c.text, fontSize: 18, fontWeight: '800' },

    // Hero Card
    heroCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      gap: 16,
    },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    heroAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: soft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroAvatarText: { color: COUNSELOR_TEAL, fontSize: 20, fontWeight: '800' },
    heroName: { color: c.text, fontSize: 20, fontWeight: '800' },
    heroPhone: { color: c.muted, fontSize: 14, fontWeight: '600' },
    statusPill: {
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
      borderWidth: 1,
      borderRadius: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginTop: 2,
    },
    statusPillText: {
      color: COUNSELOR_TEAL,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },

    actionRow: { flexDirection: 'row', gap: 12 },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: COUNSELOR_TEAL,
      borderRadius: 14,
      paddingVertical: 12,
    },
    actionButtonIcon: { fontSize: 16 },
    actionButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    whatsappActionButton: {
      backgroundColor: dark ? '#064E3B' : '#DCFCE7',
      borderWidth: 1,
      borderColor: '#10B981',
    },
    whatsappActionButtonText: {
      color: dark ? '#34D399' : '#047857',
    },

    // Generic Cards
    card: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    cardHeader: {
      color: COUNSELOR_TEAL,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
    },

    callerInfoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    callerDisplayName: { color: c.text, fontSize: 16, fontWeight: '800' },
    callerMeta: { color: c.muted, fontSize: 13 },
    reassignButton: {
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
      borderWidth: 1.5,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    reassignButtonText: {
      color: COUNSELOR_TEAL,
      fontSize: 13,
      fontWeight: '800',
    },

    infoGrid: { gap: 10 },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    infoLabel: { color: c.muted, fontSize: 12, fontWeight: '700' },
    infoValue: { color: c.text, fontSize: 14, fontWeight: '600' },
    notesBody: { color: c.text, fontSize: 14, lineHeight: 22 },

    // Timeline
    timeline: { gap: 14, paddingLeft: 4 },
    timelineItem: { flexDirection: 'row', gap: 12 },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COUNSELOR_TEAL,
      marginTop: 4,
    },
    timelineContent: { flex: 1, gap: 2 },
    timelineTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
    timelineMeta: { color: c.muted, fontSize: 12 },
    timelineTime: { color: c.muted, fontSize: 11, fontStyle: 'italic' },
    emptyHistory: { color: c.muted, fontSize: 13, fontStyle: 'italic' },

    // Error State
    errorContainer: {
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: 60,
    },
    errorTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    errorBody: { color: c.muted, fontSize: 14, textAlign: 'center' },
    retryButton: {
      backgroundColor: COUNSELOR_TEAL,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      marginTop: 8,
    },
    retryButtonText: { color: '#FFFFFF', fontWeight: '700' },

    // Reassign Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '85%',
      paddingTop: 18,
      paddingHorizontal: 18,
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    modalTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    modalSubtitle: { color: c.muted, fontSize: 13 },
    modalCloseButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: dark ? '#1A2333' : '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCloseText: { color: c.muted, fontSize: 14, fontWeight: '800' },
    modalSearch: {
      backgroundColor: c.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: c.text,
      fontSize: 14,
    },
    modalCallerList: { maxHeight: 320 },
    modalHint: { color: c.muted, fontSize: 13, marginTop: 8 },
    modalEmpty: {
      color: c.muted,
      fontSize: 13,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 20,
    },
    callerModalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    callerModalRowSelected: {
      backgroundColor: soft,
    },
    callerModalRowDisabled: {
      opacity: 0.5,
    },
    modalCallerName: { color: c.text, fontSize: 15, fontWeight: '700' },
    currentTag: { color: c.muted, fontSize: 12, fontWeight: '600' },
    modalCallerUsername: { color: c.muted, fontSize: 12 },
    modalCallerBadge: {
      backgroundColor: dark ? '#1A2333' : '#E2E8F0',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    modalCallerBadgeText: { color: c.muted, fontSize: 11, fontWeight: '700' },

    radioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleSelected: { borderColor: COUNSELOR_TEAL },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COUNSELOR_TEAL,
    },

    modalFooter: {
      flexDirection: 'row',
      gap: 12,
      paddingTop: 8,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelBtn: {
      backgroundColor: dark ? '#1A2333' : '#E2E8F0',
    },
    modalCancelBtnText: { color: c.text, fontSize: 15, fontWeight: '700' },
    modalConfirmBtn: {
      backgroundColor: COUNSELOR_TEAL,
    },
    modalConfirmBtnDisabled: { opacity: 0.5 },
    modalConfirmBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

    pressed: { opacity: 0.8 },
  });
};

