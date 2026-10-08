import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles } from '@/context/AppThemeContext';
import { CounselorLeadRow, createCounselorStyles, relativeDate } from '@/components/counselor/ui';
import { COUNSELOR_TEAL, counselorApi, type CounselorDashboard } from '@/services/counselor';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function CounselorDashboardScreen() {
  const styles = useAppStyles(createCounselorStyles);
  const { token, user } = useAuth();
  const [data, setData] = useState<CounselorDashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      setData(await counselorApi.dashboard(token));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
    } finally { setRefreshing(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const stats = data?.stats;
  const cards: [string, number | undefined][] = [
    ['Assigned leads', stats?.forwarded_leads ?? stats?.assigned_leads],
    ['Pending leads', stats?.pending_leads ?? stats?.pending_counselling],
    ['Contacted leads', stats?.contacted_leads],
    ['Contacted today', stats?.today_contacted],
    ['Admission requests', stats?.admission_requests],
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COUNSELOR_TEAL} />}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>COUNSELLING DESK</Text>
          <Text style={styles.heroTitle}>{greeting()}, {(data?.counselor.name || user?.name || user?.username || '').split(' ')[0]}</Text>
          <Text style={styles.heroSubtitle}>Guide each student calmly — review the caller's notes, talk, and record your counselling notes.</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.statsGrid}>
          {cards.map(([label, value]) => (
            <View key={label} style={styles.statCard} accessibilityLabel={`${label}: ${value ?? 0}`}>
              <Text style={styles.statValue}>{value ?? '–'}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Recently forwarded</Text>
        {data && data.recent_leads.length === 0 ? <Text style={styles.empty}>No leads have been forwarded to you yet.</Text> : null}
        {data?.recent_leads.map(lead => (
          <CounselorLeadRow key={lead.id} lead={lead} styles={styles}
            onPress={() => router.push({ pathname: '/counselor-lead' as never, params: { id: String(lead.id) } } as never)} />
        ))}

        <Text style={styles.sectionTitle}>Recent activity</Text>
        <View style={styles.card}>
          {data && data.activity.length === 0 ? <Text style={styles.empty}>Nothing yet today.</Text> : null}
          {data?.activity.map((item, index) => (
            <View key={`${item.type}-${item.lead_id}-${index}`} style={styles.activityRow}>
              <View style={styles.activityDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activityText}>{item.lead_name} — {item.text}</Text>
                <Text style={styles.activityTime}>{relativeDate(item.at)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
