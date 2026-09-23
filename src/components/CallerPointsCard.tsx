import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme } from '@/context/AppThemeContext';
import { makeStyles } from '@/components/employee/shared';
import { getMyPoints, type CallerPoints } from '@/services/points';

export function CallerPointsCard() {
  const { user, token } = useAuth();
  if (user?.role !== 'CALLER' || !token) return null;
  return <PointsCard key={user.id} token={token} />;
}

function PointsCard({ token }: { token: string }) {
  const styles = useAppStyles(makeStyles);
  const { colors } = useAppTheme();
  const [data, setData] = useState<CallerPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const active = useRef(false);
  const requestId = useRef(0);
  const pending = useRef(false);

  const load = useCallback(async () => {
    if (!active.current || pending.current) return;
    pending.current = true;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await getMyPoints(token);
      if (active.current && id === requestId.current) { setData(result); setError(''); }
    } catch (e) {
      if (active.current && id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to load points.');
    } finally {
      if (id === requestId.current) { pending.current = false; if (active.current) setLoading(false); }
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    active.current = true;
    void load();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60_000);
    return () => {
      active.current = false;
      requestId.current += 1;
      pending.current = false;
      subscription.remove();
      clearInterval(timer);
    };
  }, [load]));

  const summary = data?.summary;
  return (
    <View style={[styles.card, { marginBottom: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={styles.heading}>My points</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh my points" disabled={loading} onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
          {loading ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: colors.primary, fontWeight: '600' }}>Refresh</Text>}
        </Pressable>
      </View>
      {summary && <>
        <View><Text style={{ fontSize: 36, fontWeight: '800', color: colors.text }}>{summary.lifetime_points ?? summary.total_points}</Text><Text style={styles.subtitle}>{summary.lifetime_points === undefined ? 'Points in the last 30 days' : 'All-time points'}</Text></View>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          {([['Today', summary.daily_points], ['This week', summary.weekly_points], ['This month', summary.monthly_points]] as const).map(([label, value]) => <View key={label} style={{ gap: 4 }}><Text style={styles.heading}>{value}</Text><Text style={styles.subtitle}>{label}</Text></View>)}
        </View>
        <Text style={styles.subtitle}>CRM totals • India time</Text>
        <Text style={styles.label}>Recent points • last 30 days</Text>
        {data.results.slice(0, 5).map((entry) => <View key={entry.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}><Text style={styles.label}>{entry.event_display}</Text><Text style={styles.subtitle}>{entry.reason}</Text><Text style={styles.subtitle}>{new Date(entry.occurred_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</Text></View>
          <Text style={[styles.heading, { color: entry.points < 0 ? colors.danger : colors.success }]}>{entry.points > 0 ? '+' : ''}{entry.points}</Text>
        </View>)}
        {!data.results.length && <Text style={styles.subtitle}>No points activity in the last 30 days.</Text>}
      </>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{data ? 'Showing previously loaded points. ' : ''}{error}</Text>}
    </View>
  );
}
