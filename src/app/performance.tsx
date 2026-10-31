import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import {
  getCallerTalkTime,
  formatSecondsToDuration,
  type CallerTalkTimeData,
  type TalkTimeTrendItem,
} from '@/services/points';

export type TimeframeFilter = 'today' | 'yesterday' | '7days' | 'this_month' | 'custom';

function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPrettyDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const CHART_MAX_HEIGHT = 120;
const CHART_MIN_BAR_HEIGHT = 4;

export default function PerformanceScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const { token, user } = useAuth();

  const [timeframe, setTimeframe] = useState<TimeframeFilter>('7days');
  const [data, setData] = useState<CallerTalkTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Custom date range state
  const [customStart, setCustomStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d;
  });
  const [customEnd, setCustomEnd] = useState<Date>(() => new Date());
  const [openDatePicker, setOpenDatePicker] = useState<'start' | 'end' | null>(null);
  const [customDateError, setCustomDateError] = useState('');

  // Selected bar item for inspection tooltips
  const [selectedCallDay, setSelectedCallDay] = useState<TalkTimeTrendItem | null>(null);
  const [selectedTalkDay, setSelectedTalkDay] = useState<TalkTimeTrendItem | null>(null);

  const fetchData = useCallback(
    async (isPullRefresh = false) => {
      if (!token) return;
      if (isPullRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      setCustomDateError('');

      try {
        const queryParams: Parameters<typeof getCallerTalkTime>[1] = {
          timeframe,
        };

        if (timeframe === 'custom') {
          if (customEnd < customStart) {
            setCustomDateError('End date cannot be earlier than start date.');
            setLoading(false);
            setRefreshing(false);
            return;
          }
          queryParams.start_date = toYMD(customStart);
          queryParams.end_date = toYMD(customEnd);
        }

        const res = await getCallerTalkTime(token, queryParams);
        setData(res);

        // Pre-select last day if available
        if (res.trend && res.trend.length > 0) {
          const last = res.trend[res.trend.length - 1];
          setSelectedCallDay(last);
          setSelectedTalkDay(last);
        } else {
          setSelectedCallDay(null);
          setSelectedTalkDay(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load performance data.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, timeframe, customStart, customEnd]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Max values for chart scaling
  const maxCalls = useMemo(() => {
    if (!data?.trend || data.trend.length === 0) return 1;
    return Math.max(...data.trend.map((t) => t.total_calls || 0), 1);
  }, [data]);

  const maxTalkSeconds = useMemo(() => {
    if (!data?.trend || data.trend.length === 0) return 60;
    return Math.max(...data.trend.map((t) => t.talk_time_seconds || 0), 60);
  }, [data]);

  const filterButtons: { key: TimeframeFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7days', label: 'Last 7 Days' },
    { key: 'this_month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header Bar */}
      <View style={styles.header}>
        <AnimatedBackButton />
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Calling Performance</Text>
          <Text style={styles.subtitle}>
            {user?.name ? `${user.name} • ` : ''}Your calls & talk-time duration
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh calling performance"
          onPress={() => fetchData()}
          disabled={loading || refreshing}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
        >
          {loading || refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.refreshIcon}>🔄</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchData(true)}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Date Filter Bar */}
        <View style={styles.filterSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterTrack}
          >
            {filterButtons.map((btn) => {
              const active = timeframe === btn.key;
              return (
                <Pressable
                  key={btn.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${btn.label}`}
                  onPress={() => setTimeframe(btn.key)}
                  style={[styles.filterPill, active && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                    {btn.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom Date Pickers */}
          {timeframe === 'custom' && (
            <View style={styles.customDateBox}>
              <View style={styles.customDateRow}>
                <View style={styles.datePickerCol}>
                  <Text style={styles.dateLabel}>FROM</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select custom start date"
                    style={styles.dateSelectBtn}
                    onPress={() => setOpenDatePicker('start')}
                  >
                    <Text style={styles.dateSelectText}>{formatPrettyDate(customStart)}</Text>
                  </Pressable>
                </View>

                <Text style={styles.dateSeparator}>to</Text>

                <View style={styles.datePickerCol}>
                  <Text style={styles.dateLabel}>TO</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select custom end date"
                    style={styles.dateSelectBtn}
                    onPress={() => setOpenDatePicker('end')}
                  >
                    <Text style={styles.dateSelectText}>{formatPrettyDate(customEnd)}</Text>
                  </Pressable>
                </View>
              </View>

              {!!customDateError && (
                <Text accessibilityRole="alert" style={styles.validationError}>
                  {customDateError}
                </Text>
              )}
            </View>
          )}

          {openDatePicker === 'start' && (
            <DateTimePicker
              themeVariant={mode}
              value={customStart}
              mode="date"
              display={Platform.OS === 'android' ? 'default' : 'spinner'}
              maximumDate={new Date()}
              onChange={(_, date) => {
                setOpenDatePicker(null);
                if (date) {
                  setCustomStart(date);
                  if (customEnd < date) {
                    setCustomEnd(date);
                  }
                }
              }}
            />
          )}

          {openDatePicker === 'end' && (
            <DateTimePicker
              themeVariant={mode}
              value={customEnd}
              mode="date"
              display={Platform.OS === 'android' ? 'default' : 'spinner'}
              minimumDate={customStart}
              maximumDate={new Date()}
              onChange={(_, date) => {
                setOpenDatePicker(null);
                if (date) {
                  setCustomEnd(date);
                }
              }}
            />
          )}
        </View>

        {/* Error Banner */}
        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry fetching performance"
              onPress={() => fetchData()}
              style={styles.retryBtn}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Loading Spinner */}
        {loading && !data && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading calling performance...</Text>
          </View>
        )}

        {/* Performance Content */}
        {data && (
          <>
            {/* 3 Metric Summary Cards */}
            <View style={styles.summaryCardsGrid}>
              {/* Card 1: Total Calls */}
              <View style={[styles.metricCard, styles.metricCardPrimary]}>
                <View style={styles.metricCardHeader}>
                  <Text style={styles.metricBadgeIcon}>📞</Text>
                  <Text style={styles.metricCardLabel}>TOTAL CALLS</Text>
                </View>
                <Text style={styles.metricMainValue}>
                  {data.total_calls_count ?? 0}
                </Text>
                <View style={styles.metricFooter}>
                  <Text style={styles.metricFooterHighlight}>
                    {data.connected_calls_count ?? 0} connected
                  </Text>
                  <Text style={styles.metricFooterSub}>
                    ({data.connection_rate_percent ?? 0}%)
                  </Text>
                </View>
                <Text style={styles.metricExtraSub}>
                  {data.unconnected_calls_count ?? 0} missed or unconnected
                </Text>
              </View>

              {/* Card 2: Total Talk Time */}
              <View style={[styles.metricCard, styles.metricCardSecondary]}>
                <View style={styles.metricCardHeader}>
                  <Text style={styles.metricBadgeIcon}>⏱️</Text>
                  <Text style={styles.metricCardLabel}>TOTAL TALK TIME</Text>
                </View>
                <Text style={styles.metricMainValue}>
                  {data.formatted_talk_time || formatSecondsToDuration(data.total_talk_time_seconds || 0)}
                </Text>
                <View style={styles.metricFooter}>
                  <Text style={styles.metricFooterHighlight}>
                    {Math.round((data.total_talk_time_seconds || 0) / 60)} mins
                  </Text>
                  <Text style={styles.metricFooterSub}>
                    active talking time
                  </Text>
                </View>
                <Text style={styles.metricExtraSub}>
                  across {data.connected_calls_count ?? 0} connected calls
                </Text>
              </View>

              {/* Card 3: Average Talk Time */}
              <View style={[styles.metricCard, styles.metricCardTertiary]}>
                <View style={styles.metricCardHeader}>
                  <Text style={styles.metricBadgeIcon}>⚡</Text>
                  <Text style={styles.metricCardLabel}>AVG TALK TIME</Text>
                </View>
                <Text style={styles.metricMainValue}>
                  {data.formatted_avg_duration || formatSecondsToDuration(data.average_duration_seconds || 0)}
                </Text>
                <View style={styles.metricFooter}>
                  <Text style={styles.metricFooterHighlight}>
                    per connected call
                  </Text>
                </View>
                <Text style={styles.metricExtraSub}>
                  {data.formatted_avg_talk_time_per_call
                    ? `${data.formatted_avg_talk_time_per_call} per dial attempt`
                    : 'Safe zero calls handling'}
                </Text>
              </View>
            </View>

            {/* Empty State Banner when 0 calls recorded */}
            {data.total_calls_count === 0 && (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateIcon}>📱</Text>
                <Text style={styles.emptyStateTitle}>No calls in this time period</Text>
                <Text style={styles.emptyStateSubtitle}>
                  You haven't placed any calls during this timeframe. Start dialing from your lead list to view daily trends and talk time metrics.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go to caller lead workspace"
                  onPress={() => router.push('/(tabs)' as never)}
                  style={styles.emptyStateBtn}
                >
                  <Text style={styles.emptyStateBtnText}>Open Lead Dialing Workspace</Text>
                </Pressable>
              </View>
            )}

            {/* Chart 1: Daily Calls Chart */}
            {data.trend && data.trend.length > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>Daily Calls</Text>
                    <Text style={styles.chartSubtitle}>
                      X-axis date • Y-axis call count
                    </Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                      <Text style={styles.legendText}>Connected</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
                      <Text style={styles.legendText}>Total</Text>
                    </View>
                  </View>
                </View>

                {/* Interactive Bar Chart Track */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chartScrollTrack}
                >
                  <View style={styles.chartContainer}>
                    {/* Baseline indicator */}
                    <View style={styles.chartBaseline} />

                    <View style={styles.barsContainer}>
                      {data.trend.map((item) => {
                        const totalHeight = Math.max(
                          CHART_MIN_BAR_HEIGHT,
                          Math.round(((item.total_calls || 0) / maxCalls) * CHART_MAX_HEIGHT)
                        );
                        const connHeight = Math.max(
                          item.connected_calls > 0 ? CHART_MIN_BAR_HEIGHT : 0,
                          Math.round(((item.connected_calls || 0) / maxCalls) * CHART_MAX_HEIGHT)
                        );
                        const isSelected = selectedCallDay?.date === item.date;

                        return (
                          <Pressable
                            key={item.date}
                            accessibilityRole="button"
                            accessibilityLabel={`${item.display_date}: ${item.total_calls} calls, ${item.connected_calls} connected`}
                            onPress={() => setSelectedCallDay(item)}
                            style={styles.barCol}
                          >
                            {/* Value Above Bar */}
                            <Text
                              style={[
                                styles.barTopValue,
                                isSelected && { color: colors.accent, fontWeight: '800' },
                              ]}
                            >
                              {item.total_calls || 0}
                            </Text>

                            {/* Bar Graphic */}
                            <View style={styles.barSlot}>
                              {/* Total calls bar (background tint) */}
                              <View
                                style={[
                                  styles.barTotal,
                                  {
                                    height: totalHeight,
                                    backgroundColor: isSelected
                                      ? colors.accentSoft
                                      : colors.surfaceMuted,
                                    borderColor: isSelected ? colors.accent : colors.border,
                                  },
                                ]}
                              >
                                {/* Connected calls bar (solid overlay from bottom) */}
                                {connHeight > 0 && (
                                  <View
                                    style={[
                                      styles.barConnected,
                                      {
                                        height: connHeight,
                                        backgroundColor: colors.accent,
                                      },
                                    ]}
                                  />
                                )}
                              </View>
                            </View>

                            {/* Date Label on X-axis */}
                            <Text
                              style={[
                                styles.barDateLabel,
                                isSelected && styles.barDateLabelSelected,
                              ]}
                            >
                              {item.display_date}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                {/* Selected Day Details Tooltip */}
                {selectedCallDay && (
                  <View style={styles.tooltipBox}>
                    <View style={styles.tooltipHeader}>
                      <Text style={styles.tooltipDate}>{selectedCallDay.display_date}</Text>
                      <Text style={styles.tooltipSummary}>
                        {selectedCallDay.total_calls} total dials placed
                      </Text>
                    </View>
                    <View style={styles.tooltipDetailsRow}>
                      <Text style={styles.tooltipItem}>
                        ✅ <Text style={styles.boldText}>{selectedCallDay.connected_calls}</Text> connected
                      </Text>
                      <Text style={styles.tooltipItem}>
                        ⏱️ <Text style={styles.boldText}>{selectedCallDay.formatted_talk_time}</Text> talk time
                      </Text>
                      <Text style={styles.tooltipItem}>
                        ⚡ Avg: <Text style={styles.boldText}>{selectedCallDay.formatted_avg_duration || '0m 0s'}</Text>
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Chart 2: Daily Talk Time Chart */}
            {data.trend && data.trend.length > 0 && (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View>
                    <Text style={styles.chartTitle}>Daily Talk Time</Text>
                    <Text style={styles.chartSubtitle}>
                      X-axis date • Y-axis talk duration
                    </Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
                      <Text style={styles.legendText}>Talk Duration</Text>
                    </View>
                  </View>
                </View>

                {/* Interactive Talk Time Chart Track */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chartScrollTrack}
                >
                  <View style={styles.chartContainer}>
                    <View style={styles.chartBaseline} />

                    <View style={styles.barsContainer}>
                      {data.trend.map((item) => {
                        const talkHeight = Math.max(
                          item.talk_time_seconds > 0 ? CHART_MIN_BAR_HEIGHT : 0,
                          Math.round(
                            ((item.talk_time_seconds || 0) / maxTalkSeconds) * CHART_MAX_HEIGHT
                          )
                        );
                        const isSelected = selectedTalkDay?.date === item.date;

                        return (
                          <Pressable
                            key={item.date}
                            accessibilityRole="button"
                            accessibilityLabel={`${item.display_date}: ${item.formatted_talk_time} talk time`}
                            onPress={() => setSelectedTalkDay(item)}
                            style={styles.barCol}
                          >
                            {/* Formatted duration snippet above bar */}
                            <Text
                              style={[
                                styles.barTopDuration,
                                isSelected && { color: '#059669', fontWeight: '800' },
                              ]}
                              numberOfLines={1}
                            >
                              {item.talk_time_seconds > 0
                                ? item.talk_time_seconds >= 3600
                                  ? `${Math.round(item.talk_time_seconds / 3600)}h`
                                  : `${Math.round(item.talk_time_seconds / 60)}m`
                                : '0m'}
                            </Text>

                            <View style={styles.barSlot}>
                              <View
                                style={[
                                  styles.barTalkTime,
                                  {
                                    height: talkHeight,
                                    backgroundColor: isSelected ? '#047857' : '#10B981',
                                  },
                                ]}
                              />
                            </View>

                            <Text
                              style={[
                                styles.barDateLabel,
                                isSelected && styles.barDateLabelSelected,
                              ]}
                            >
                              {item.display_date}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>

                {/* Selected Talk Time Details Tooltip */}
                {selectedTalkDay && (
                  <View style={styles.tooltipBox}>
                    <View style={styles.tooltipHeader}>
                      <Text style={styles.tooltipDate}>{selectedTalkDay.display_date}</Text>
                      <Text style={[styles.tooltipSummary, { color: '#059669' }]}>
                        {selectedTalkDay.formatted_talk_time} connected talk time
                      </Text>
                    </View>
                    <View style={styles.tooltipDetailsRow}>
                      <Text style={styles.tooltipItem}>
                        📞 <Text style={styles.boldText}>{selectedTalkDay.connected_calls}</Text> connected calls
                      </Text>
                      <Text style={styles.tooltipItem}>
                        ⏳ Avg:{' '}
                        <Text style={styles.boldText}>
                          {selectedTalkDay.formatted_avg_duration || '0m 0s'}
                        </Text>
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Quick Links / Tips */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Calling Metrics Guide</Text>
              <Text style={styles.tipsText}>
                • <Text style={styles.boldText}>Talk Time</Text> measures actual connected conversation duration, excluding ringing, busy signals, and wrong numbers.
              </Text>
              <Text style={styles.tipsText}>
                • <Text style={styles.boldText}>Average Talk Time</Text> reflects average length per connected call, helping you measure consultation depth.
              </Text>
              <Text style={styles.tipsText}>
                • Date boundaries are evaluated in your local shift timezone.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View points ledger breakup"
                onPress={() => router.push('/points-breakup' as never)}
                style={styles.pointsLinkBtn}
              >
                <Text style={styles.pointsLinkText}>View Points Ledger & Breakup →</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
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
      gap: 12,
    },
    headerTitles: {
      flex: 1,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    refreshButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    refreshIcon: {
      fontSize: 16,
    },
    pressed: {
      opacity: 0.7,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
      gap: 16,
    },

    // Filter Section
    filterSection: {
      gap: 10,
    },
    filterTrack: {
      gap: 8,
      paddingVertical: 2,
    },
    filterPill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterPillText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },

    // Custom Date Range
    customDateBox: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    customDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    datePickerCol: {
      flex: 1,
      gap: 4,
    },
    dateLabel: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 0.5,
    },
    dateSelectBtn: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateSelectText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    dateSeparator: {
      marginHorizontal: 10,
      color: colors.muted,
      fontWeight: '600',
      marginTop: 14,
    },
    validationError: {
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
    },

    // Error & Loading
    errorBanner: {
      backgroundColor: colors.danger + '18',
      borderColor: colors.danger + '40',
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    errorText: {
      color: colors.danger,
      fontSize: 13,
      flex: 1,
      fontWeight: '600',
    },
    retryBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.danger,
    },
    retryText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    loadingBox: {
      paddingVertical: 40,
      alignItems: 'center',
      gap: 10,
    },
    loadingText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '600',
    },

    // 3 Summary Cards
    summaryCardsGrid: {
      gap: 12,
    },
    metricCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    metricCardPrimary: {
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
    },
    metricCardSecondary: {
      borderLeftWidth: 4,
      borderLeftColor: '#10B981',
    },
    metricCardTertiary: {
      borderLeftWidth: 4,
      borderLeftColor: '#8B5CF6',
    },
    metricCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    metricBadgeIcon: {
      fontSize: 14,
    },
    metricCardLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 0.5,
    },
    metricMainValue: {
      fontSize: 28,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.5,
    },
    metricFooter: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    metricFooterHighlight: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    metricFooterSub: {
      fontSize: 12,
      color: colors.muted,
    },
    metricExtraSub: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },

    // Empty state
    emptyStateBox: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
      marginVertical: 4,
    },
    emptyStateIcon: {
      fontSize: 36,
      marginBottom: 4,
    },
    emptyStateTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    emptyStateSubtitle: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: 8,
    },
    emptyStateBtn: {
      marginTop: 8,
      backgroundColor: colors.accent,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    emptyStateBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },

    // Charts
    chartCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    chartHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    chartTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    chartSubtitle: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    legendRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 11,
      color: colors.muted,
      fontWeight: '600',
    },

    // Chart Track & Bars
    chartScrollTrack: {
      paddingVertical: 6,
    },
    chartContainer: {
      position: 'relative',
      minWidth: '100%',
    },
    chartBaseline: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 22,
      height: 1,
      backgroundColor: colors.border,
    },
    barsContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 14,
      paddingBottom: 22,
      minHeight: CHART_MAX_HEIGHT + 36,
    },
    barCol: {
      alignItems: 'center',
      width: 44,
      gap: 4,
    },
    barTopValue: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.muted,
      minHeight: 14,
    },
    barTopDuration: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.muted,
      minHeight: 14,
    },
    barSlot: {
      height: CHART_MAX_HEIGHT,
      justifyContent: 'flex-end',
      alignItems: 'center',
      width: 22,
    },
    barTotal: {
      width: 22,
      borderRadius: 6,
      borderWidth: 1,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    barConnected: {
      width: '100%',
      borderRadius: 4,
    },
    barTalkTime: {
      width: 20,
      borderRadius: 6,
    },
    barDateLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.muted,
      marginTop: 4,
    },
    barDateLabelSelected: {
      color: colors.accent,
      fontWeight: '800',
    },

    // Tooltip
    tooltipBox: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    tooltipHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    tooltipDate: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
    },
    tooltipSummary: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
    },
    tooltipDetailsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center',
    },
    tooltipItem: {
      fontSize: 12,
      color: colors.text,
    },
    boldText: {
      fontWeight: '800',
    },

    // Tips card
    tipsCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    tipsTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 2,
    },
    tipsText: {
      fontSize: 12,
      color: colors.muted,
      lineHeight: 18,
    },
    pointsLinkBtn: {
      marginTop: 8,
      alignSelf: 'flex-start',
    },
    pointsLinkText: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.accent,
    },
  });

