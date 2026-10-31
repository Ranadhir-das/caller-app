import { isCallerCapable } from '@/services/capabilities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { makeStyles } from '@/components/employee/shared';
import {
  getMyPoints,
  getCallerProgress,
  type CallerPoints,
  type CallerProgressData,
} from '@/services/points';

export function CallerPointsCard() {
  const { user, token } = useAuth();
  if (!user || !isCallerCapable(user) || !token) return null;
  return <PointsCard key={user.id} token={token} />;
}

const POSITIVE_ZONE_HEIGHT = 85;
const MAX_BAR_HEIGHT = 65;

function PointsCard({ token }: { token: string }) {
  const styles = useAppStyles(makeStyles);
  const cardStyles = useAppStyles(createCardStyles);
  const { colors } = useAppTheme();

  const [data, setData] = useState<CallerPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Expandable all callers progress state
  const [expanded, setExpanded] = useState(false);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [progressData, setProgressData] = useState<CallerProgressData | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');

  const active = useRef(false);
  const requestId = useRef(0);
  const pending = useRef(false);

  const progressRequestId = useRef(0);

  const load = useCallback(async () => {
    if (!active.current || pending.current) return;
    pending.current = true;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await getMyPoints(token);
      if (active.current && id === requestId.current) {
        setData(result);
        setError('');
      }
    } catch (e) {
      if (active.current && id === requestId.current) {
        setError(e instanceof Error ? e.message : 'Unable to load points.');
      }
    } finally {
      if (id === requestId.current) {
        pending.current = false;
        if (active.current) setLoading(false);
      }
    }
  }, [token]);

  const loadProgress = useCallback(
    async (tf: 'day' | 'week' | 'month' | 'year') => {
      const id = ++progressRequestId.current;
      setProgressLoading(true);
      setProgressError('');
      try {
        const result = await getCallerProgress(token, tf);
        if (active.current && id === progressRequestId.current) {
          setProgressData(result);
          setProgressError('');
        }
      } catch (e) {
        if (active.current && id === progressRequestId.current) {
          setProgressError(e instanceof Error ? e.message : 'Unable to load caller progress.');
        }
      } finally {
        if (active.current && id === progressRequestId.current) {
          setProgressLoading(false);
        }
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void load();
      if (expanded) {
        void loadProgress(timeframe);
      }
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void load();
          if (expanded) void loadProgress(timeframe);
        }
      });
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') {
          void load();
          if (expanded) void loadProgress(timeframe);
        }
      }, 60_000);
      return () => {
        active.current = false;
        requestId.current += 1;
        progressRequestId.current += 1;
        pending.current = false;
        subscription.remove();
        clearInterval(timer);
      };
    }, [load, loadProgress, expanded, timeframe])
  );

  // When timeframe changes and expanded is open, load progress
  useEffect(() => {
    if (expanded && active.current) {
      void loadProgress(timeframe);
    }
  }, [timeframe, expanded, loadProgress]);

  const summary = data?.summary;
  const maximum = progressData?.maximum || 1;

  const timeframeLabel =
    timeframe === 'day' ? 'Day' : timeframe === 'week' ? 'Week' : timeframe === 'month' ? 'Month' : 'Year';

  return (
    <View style={[styles.card, cardStyles.compactCard]}>
      {/* Compact Top Header with Breakup Pill & Refresh */}
      <View style={cardStyles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={cardStyles.heading}>My Points</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View points breakup"
            onPress={() => router.push('/points-breakup' as never)}
            style={cardStyles.breakupPill}
          >
            <Text style={cardStyles.breakupPillText}>Breakup ›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View calling performance"
            onPress={() => router.push('/performance' as never)}
            style={[cardStyles.breakupPill, { backgroundColor: colors.accent + '16', borderColor: colors.accent + '30' }]}
          >
            <Text style={[cardStyles.breakupPillText, { color: colors.accent }]}>Performance ›</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh points"
          disabled={loading || progressLoading}
          onPress={() => {
            void load();
            if (expanded) void loadProgress(timeframe);
          }}
          hitSlop={8}
          style={{ justifyContent: 'center', paddingHorizontal: 4 }}
        >
          {loading || progressLoading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Refresh</Text>
          )}
        </Pressable>
      </View>

      {/* Sleek Tappable Metrics Row -> Opens Points Breakup */}
      {summary && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View points breakup"
          onPress={() => router.push('/points-breakup' as never)}
          style={cardStyles.metricsRow}
        >
          {/* Performance Points */}
          <View style={cardStyles.metricBlock}>
            <Text style={cardStyles.metricLabel}>PERFORMANCE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 1 }}>
              <Text style={cardStyles.metricValue}>
                {summary.performance_points ?? summary.lifetime_points ?? summary.total_points}
              </Text>
              <Text style={cardStyles.metricUnit}>pts</Text>
              <Text style={cardStyles.metricSub}>
                ({summary.weekly_points >= 0 ? `+${summary.weekly_points}` : summary.weekly_points} wk)
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={cardStyles.metricDivider} />

          {/* Peer Appreciation */}
          <View style={cardStyles.metricBlock}>
            <Text style={cardStyles.metricLabel}>PEER RATING</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 1 }}>
              {data?.peer_appreciation?.average_score !== null && data?.peer_appreciation?.average_score !== undefined ? (
                <>
                  <Text style={[cardStyles.metricValue, { color: colors.primary }]}>
                    ★ {data.peer_appreciation.average_score}
                  </Text>
                  <Text style={cardStyles.metricSub}>
                    /10 ({data.peer_appreciation.review_count})
                  </Text>
                </>
              ) : (
                <Text style={cardStyles.metricSub}>No reviews</Text>
              )}
            </View>
          </View>

          <Text style={cardStyles.rowChevron}>›</Text>
        </Pressable>
      )}

      {/* Slim Expand / Collapse Bar */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle caller progress chart"
        onPress={() => setExpanded((prev) => !prev)}
        style={cardStyles.expandBar}
      >
        <Text style={cardStyles.expandBarTitle}>
          Caller Progress ({timeframeLabel})
        </Text>
        <Text style={cardStyles.arrowText}>{expanded ? '▲ Hide' : '▼ Chart'}</Text>
      </Pressable>

      {/* Expanded All Callers Bar Chart Section */}
      {expanded && (
        <View style={cardStyles.progressSection}>
          <Text style={cardStyles.progressTitle}>Caller progress</Text>
          <Text style={cardStyles.progressSubtitle}>
            Net points distribution across active callers in the selected range.
          </Text>

          {/* Timeframe Filters (Day, Week, Month, Year) */}
          <View style={cardStyles.filtersRow}>
            {(['day', 'week', 'month', 'year'] as const).map((tf) => {
              const isActive = timeframe === tf;
              const label =
                tf === 'day' ? 'Day' : tf === 'week' ? 'Week' : tf === 'month' ? 'Month' : 'Year';
              return (
                <Pressable
                  key={tf}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${label}`}
                  onPress={() => setTimeframe(tf)}
                  style={[cardStyles.filterPill, isActive && cardStyles.filterPillActive]}
                >
                  <Text style={[cardStyles.filterText, isActive && cardStyles.filterTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Loading / Error States */}
          {progressLoading && !progressData && (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={[styles.subtitle, { marginTop: 6, fontSize: 12 }]}>Loading caller points...</Text>
            </View>
          )}

          {!!progressError && (
            <Text accessibilityRole="alert" style={{ color: colors.danger, marginVertical: 6, fontSize: 12 }}>
              {progressError}
            </Text>
          )}

          {/* Bar Chart Matching Web Screenshot */}
          {progressData && progressData.callers && progressData.callers.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={cardStyles.barTrack}
            >
              {/* Continuous baseline line running through the track */}
              <View
                style={[
                  cardStyles.continuousBaseline,
                  { backgroundColor: colors.border },
                ]}
              />

              {progressData.callers.map((caller) => {
                const isPositive = caller.points >= 0;
                const barPercent = Math.min(100, Math.max(0, caller.bar_percent || 0));

                let barHeight = 4;
                if (caller.points === 0) {
                  barHeight = 4;
                } else {
                  barHeight = Math.max(6, Math.round((barPercent / 100) * MAX_BAR_HEIGHT));
                }

                return (
                  <View key={caller.caller_id} style={cardStyles.barColumn}>
                    {/* Zone above baseline (positive & zero bars + positive/zero score) */}
                    <View style={cardStyles.positiveZone}>
                      {isPositive ? (
                        <>
                          <Text style={cardStyles.scoreText}>{caller.points}</Text>
                          <View
                            style={[
                              cardStyles.barPillPositive,
                              { height: barHeight },
                              caller.is_me && cardStyles.barPillMe,
                            ]}
                          />
                        </>
                      ) : (
                        <Text style={[cardStyles.scoreText, { color: '#f43f5e' }]}>
                          {caller.points}
                        </Text>
                      )}
                    </View>

                    {/* Zone below baseline (negative bar if < 0) */}
                    <View style={cardStyles.negativeZone}>
                      {!isPositive && (
                        <View
                          style={[
                            cardStyles.barPillNegative,
                            { height: barHeight },
                          ]}
                        />
                      )}
                    </View>

                    {/* Caller Name & Calls Count */}
                    <Text
                      numberOfLines={1}
                      style={[
                        cardStyles.callerName,
                        caller.is_me && { color: colors.primary, fontWeight: '800' },
                      ]}
                      accessibilityLabel={caller.caller_name}
                    >
                      {caller.caller_name}
                    </Text>
                    <Text style={cardStyles.callerCalls}>{caller.calls} calls</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {progressData && progressData.callers && progressData.callers.length === 0 && (
            <Text style={[styles.subtitle, { textAlign: 'center', marginVertical: 12, fontSize: 12 }]}>
              No active callers recorded in this range.
            </Text>
          )}
        </View>
      )}

      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger, marginTop: 4, fontSize: 12 }}>
          {data ? 'Showing previously loaded points. ' : ''}
          {error}
        </Text>
      )}
    </View>
  );
}

const createCardStyles = (colors: AppColors) =>
  StyleSheet.create({
    compactCard: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 8,
      gap: 4,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 26,
    },
    heading: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.2,
    },
    breakupPill: {
      backgroundColor: colors.primary + '16',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    breakupPillText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    refreshText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricBlock: {
      flex: 1,
    },
    metricLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 0.5,
    },
    metricValue: {
      fontSize: 17,
      fontWeight: '900',
      color: colors.text,
      lineHeight: 20,
    },
    metricUnit: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    metricSub: {
      fontSize: 10,
      color: colors.muted,
      fontWeight: '600',
    },
    metricDivider: {
      width: 1,
      height: 22,
      backgroundColor: colors.border,
      marginHorizontal: 8,
    },
    rowChevron: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.primary,
      marginLeft: 4,
    },
    expandBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 6,
    },
    expandBarTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
    },
    arrowText: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
    },
    progressSection: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    progressTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    progressSubtitle: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 1,
      marginBottom: 8,
      lineHeight: 15,
    },
    filtersRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
    },
    filterPill: {
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    filterTextActive: {
      color: '#ffffff',
    },
    barTrack: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 8,
      paddingHorizontal: 2,
      minHeight: 150,
      position: 'relative',
    },
    continuousBaseline: {
      position: 'absolute',
      top: POSITIVE_ZONE_HEIGHT + 8,
      left: 0,
      right: 0,
      height: 1,
    },
    barColumn: {
      width: 74,
      alignItems: 'center',
    },
    positiveZone: {
      height: POSITIVE_ZONE_HEIGHT,
      width: '100%',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    scoreText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 3,
      textAlign: 'center',
    },
    barPillPositive: {
      width: 36,
      backgroundColor: '#8b5cf6',
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7,
      shadowColor: '#8b5cf6',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 5,
      elevation: 3,
    },
    barPillMe: {
      borderWidth: 1.5,
      borderColor: '#c4b5fd',
    },
    negativeZone: {
      minHeight: 20,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    barPillNegative: {
      width: 36,
      backgroundColor: '#f43f5e',
      borderBottomLeftRadius: 7,
      borderBottomRightRadius: 7,
      shadowColor: '#f43f5e',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 5,
      elevation: 3,
    },
    callerName: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      maxWidth: 74,
      marginTop: 4,
    },
    callerCalls: {
      fontSize: 10,
      color: colors.muted,
      textAlign: 'center',
      marginTop: 1,
    },
  });
