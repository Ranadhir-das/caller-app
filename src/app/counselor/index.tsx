import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme } from '@/context/AppThemeContext';
import { CounselorLeadRow, createCounselorStyles, relativeDate } from '@/components/counselor/ui';
import { VectorIcon } from '@/components/VectorIcon';
import { ActivityStatusWidget } from '@/components/ActivityStatusWidget';
import {
  COUNSELOR_TEAL,
  COUNSELOR_TEAL_SOFT_DARK,
  COUNSELOR_TEAL_SOFT_LIGHT,
  counselorApi,
  type CounselorDashboard,
} from '@/services/counselor';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

type StatCardDef = {
  id: string;
  label: string;
  value: number | undefined;
  icon: 'leads' | 'clock' | 'check-circle' | 'admission';
  onPress: () => void;
};

export default function CounselorDashboardScreen() {
  const styles = useAppStyles(createCounselorStyles);
  const { mode } = useAppTheme();
  const isDark = mode === 'dark';
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
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const stats = data?.stats;

  const statCards: StatCardDef[] = [
    {
      id: 'assigned',
      label: 'Assigned leads',
      value: stats?.forwarded_leads ?? stats?.assigned_leads,
      icon: 'leads',
      onPress: () =>
        router.push({
          pathname: '/counselor/leads',
          params: { section: 'FORWARDED', filter: 'ALL' },
        } as never),
    },
    {
      id: 'pending',
      label: 'Pending leads',
      value: stats?.pending_leads ?? stats?.pending_counselling,
      icon: 'clock',
      onPress: () =>
        router.push({
          pathname: '/counselor/leads',
          params: { section: 'FORWARDED', filter: 'PENDING' },
        } as never),
    },
    {
      id: 'contacted',
      label: 'Contacted leads',
      value: stats?.contacted_leads,
      icon: 'check-circle',
      onPress: () =>
        router.push({
          pathname: '/counselor/leads',
          params: { section: 'FORWARDED', filter: 'CONTACTED' },
        } as never),
    },
    {
      id: 'today',
      label: 'Contacted today',
      value: stats?.today_contacted,
      icon: 'check-circle',
      onPress: () =>
        router.push({
          pathname: '/counselor/leads',
          params: { section: 'FORWARDED', filter: 'TODAY' },
        } as never),
    },
    {
      id: 'admissions',
      label: 'Admission requests',
      value: stats?.admission_requests,
      icon: 'admission',
      onPress: () =>
        router.push({
          pathname: '/counselor/leads',
          params: { section: 'FORWARDED', filter: 'ADMISSION' },
        } as never),
    },
  ];

  const firstName = (data?.counselor.name || user?.name || user?.username || 'Counselor').split(' ')[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COUNSELOR_TEAL} />}
      >
        {/* Compact, clean greeting area */}
        <View style={styles.compactHeader}>
          <Text style={styles.dashboardTitle}>Counselor Dashboard</Text>
          <Text style={styles.dashboardSubtitle}>
            {greeting()}, {firstName} · Counselling Desk
          </Text>
        </View>

        <ActivityStatusWidget />

        {/* Quick Capture Banner */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick Capture leads from screenshot"
          style={({ pressed }) => [
            styles.createLeadBanner,
            {
              backgroundColor: isDark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT,
              borderColor: COUNSELOR_TEAL + '50',
            },
            pressed && styles.pressed,
          ]}
          onPress={() => router.push('/counselor/quick-capture' as never)}
        >
          <View style={[styles.createLeadIcon, { backgroundColor: COUNSELOR_TEAL }]}>
            <VectorIcon name="camera" color="#FFFFFF" size={18} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.createLeadTitle, { color: COUNSELOR_TEAL }]}>Quick Capture (Screenshot)</Text>
            <Text style={styles.createLeadSubtitle}>Upload screenshot or share to Vaani to auto-detect numbers</Text>
          </View>
          <VectorIcon name="chevron-right" color={COUNSELOR_TEAL} size={18} />
        </Pressable>

        {/* Add Lead Banner */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create and assign new lead"
          style={({ pressed }) => [styles.createLeadBanner, pressed && styles.pressed]}
          onPress={() => router.push('/counselor/add-lead' as never)}
        >
          <View style={styles.createLeadIcon}>
            <VectorIcon name="user-plus" color="#FFFFFF" size={18} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.createLeadTitle}>Add Lead & Assign Caller</Text>
            <Text style={styles.createLeadSubtitle}>Directly intake a student and assign to an active caller</Text>
          </View>
          <VectorIcon name="chevron-right" color={COUNSELOR_TEAL} size={18} />
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Clickable Report & Statistics Cards */}
        <View style={styles.statsGrid}>
          {statCards.map((card) => (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${card.label}: ${card.value ?? 0}`}
              style={({ pressed }) => [styles.statCard, pressed && styles.statCardPressed]}
              onPress={card.onPress}
            >
              <View style={styles.statCardHeader}>
                <Text style={styles.statValue}>{card.value ?? '–'}</Text>
                <View style={styles.statCardArrow}>
                  <VectorIcon name="chevron-right" color={COUNSELOR_TEAL} size={14} />
                </View>
              </View>
              <Text style={styles.statLabel}>{card.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Recently Forwarded Section */}
        <Text style={styles.sectionTitle}>Recently forwarded</Text>
        {data && data.recent_leads.length === 0 ? (
          <Text style={styles.empty}>No leads have been forwarded to you yet.</Text>
        ) : null}
        {data?.recent_leads.map((lead) => (
          <CounselorLeadRow
            key={lead.id}
            lead={lead}
            styles={styles}
            onPress={() =>
              router.push({
                pathname: '/counselor-lead' as never,
                params: { id: String(lead.id) },
              } as never)
            }
          />
        ))}

        {/* Recent Activity Section */}
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <View style={styles.card}>
          {data && data.activity.length === 0 ? <Text style={styles.empty}>Nothing yet today.</Text> : null}
          {data?.activity.map((item, index) => (
            <View key={`${item.type}-${item.lead_id}-${index}`} style={styles.activityRow}>
              <View style={styles.activityDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activityText}>
                  {item.lead_name} — {item.text}
                </Text>
                <Text style={styles.activityTime}>{relativeDate(item.at)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
