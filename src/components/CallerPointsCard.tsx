import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
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
  if (user?.role !== 'CALLER' || !token) return null;
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
      {/* Top Header without down arrow */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.heading}>My points</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh points"
          disabled={loading || progressLoading}
          onPress={() => {
            void load();
            if (expanded) void loadProgress(timeframe);
          }}
          style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 }}
        >
          {loading || progressLoading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Refresh</Text>
          )}
        </Pressable>
      </View>

      {/* Separate Performance Points and Peer Appreciation Display */}
      {summary && (
        <View style={{ marginVertical: 8, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* Performance Points */}
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.subtitle, { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }]}>
                Performance Points
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 26, fontWeight: '900', color: colors.text, lineHeight: 30 }}>
                  {summary.performance_points ?? summary.lifetime_points ?? summary.total_points}
                </Text>
                <Text style={[styles.subtitle, { fontSize: 11 }]}>
                  ({summary.weekly_points} this week)
                </Text>
              </View>
            </View>

            {/* Peer Appreciation */}
            <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 12 }}>
              <Text style={[styles.subtitle, { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }]}>
                Peer Appreciation
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                {data?.peer_appreciation?.average_score !== null && data?.peer_appreciation?.average_score !== undefined ? (
                  <>
                    <Text style={{ fontSize: 26, fontWeight: '900', color: colors.primary, lineHeight: 30 }}>
                      {data.peer_appreciation.average_score}
                    </Text>
                    <Text style={[styles.subtitle, { fontSize: 11 }]}>
                      / 10 ({data.peer_appreciation.review_count} {data.peer_appreciation.review_count === 1 ? 'review' : 'reviews'})
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: colors.muted, lineHeight: 30 }}>
                      —
                    </Text>
                    <Text style={[styles.subtitle, { fontSize: 11 }]}>
                      / 10 (No reviews)
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Expand / Collapse Bar with Down Arrow */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle caller progress chart"
        onPress={() => setExpanded((prev) => !prev)}
        style={cardStyles.expandBar}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={cardStyles.expandBarTitle}>Caller Progress</Text>
          <Text style={cardStyles.expandBarSub}>({timeframeLabel})</Text>
        </View>
        <Text style={cardStyles.arrowText}>{expanded ? '▲' : '▼'}</Text>
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
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
      gap: 6,
    },
    arrowText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    expandBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
      paddingHorizontal: 10,
      marginTop: 4,
      borderRadius: 10,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    expandBarTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    expandBarSub: {
      fontSize: 12,
      color: colors.muted,
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
