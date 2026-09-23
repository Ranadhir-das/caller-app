import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import {
  createAdmission,
  getCallerAdmissions,
  type AdmissionRecord,
  type AdmissionsSummary,
} from '@/services/admissions';
import type { Lead } from '@/types';

type PeriodFilter = 'all' | 'today' | 'week' | 'month';

export default function AdmissionsScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const { token } = useAuth();
  const { leads, refresh: refreshLeads } = useLeads();
  const { prefillLeadId } = useLocalSearchParams<{ prefillLeadId?: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [summary, setSummary] = useState<AdmissionsSummary>({
    total: 0,
    today: 0,
    this_week: 0,
    this_month: 0,
  });

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadSearchText, setLeadSearchText] = useState('');
  const [collegeInput, setCollegeInput] = useState('');
  const [courseInput, setCourseInput] = useState('');
  const [feesInput, setFeesInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [admissionDate, setAdmissionDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Load admissions from server
  const loadAdmissions = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getCallerAdmissions(token);
      setAdmissions(data.admissions);
      setSummary(data.summary);
    } catch (error) {
      console.error('Failed to load admissions:', error);
      Alert.alert('Unable to load admissions', 'Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAdmissions();
  }, [loadAdmissions]);

  // Handle prefill if opened from lead-details
  useEffect(() => {
    if (prefillLeadId && leads.length > 0) {
      const target = leads.find((l) => l.id === prefillLeadId);
      if (target) {
        openRecordModal(target);
      }
    }
  }, [prefillLeadId, leads]);

  const openRecordModal = (preselected?: Lead) => {
    if (preselected) {
      setSelectedLead(preselected);
      setLeadSearchText(`${preselected.name} (${preselected.phone})`);
      setCollegeInput('');
      setCourseInput('');
      setFeesInput('');
      setNotesInput(preselected.notes || '');
    } else {
      setSelectedLead(null);
      setLeadSearchText('');
      setCollegeInput('');
      setCourseInput('');
      setFeesInput('');
      setNotesInput('');
    }
    setAdmissionDate(new Date());
    setModalVisible(true);
  };

  const closeRecordModal = () => {
    if (submitting) return;
    setModalVisible(false);
    setSelectedLead(null);
    setLeadSearchText('');
  };

  // Filter leads for search in form
  const matchedLeads = useMemo(() => {
    const q = leadSearchText.trim().toLowerCase();
    if (!q || (selectedLead && leadSearchText === `${selectedLead.name} (${selectedLead.phone})`)) {
      return [];
    }
    return leads
      .filter((l) => l.phone.includes(q) || l.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [leads, leadSearchText, selectedLead]);

  // Filtered admissions list
  const filteredAdmissions = useMemo(() => {
    let result = admissions;

    if (selectedPeriod === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      result = result.filter((a) => a.admission_date === todayStr);
    } else if (selectedPeriod === 'week') {
      const now = new Date();
      const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);
      result = result.filter((a) => new Date(a.admission_date) >= weekStart);
    } else if (selectedPeriod === 'month') {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      result = result.filter((a) => new Date(a.admission_date) >= monthStart);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.lead_name.toLowerCase().includes(q) ||
          a.lead_phone.includes(q) ||
          a.college.toLowerCase().includes(q) ||
          a.course.toLowerCase().includes(q)
      );
    }

    return result;
  }, [admissions, selectedPeriod, searchQuery]);

  const handleSaveAdmission = async () => {
    if (!selectedLead) {
      Alert.alert('Select Student', 'Please search and select a student lead by phone number or name.');
      return;
    }
    if (!collegeInput.trim()) {
      Alert.alert('College Required', 'Please enter the admitted college or institute name.');
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = admissionDate.toISOString().split('T')[0];
      const result = await createAdmission(token!, {
        lead_id: Number(selectedLead.id),
        college: collegeInput.trim(),
        course: courseInput.trim(),
        admission_date: dateStr,
        fees: feesInput.trim() ? Number(feesInput.trim()) : undefined,
        notes: notesInput.trim(),
      });

      Alert.alert('Admission Saved!', `Admission for ${result.admission.lead_name} has been recorded.`);
      closeRecordModal();
      await loadAdmissions(true);
      void refreshLeads();
    } catch (error) {
      console.error('Create admission failed:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Could not save admission.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCallStudent = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call Failed', `Cannot dial ${phone} on this device.`);
    });
  };

  const renderAdmissionCard = ({ item }: { item: AdmissionRecord }) => {
    const formattedDate = new Date(item.admission_date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          router.push({
            pathname: '/lead-details',
            params: { id: String(item.lead_id) },
          });
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.lead_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.studentName}>{item.lead_name}</Text>
            <Text style={styles.studentPhone}>{item.lead_phone}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${item.lead_name}`}
            style={styles.callIconBtn}
            onPress={(e) => {
              e.stopPropagation();
              handleCallStudent(item.lead_phone);
            }}
          >
            <Text style={styles.callIconText}>📞</Text>
          </Pressable>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailBadge}>
            <Text style={styles.badgeText}>🏫 {item.college || 'College specified'}</Text>
          </View>
          {item.course ? (
            <View style={[styles.detailBadge, styles.courseBadge]}>
              <Text style={styles.courseBadgeText}>🎓 {item.course}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>📅 Admitted: {formattedDate}</Text>
          {item.fees ? <Text style={styles.feesText}>💰 ₹{Number(item.fees).toLocaleString('en-IN')}</Text> : null}
        </View>

        {item.notes ? (
          <View style={styles.notesContainer}>
            <Text style={styles.notesText} numberOfLines={2}>
              "{item.notes}"
            </Text>
          </View>
        ) : null}

        <View style={styles.sourceFooter}>
          <Text style={styles.sourceTag}>
            {item.created_from === 'CRM' ? '💻 Recorded in CRM' : '📱 Recorded in App'}
            {item.created_by_name ? ` • by ${item.created_by_name}` : ''}
          </Text>
          <Text style={styles.viewProfileText}>View Profile →</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <AnimatedBackButton style={styles.backButton} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Admissions Panel</Text>
          <Text style={styles.headerSubtitle}>Track your successful enrolments</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record new admission"
          style={styles.addButton}
          onPress={() => openRecordModal()}
        >
          <Text style={styles.addButtonText}>+ Record</Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredAdmissions}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAdmissionCard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAdmissions(true)} tintColor={colors.accent} />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* KPI Metrics Grid */}
            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <Text style={styles.metricIcon}>🎓</Text>
                <Text style={styles.metricNumber}>{summary.total}</Text>
                <Text style={styles.metricLabel}>Total Admissions</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>📅</Text>
                <Text style={styles.metricNumber}>{summary.this_month}</Text>
                <Text style={styles.metricLabel}>This Month</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>📈</Text>
                <Text style={styles.metricNumber}>{summary.this_week}</Text>
                <Text style={styles.metricLabel}>This Week</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricIcon}>⚡</Text>
                <Text style={styles.metricNumber}>{summary.today}</Text>
                <Text style={styles.metricLabel}>Today</Text>
              </View>
            </View>

            {/* Filter Pills */}
            <View style={styles.periodRow}>
              {(['all', 'today', 'week', 'month'] as const).map((period) => {
                const isSelected = selectedPeriod === period;
                const label =
                  period === 'all'
                    ? 'All'
                    : period === 'today'
                    ? 'Today'
                    : period === 'week'
                    ? 'This Week'
                    : 'This Month';
                return (
                  <Pressable
                    key={period}
                    style={[styles.periodPill, isSelected && styles.periodPillSelected]}
                    onPress={() => setSelectedPeriod(period)}
                  >
                    <Text style={[styles.periodText, isSelected && styles.periodTextSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search student, phone, college, course..."
                placeholderTextColor={colors.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
              />
            </View>

            {loading && !refreshing ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎓</Text>
              <Text style={styles.emptyTitle}>No Admissions Found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || selectedPeriod !== 'all'
                  ? 'No admissions matched your filter or search query.'
                  : 'You have not recorded any admissions yet. Tap "+ Record" above to add your first admission.'}
              </Text>
              <Pressable style={styles.recordEmptyBtn} onPress={() => openRecordModal()}>
                <Text style={styles.recordEmptyBtnText}>+ Record New Admission</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* Record Admission Modal Form */}
      <Modal visible={modalVisible} animationType="slide" transparent={false} onRequestClose={closeRecordModal}>
        <SafeAreaView style={styles.modalSafeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={closeRecordModal} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Record Student Admission</Text>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {/* Step 1: Search and Select Lead */}
              <Text style={styles.inputLabel}>1. Search Student by Phone or Name *</Text>
              {selectedLead ? (
                <View style={styles.selectedLeadCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedLeadName}>✓ {selectedLead.name}</Text>
                    <Text style={styles.selectedLeadPhone}>📞 {selectedLead.phone}</Text>
                    {selectedLead.batchName ? (
                      <Text style={styles.selectedLeadBatch}>Batch: {selectedLead.batchName}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    style={styles.changeLeadBtn}
                    onPress={() => {
                      setSelectedLead(null);
                      setLeadSearchText('');
                    }}
                  >
                    <Text style={styles.changeLeadText}>Change</Text>
                  </Pressable>
                </View>
              ) : (
                <View>
                  <TextInput
                    style={styles.input}
                    placeholder="Type student phone number or name..."
                    placeholderTextColor={colors.placeholder}
                    value={leadSearchText}
                    onChangeText={setLeadSearchText}
                    autoCapitalize="none"
                  />
                  {matchedLeads.length > 0 ? (
                    <View style={styles.suggestionsBox}>
                      {matchedLeads.map((item) => (
                        <Pressable
                          key={item.id}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setSelectedLead(item);
                            setLeadSearchText(`${item.name} (${item.phone})`);
                          }}
                        >
                          <Text style={styles.suggestionName}>{item.name}</Text>
                          <Text style={styles.suggestionPhone}>{item.phone}</Text>
                          <Text style={styles.suggestionStatus}>• {item.status}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : leadSearchText.trim().length > 1 ? (
                    <Text style={styles.noMatchText}>No matching assigned lead found.</Text>
                  ) : null}
                </View>
              )}

              {/* Step 2: College / University */}
              <Text style={styles.inputLabel}>2. Admitted College / University *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. AIIMS Delhi, KIMS Bangalore..."
                placeholderTextColor={colors.placeholder}
                value={collegeInput}
                onChangeText={setCollegeInput}
              />

              {/* Step 3: Course / Degree */}
              <Text style={styles.inputLabel}>3. Course / Degree</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. MBBS, BDS, Nursing, B.Tech..."
                placeholderTextColor={colors.placeholder}
                value={courseInput}
                onChangeText={setCourseInput}
              />

              {/* Step 4: Admission Date */}
              <Text style={styles.inputLabel}>4. Admission Date</Text>
              <Pressable style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateSelectorText}>
                  📅{' '}
                  {admissionDate.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={admissionDate}
                  mode="date"
                  display={Platform.OS === 'android' ? 'default' : 'spinner'}
                  onChange={(_, d) => {
                    setShowDatePicker(false);
                    if (d) setAdmissionDate(d);
                  }}
                />
              ) : null}

              {/* Step 5: Fees / Package */}
              <Text style={styles.inputLabel}>5. Fees / Amount Paid (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 50000"
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
                value={feesInput}
                onChangeText={setFeesInput}
              />

              {/* Step 6: Notes */}
              <Text style={styles.inputLabel}>6. Notes & Remarks</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Add details, counseling notes, payment reference..."
                placeholderTextColor={colors.placeholder}
                multiline
                numberOfLines={3}
                value={notesInput}
                onChangeText={setNotesInput}
              />

              {/* Submit Button */}
              <Pressable
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSaveAdmission}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Save Admission ↗</Text>
                )}
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    backButton: {
      marginRight: 10,
    },
    headerCenter: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    addButton: {
      backgroundColor: colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
    },
    addButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 16,
    },
    metricCard: {
      width: '48%',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricCardPrimary: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    metricIcon: {
      fontSize: 22,
      marginBottom: 6,
    },
    metricNumber: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
    },
    metricLabel: {
      fontSize: 12,
      color: colors.muted,
      fontWeight: '600',
      marginTop: 2,
    },
    periodRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      padding: 4,
      marginBottom: 12,
      gap: 4,
    },
    periodPill: {
      flex: 1,
      paddingVertical: 7,
      alignItems: 'center',
      borderRadius: 8,
    },
    periodPillSelected: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    periodText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    periodTextSelected: {
      color: colors.accent,
      fontWeight: '700',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 14,
      height: 44,
    },
    searchIcon: {
      fontSize: 18,
      color: colors.muted,
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
    },
    loaderBox: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    avatarText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.accent,
    },
    studentName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    studentPhone: {
      fontSize: 13,
      color: colors.secondary,
    },
    callIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callIconText: {
      fontSize: 18,
    },
    detailsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    detailBadge: {
      backgroundColor: colors.surfaceMuted,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    courseBadge: {
      backgroundColor: colors.accentSoft,
    },
    courseBadgeText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    metaText: {
      fontSize: 12,
      color: colors.muted,
    },
    feesText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.success,
    },
    notesContainer: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 8,
      padding: 8,
      marginBottom: 10,
    },
    notesText: {
      fontSize: 12,
      fontStyle: 'italic',
      color: colors.secondary,
      lineHeight: 17,
    },
    sourceFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
    },
    sourceTag: {
      fontSize: 11,
      color: colors.muted,
      fontWeight: '500',
    },
    viewProfileText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.accent,
    },
    emptyContainer: {
      paddingVertical: 48,
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    emptyIcon: {
      fontSize: 52,
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 18,
    },
    recordEmptyBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
    },
    recordEmptyBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
    },
    // Modal Styles
    modalSafeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    modalCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCloseText: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '600',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    modalScroll: {
      padding: 20,
      paddingBottom: 40,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
      marginTop: 14,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    selectedLeadCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      padding: 12,
    },
    selectedLeadName: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.accent,
    },
    selectedLeadPhone: {
      fontSize: 13,
      color: colors.text,
      marginTop: 2,
    },
    selectedLeadBatch: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    changeLeadBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    changeLeadText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
    suggestionsBox: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      marginTop: 6,
      maxHeight: 180,
      overflow: 'hidden',
    },
    suggestionItem: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    suggestionName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    suggestionPhone: {
      fontSize: 13,
      color: colors.secondary,
    },
    suggestionStatus: {
      fontSize: 12,
      color: colors.muted,
    },
    noMatchText: {
      fontSize: 12,
      color: colors.danger,
      marginTop: 4,
      marginLeft: 4,
    },
    dateSelector: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    dateSelectorText: {
      fontSize: 15,
      color: colors.text,
    },
    submitButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 28,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });

