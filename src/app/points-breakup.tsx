import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import {
  getMyPoints,
  type CallerPoints,
  type PointsBreakupCategory,
  type PointsLedgerItem,
} from '@/services/points';

type TimeframeOption = 'ALL' | 'MONTH' | 'WEEK' | 'TODAY';

type CategoryMeta = {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  CALL_DAILY_BONUS: {
    label: 'Daily Call Milestone',
    icon: '🎯',
    color: '#059669',
    bgColor: '#D1FAE5',
    description: 'Volume target bonuses for outbound calling',
  },
  INTERESTED_LEAD: {
    label: 'Interested Leads',
    icon: '⭐',
    color: '#2563EB',
    bgColor: '#DBEAFE',
    description: 'Converting leads to interested status',
  },
  INTERESTED: {
    label: 'Interested Leads',
    icon: '⭐',
    color: '#2563EB',
    bgColor: '#DBEAFE',
    description: 'Converting leads to interested status',
  },
  COUNSELLING_COMPLETED: {
    label: 'Counselling & Demos',
    icon: '🎓',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    description: 'Completed student counselling sessions',
  },
  COUNSELLING: {
    label: 'Counselling Scheduled',
    icon: '📅',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    description: 'Scheduled demo or counselling appointments',
  },
  VERIFIED_ADMISSION: {
    label: 'Verified Admissions',
    icon: '🏆',
    color: '#D97706',
    bgColor: '#FEF3C7',
    description: 'Confirmed student admissions verified by admin',
  },
  ADMISSION: {
    label: 'Verified Admissions',
    icon: '🏆',
    color: '#D97706',
    bgColor: '#FEF3C7',
    description: 'Confirmed student admissions verified by admin',
  },
  DURATION: {
    label: 'Talk-Time Bonus',
    icon: '⏱️',
    color: '#0D9488',
    bgColor: '#CCFBF1',
    description: 'Extra points for quality call conversation length',
  },
  CONNECTED: {
    label: 'Connected Calls',
    icon: '📞',
    color: '#10B981',
    bgColor: '#D1FAE5',
    description: 'Successfully reached and connected calls',
  },
  DIALED: {
    label: 'Outbound Dials',
    icon: '📲',
    color: '#4B5563',
    bgColor: '#F3F4F6',
    description: 'Outgoing calls placed to leads',
  },
  FOLLOWUP_COMPLETED: {
    label: 'Follow-ups Completed',
    icon: '🔄',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    description: 'Completed scheduled callbacks on time',
  },
  APOSTILLE: {
    label: 'Apostille Milestones',
    icon: '📑',
    color: '#4F46E5',
    bgColor: '#EEF2FF',
    description: 'Apostille document verification milestones',
  },
  ADMIN_ADJUSTMENT: {
    label: 'Admin Bonus / Adjustments',
    icon: '🎁',
    color: '#9333EA',
    bgColor: '#F3E8FF',
    description: 'Manual performance awards or managerial adjustments',
  },
  MANUAL: {
    label: 'Manual Adjustments',
    icon: '🎁',
    color: '#9333EA',
    bgColor: '#F3E8FF',
    description: 'Special bonus or manual credit',
  },
  MISSED_FOLLOWUP: {
    label: 'Missed Follow-up Penalty',
    icon: '⚠️',
    color: '#DC2626',
    bgColor: '#FEE2E2',
    description: 'Deductions for overdue or unattended follow-ups',
  },
  FALSE_STATUS: {
    label: 'Status Correction',
    icon: '🚫',
    color: '#E11D48',
    bgColor: '#FFE4E6',
    description: 'Adjustment for invalid status update',
  },
  INVALID: {
    label: 'Invalid Number',
    icon: '❌',
    color: '#9CA3AF',
    bgColor: '#F3F4F6',
    description: 'Invalid or unreachable contact numbers',
  },
};

function getCategoryMeta(event: string, display?: string): CategoryMeta {
  if (CATEGORY_META[event]) return CATEGORY_META[event];
  return {
    label: display || event.replace(/_/g, ' '),
    icon: '✨',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    description: 'Work performance reward',
  };
}

function formatDate(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function PointsBreakupScreen() {
  const { token, user } = useAuth();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const isDark = mode === 'dark';

  const [timeframe, setTimeframe] = useState<TimeframeOption>('ALL');
  const [selectedEventFilter, setSelectedEventFilter] = useState<string | null>(null);
  const [data, setData] = useState<CallerPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(
    async (tf: TimeframeOption, isPullRefresh = false) => {
      if (!token) return;
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      try {
        const now = new Date();
        const todayStr = toYMD(now);
        let params: Parameters<typeof getMyPoints>[1] = {};

        if (tf === 'ALL') {
          params = { all_time: true, page_size: 150 };
        } else if (tf === 'MONTH') {
          const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          params = { start_date: toYMD(firstOfMonth), end_date: todayStr, page_size: 150 };
        } else if (tf === 'WEEK') {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(now.setDate(diff));
          params = { start_date: toYMD(monday), end_date: todayStr, page_size: 150 };
        } else if (tf === 'TODAY') {
          params = { start_date: todayStr, end_date: todayStr, page_size: 150 };
        }

        const res = await getMyPoints(token, params);
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load points breakdown.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadData(timeframe);
  }, [timeframe, loadData]);

  const summary = data?.summary;
  const breakups = useMemo(() => {
    if (data?.breakup && data.breakup.length > 0) return data.breakup;
    if (summary?.breakup && summary.breakup.length > 0) return summary.breakup;
    if (summary?.lifetime_breakup && summary.lifetime_breakup.length > 0) return summary.lifetime_breakup;
    return [];
  }, [data, summary]);

  const totalPositivePoints = useMemo(() => {
    return breakups.reduce((sum, item) => (item.points > 0 ? sum + item.points : sum), 0);
  }, [breakups]);

  const totalDeductionPoints = useMemo(() => {
    return Math.abs(breakups.reduce((sum, item) => (item.points < 0 ? sum + item.points : sum), 0));
  }, [breakups]);

  const netPoints = useMemo(() => {
    if (timeframe === 'ALL') {
      return summary?.lifetime_points ?? summary?.performance_points ?? summary?.total_points ?? 0;
    }
    return breakups.reduce((sum, item) => sum + item.points, 0);
  }, [breakups, summary, timeframe]);

  const filteredResults = useMemo(() => {
    const list = data?.results || [];
    if (!selectedEventFilter) return list;
    return list.filter((r) => r.event === selectedEventFilter);
  }, [data?.results, selectedEventFilter]);

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Hero Points Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroBadgeRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>PERFORMANCE POINTS</Text>
          </View>
          {data?.peer_appreciation?.average_score !== null &&
          data?.peer_appreciation?.average_score !== undefined ? (
            <View style={styles.peerScoreBadge}>
              <Text style={styles.peerScoreBadgeText}>
                ★ {data.peer_appreciation.average_score}/10 Peer Rating
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroMainRow}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={styles.heroTotalPoints}>{netPoints}</Text>
              <Text style={styles.heroPointsUnit}>pts</Text>
            </View>
            <Text style={styles.heroSubtitle}>
              {timeframe === 'ALL'
                ? 'Lifetime Earned Rewards'
                : timeframe === 'MONTH'
                ? 'Earned This Month'
                : timeframe === 'WEEK'
                ? 'Earned This Week'
                : 'Earned Today'}
            </Text>
          </View>
          <View style={styles.heroTrophyCircle}>
            <Text style={{ fontSize: 32 }}>🏆</Text>
          </View>
        </View>

        {/* 4-Stat Metric Row */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>TODAY</Text>
            <Text style={styles.statBoxValue}>
              +{summary?.daily_points ?? 0}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>THIS WEEK</Text>
            <Text style={styles.statBoxValue}>
              +{summary?.weekly_points ?? 0}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>THIS MONTH</Text>
            <Text style={styles.statBoxValue}>
              +{summary?.monthly_points ?? 0}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>DEDUCTIONS</Text>
            <Text
              style={[
                styles.statBoxValue,
                { color: totalDeductionPoints > 0 ? '#EF4444' : colors.muted },
              ]}
            >
              {totalDeductionPoints > 0 ? `-${totalDeductionPoints}` : '0'}
            </Text>
          </View>
        </View>
      </View>

      {/* Timeframe Filter Tabs */}
      <View style={styles.timeframeBar}>
        {(
          [
            { id: 'ALL', label: 'All Time' },
            { id: 'MONTH', label: 'This Month' },
            { id: 'WEEK', label: 'This Week' },
            { id: 'TODAY', label: 'Today' },
          ] as const
        ).map((tab) => {
          const active = timeframe === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${tab.label}`}
              onPress={() => {
                setTimeframe(tab.id);
                setSelectedEventFilter(null);
              }}
              style={[styles.timeframeTab, active && styles.timeframeTabActive]}
            >
              <Text
                style={[
                  styles.timeframeTabText,
                  active && styles.timeframeTabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Breakup by Work Category */}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Breakup by Work</Text>
          <Text style={styles.sectionSubtitle}>
            How many points you gained for each task
          </Text>
        </View>
        {selectedEventFilter ? (
          <Pressable
            onPress={() => setSelectedEventFilter(null)}
            style={styles.clearFilterBtn}
          >
            <Text style={styles.clearFilterText}>Show All ✕</Text>
          </Pressable>
        ) : (
          <Text style={styles.categoryCountBadge}>
            {breakups.length} {breakups.length === 1 ? 'task' : 'tasks'}
          </Text>
        )}
      </View>

      {breakups.length === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No points in this range</Text>
          <Text style={styles.emptyDesc}>
            Complete calls, follow-ups, and mark interested leads to earn points.
          </Text>
        </View>
      ) : (
        <View style={styles.breakupList}>
          {breakups.map((cat) => {
            const meta = getCategoryMeta(cat.event, cat.event_display);
            const isSelected = selectedEventFilter === cat.event;
            const isNegative = cat.points < 0;
            const pct =
              cat.percentage ||
              (totalPositivePoints > 0 && cat.points > 0
                ? Math.round((cat.points / totalPositivePoints) * 100)
                : 0);

            return (
              <Pressable
                key={cat.event}
                onPress={() =>
                  setSelectedEventFilter((prev) =>
                    prev === cat.event ? null : cat.event
                  )
                }
                style={[
                  styles.breakupCard,
                  isSelected && styles.breakupCardSelected,
                ]}
              >
                <View style={styles.breakupTopRow}>
                  <View style={styles.breakupLeft}>
                    <View
                      style={[
                        styles.categoryIconWrap,
                        {
                          backgroundColor: isDark
                            ? meta.color + '25'
                            : meta.bgColor,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.categoryLabel}>{meta.label}</Text>
                      <Text style={styles.categorySubtext}>
                        {cat.count} {cat.count === 1 ? 'activity' : 'activities'} •{' '}
                        {meta.description}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.pointsPill,
                      isNegative
                        ? styles.pointsPillNegative
                        : styles.pointsPillPositive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pointsPillText,
                        isNegative
                          ? styles.pointsPillTextNegative
                          : styles.pointsPillTextPositive,
                      ]}
                    >
                      {cat.points > 0 ? `+${cat.points}` : `${cat.points}`} pts
                    </Text>
                  </View>
                </View>

                {/* Progress bar representing share */}
                {!isNegative && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(Math.max(pct, 4), 100)}%`,
                            backgroundColor: meta.color,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {pct}% of rewards
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* History Ledger Section Header */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <View>
          <Text style={styles.sectionTitle}>
            {selectedEventFilter
              ? `${getCategoryMeta(selectedEventFilter).label} History`
              : 'Detailed Work History'}
          </Text>
          <Text style={styles.sectionSubtitle}>
            Itemized points timeline for all completed activities
          </Text>
        </View>
        <Text style={styles.categoryCountBadge}>
          {filteredResults.length} records
        </Text>
      </View>
    </View>
  );

  const renderLedgerItem = ({ item }: { item: PointsLedgerItem }) => {
    const meta = getCategoryMeta(item.event, item.event_display);
    const isNegative = item.points < 0;

    return (
      <View style={styles.ledgerRow}>
        <View
          style={[
            styles.ledgerIconCircle,
            {
              backgroundColor: isDark ? meta.color + '22' : meta.bgColor,
            },
          ]}
        >
          <Text style={{ fontSize: 16 }}>{meta.icon}</Text>
        </View>

        <View style={{ flex: 1, paddingRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.ledgerEventName}>{meta.label}</Text>
          </View>
          <Text style={styles.ledgerReason} numberOfLines={2}>
            {item.reason}
          </Text>
          <Text style={styles.ledgerDate}>
            {formatDate(item.occurred_at || item.created_at || '')}
          </Text>
        </View>

        <View
          style={[
            styles.ledgerPointsBadge,
            isNegative
              ? styles.ledgerPointsBadgeNegative
              : styles.ledgerPointsBadgePositive,
          ]}
        >
          <Text
            style={[
              styles.ledgerPointsText,
              isNegative
                ? styles.ledgerPointsTextNegative
                : styles.ledgerPointsTextPositive,
            ]}
          >
            {item.points > 0 ? `+${item.points}` : `${item.points}`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top App Bar */}
      <View style={styles.navBar}>
        <AnimatedBackButton style={styles.backCircle} onPress={() => router.back()}>
          <Text style={styles.backArrow}>‹</Text>
        </AnimatedBackButton>
        <View style={{ flex: 1 }}>
          <Text style={styles.navTitle}>Points Breakup</Text>
          <Text style={styles.navSub}>Performance & Reward Breakdown</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh points breakup"
          onPress={() => void loadData(timeframe, true)}
          disabled={loading || refreshing}
          style={styles.refreshBtn}
        >
          {loading || refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.refreshBtnText}>↻</Text>
          )}
        </Pressable>
      </View>

      {/* Main List */}
      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Calculating points breakup...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredResults}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={renderHeader}
          renderItem={renderLedgerItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadData(timeframe, true)}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyLedger}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>No activities recorded</Text>
              <Text style={styles.emptyDesc}>
                {selectedEventFilter
                  ? 'No entries match this category in the selected timeframe.'
                  : 'Start making calls and completing leads to build your points ledger.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    navBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
      gap: 12,
    },
    backCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    backArrow: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 26,
    },
    navTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    navSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    refreshBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    refreshBtnText: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.primary,
    },
    listContent: {
      paddingBottom: 40,
    },
    headerContent: {
      padding: 16,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    heroBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    heroBadge: {
      backgroundColor: colors.primary + '18',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary + '33',
    },
    heroBadgeText: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    peerScoreBadge: {
      backgroundColor: '#FEF3C7',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    peerScoreBadgeText: {
      color: '#B45309',
      fontSize: 11,
      fontWeight: '700',
    },
    heroMainRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    heroTotalPoints: {
      fontSize: 44,
      fontWeight: '900',
      color: colors.text,
      lineHeight: 48,
      letterSpacing: -1,
    },
    heroPointsUnit: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.primary,
    },
    heroSubtitle: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
    },
    heroTrophyCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    statBox: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 6,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    statBoxLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    statBoxValue: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    timeframeBar: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
      marginBottom: 8,
    },
    timeframeTab: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    timeframeTabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    timeframeTabText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    timeframeTabTextActive: {
      color: '#ffffff',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: 20,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    categoryCountBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
    },
    clearFilterBtn: {
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    clearFilterText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
    },
    breakupList: {
      gap: 10,
    },
    breakupCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    breakupCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.primary + '08',
    },
    breakupTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    breakupLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 8,
    },
    categoryIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryLabel: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    categorySubtext: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    pointsPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      alignSelf: 'flex-start',
    },
    pointsPillPositive: {
      backgroundColor: '#D1FAE5',
    },
    pointsPillNegative: {
      backgroundColor: '#FEE2E2',
    },
    pointsPillText: {
      fontSize: 13,
      fontWeight: '800',
    },
    pointsPillTextPositive: {
      color: '#047857',
    },
    pointsPillTextNegative: {
      color: '#DC2626',
    },
    progressContainer: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    progressFill: {
      height: 6,
      borderRadius: 3,
    },
    progressText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.muted,
      width: 82,
      textAlign: 'right',
    },
    ledgerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    ledgerIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ledgerEventName: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
    },
    ledgerReason: {
      fontSize: 12,
      color: colors.text,
      marginTop: 2,
      lineHeight: 16,
    },
    ledgerDate: {
      fontSize: 10,
      color: colors.muted,
      marginTop: 3,
    },
    ledgerPointsBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 10,
    },
    ledgerPointsBadgePositive: {
      backgroundColor: '#D1FAE5',
    },
    ledgerPointsBadgeNegative: {
      backgroundColor: '#FEE2E2',
    },
    ledgerPointsText: {
      fontSize: 12,
      fontWeight: '800',
    },
    ledgerPointsTextPositive: {
      color: '#047857',
    },
    ledgerPointsTextNegative: {
      color: '#DC2626',
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyLedger: {
      padding: 30,
      alignItems: 'center',
      marginHorizontal: 16,
    },
    emptyIcon: {
      fontSize: 32,
      marginBottom: 8,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    emptyDesc: {
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      marginTop: 4,
      maxWidth: 260,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 13,
      color: colors.muted,
      fontWeight: '600',
    },
  });

