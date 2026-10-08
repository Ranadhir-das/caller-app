import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme } from '@/context/AppThemeContext';
import { CounselorLeadRow, createCounselorStyles } from '@/components/counselor/ui';
import { COUNSELOR_TEAL, counselorApi, type CounselorLeadSummary } from '@/services/counselor';

type FilterType = 'ALL' | 'PENDING' | 'CONTACTED';

export default function CounselorLeadsScreen() {
  const styles = useAppStyles(createCounselorStyles);
  const { colors } = useAppTheme();
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [leads, setLeads] = useState<CounselorLeadSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const result = await counselorApi.leads(token, query);
      setLeads(result.leads); setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your leads.');
    } finally { setRefreshing(false); }
  }, [token, query]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const allCount = leads?.length ?? 0;
  const pendingCount = (leads || []).filter(l => l.counselor_contact_status === 'PENDING').length;
  const contactedCount = (leads || []).filter(l => l.counselor_contact_status === 'CONTACTED').length;

  const filteredLeads = (leads || []).filter(lead => {
    if (filter === 'PENDING') return lead.counselor_contact_status === 'PENDING';
    if (filter === 'CONTACTED') return lead.counselor_contact_status === 'CONTACTED';
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COUNSELOR_TEAL} />}>
        <Text style={styles.title}>My leads</Text>
        <Text style={styles.subtitle}>Students forwarded to you for counselling.</Text>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search name or phone"
          placeholderTextColor={colors.placeholder} style={styles.search} accessibilityLabel="Search leads" />

        {/* Filter row: All | Pending | Contacted */}
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show all ${allCount} leads`}
            onPress={() => setFilter('ALL')}
            style={[styles.filterPill, filter === 'ALL' && styles.filterPillActive]}
          >
            <Text style={[styles.filterPillText, filter === 'ALL' && styles.filterPillTextActive]}>
              All ({allCount})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show ${pendingCount} pending leads`}
            onPress={() => setFilter('PENDING')}
            style={[styles.filterPill, filter === 'PENDING' && styles.filterPillPendingActive]}
          >
            <Text style={[styles.filterPillText, filter === 'PENDING' && styles.filterPillTextActive]}>
              Pending ({pendingCount})
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show ${contactedCount} contacted leads`}
            onPress={() => setFilter('CONTACTED')}
            style={[styles.filterPill, filter === 'CONTACTED' && styles.filterPillContactedActive]}
          >
            <Text style={[styles.filterPillText, filter === 'CONTACTED' && styles.filterPillTextActive]}>
              Contacted ({contactedCount})
            </Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {leads && filteredLeads.length === 0 ? (
          <Text style={styles.empty}>
            {query
              ? `No matching leads for "${query}".`
              : filter === 'PENDING'
                ? 'All your forwarded leads have been contacted.'
                : filter === 'CONTACTED'
                  ? 'No leads contacted yet. Call a student to begin.'
                  : 'No leads forwarded to you yet.'}
          </Text>
        ) : null}
        {filteredLeads.map(lead => (
          <CounselorLeadRow key={lead.id} lead={lead} styles={styles}
            onPress={() => router.push({ pathname: '/counselor-lead' as never, params: { id: String(lead.id) } } as never)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
