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
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  getCallerAdmissions,
  type AdmissionRecord,
  type AdmissionsSummary,
  type CandidateType,
} from '@/services/admissions';

type PeriodFilter = 'all' | 'today' | 'week' | 'month';
type CandidateFilter = 'all' | 'LEAD' | 'WALK_IN';

export default function AdmissionsScreen() {
  const styles = useAppStyles(createStyles);
  const { colors } = useAppTheme();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [summary, setSummary] = useState<AdmissionsSummary>({
    total: 0,
    today: 0,
    this_week: 0,
    this_month: 0,
  });

  const [selectedType, setSelectedType] = useState<CandidateFilter>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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



  // Counts for candidate types
  const onlineLeadsCount = useMemo(
    () => summary.leads_count ?? admissions.filter((a) => a.candidate_type !== 'WALK_IN').length,
    [summary.leads_count, admissions]
  );

  const walkinsCount = useMemo(
    () => summary.walkins_count ?? admissions.filter((a) => a.candidate_type === 'WALK_IN').length,
    [summary.walkins_count, admissions]
  );

  // Filtered admissions list
  const filteredAdmissions = useMemo(() => {
    let result = admissions;

    // Filter by candidate type (Lead vs Walk-in)
    if (selectedType !== 'all') {
      result = result.filter((a) => a.candidate_type === selectedType);
    }

    // Filter by period
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

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          (a.lead_name && a.lead_name.toLowerCase().includes(q)) ||
          (a.lead_phone && a.lead_phone.includes(q)) ||
          (a.walk_in_name && a.walk_in_name.toLowerCase().includes(q)) ||
          (a.walk_in_phone && a.walk_in_phone.includes(q)) ||
          (a.country && a.country.toLowerCase().includes(q)) ||
          (a.college && a.college.toLowerCase().includes(q)) ||
          (a.course && a.course.toLowerCase().includes(q))
      );
    }

    return result;
  }, [admissions, selectedType, selectedPeriod, searchQuery]);



  const handleCallStudent = (phone: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No phone number available for this candidate.');
      return;
    }
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

    const isWalkIn = item.candidate_type === 'WALK_IN';
    const phoneToCall = item.lead_phone || item.walk_in_phone || '';
    const displayName = item.lead_name || item.walk_in_name || (isWalkIn ? 'Walk-in Candidate' : 'Student');

    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (item.lead_id) {
            router.push({
              pathname: '/lead-details',
              params: { id: String(item.lead_id) },
            });
          }
        }}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.avatar, isWalkIn && styles.avatarWalkIn]}>
            <Text style={[styles.avatarText, isWalkIn && styles.avatarTextWalkIn]}>
              {isWalkIn ? '🚶' : displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={styles.nameRow}>
              <Text style={styles.studentName} numberOfLines={1}>
                {displayName}
              </Text>
              {isWalkIn ? (
                <View style={styles.badgeWalkIn}>
                  <Text style={styles.badgeWalkInText}>🚶 Walk-in</Text>
                </View>
              ) : (
                <View style={styles.badgeLead}>
                  <Text style={styles.badgeLeadText}>💻 Lead</Text>
                </View>
              )}
            </View>
            <Text style={styles.studentPhone}>{phoneToCall || 'No phone'}</Text>
          </View>
          {phoneToCall ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${displayName}`}
              style={styles.callIconBtn}
              onPress={(e) => {
                e.stopPropagation();
                handleCallStudent(phoneToCall);
              }}
            >
              <Text style={styles.callIconText}>📞</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.detailsRow}>
          {item.country ? (
            <View style={[styles.detailBadge, styles.countryBadge]}>
              <Text style={styles.countryBadgeText}>🌍 {item.country}</Text>
            </View>
          ) : null}
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
            {isWalkIn
              ? '🚶 Direct Walk-in Candidate'
              : item.created_from === 'CRM'
              ? '💻 Recorded in CRM'
              : '📱 Recorded in App'}
            {item.created_by_name ? ` • by ${item.created_by_name}` : ''}
          </Text>
          {item.lead_id ? <Text style={styles.viewProfileText}>View Profile →</Text> : null}
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
          <Text style={styles.headerSubtitle}>Verified admissions confirmed by admin</Text>
        </View>
        <View style={{ width: 36 }} />
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

            {/* Candidate Type Segment Tabs (Separates Online Leads & Walk-in Candidates) */}
            <View style={styles.typeFilterContainer}>
              {(
                [
                  { id: 'all', label: `All (${summary.total})` },
                  { id: 'LEAD', label: `💻 Online Leads (${onlineLeadsCount})` },
                  { id: 'WALK_IN', label: `🚶 Walk-ins (${walkinsCount})` },
                ] as const
              ).map((tab) => {
                const isSelected = selectedType === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    style={[styles.typeFilterPill, isSelected && styles.typeFilterPillSelected]}
                    onPress={() => setSelectedType(tab.id)}
                  >
                    <Text style={[styles.typeFilterText, isSelected && styles.typeFilterTextSelected]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Period Filter Pills */}
            <View style={styles.periodRow}>
              {(['all', 'today', 'week', 'month'] as const).map((period) => {
                const isSelected = selectedPeriod === period;
                const label =
                  period === 'all'
                    ? 'All Time'
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
                placeholder="Search student, phone, country, college, course..."
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
                {searchQuery || selectedPeriod !== 'all' || selectedType !== 'all'
                  ? 'No admissions matched your selected filters or search query.'
                  : 'No confirmed admissions recorded yet. Admissions are verified and recorded by administrators.'}
              </Text>
            </View>
          ) : null
        }
      />
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
      marginBottom: 14,
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
    typeFilterContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: 4,
      marginBottom: 10,
      gap: 4,
    },
    typeFilterPill: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
    },
    typeFilterPillSelected: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    typeFilterText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
      textAlign: 'center',
    },
    typeFilterTextSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    periodRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      padding: 3,
      marginBottom: 12,
      gap: 3,
    },
    periodPill: {
      flex: 1,
      paddingVertical: 6,
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
      fontSize: 12,
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
      marginBottom: 10,
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
    avatarWalkIn: {
      backgroundColor: colors.warningSoft,
    },
    avatarText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.accent,
    },
    avatarTextWalkIn: {
      fontSize: 22,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    studentName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      flexShrink: 1,
    },
    badgeLead: {
      backgroundColor: colors.accentSoft,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 6,
      alignSelf: 'center',
    },
    badgeLeadText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.primary,
    },
    badgeWalkIn: {
      backgroundColor: colors.warningSoft,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 6,
      alignSelf: 'center',
    },
    badgeWalkInText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.warning,
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
    countryBadge: {
      backgroundColor: colors.successSoft,
    },
    countryBadgeText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.success,
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
    sectionHeader: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    formTypeSegment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: 4,
      gap: 6,
      marginBottom: 14,
    },
    formTypeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formTypeBtnActive: {
      backgroundColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    formTypeBtnWalkInActive: {
      backgroundColor: colors.warning,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    formTypeBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    formTypeBtnTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    walkInNotice: {
      flexDirection: 'row',
      backgroundColor: colors.warningSoft,
      borderRadius: 10,
      padding: 12,
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    walkInNoticeIcon: {
      fontSize: 20,
    },
    walkInNoticeText: {
      flex: 1,
      fontSize: 12,
      color: colors.warning,
      fontWeight: '600',
      lineHeight: 16,
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
