import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme } from '@/context/AppThemeContext';
import {
  CounselorCreatedLeadRow,
  CounselorLeadRow,
  createCounselorStyles,
} from '@/components/counselor/ui';
import {
  COUNSELOR_TEAL,
  counselorApi,
  type CounselorCreatedLeadSummary,
  type CounselorLeadSummary,
} from '@/services/counselor';

type TabSection = 'FORWARDED' | 'CREATED';
type FilterType = 'ALL' | 'PENDING' | 'CONTACTED';

export default function CounselorLeadsScreen() {
  const styles = useAppStyles(createCounselorStyles);
  const { colors } = useAppTheme();
  const { token } = useAuth();

  const [section, setSection] = useState<TabSection>('FORWARDED');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');

  // Forwarded leads state
  const [forwardedLeads, setForwardedLeads] = useState<CounselorLeadSummary[] | null>(null);

  // Created leads state
  const [createdLeads, setCreatedLeads] = useState<CounselorCreatedLeadSummary[] | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadForwarded = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const result = await counselorApi.leads(token, query);
      setForwardedLeads(result.leads);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your forwarded leads.');
    } finally {
      setRefreshing(false);
    }
  }, [token, query]);

  const loadCreated = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const result = await counselorApi.createdLeads(token, query);
      setCreatedLeads(result.leads);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your created leads.');
    } finally {
      setRefreshing(false);
    }
  }, [token, query]);

  const load = useCallback(() => {
    if (section === 'FORWARDED') {
      void loadForwarded();
    } else {
      void loadCreated();
    }
  }, [section, loadForwarded, loadCreated]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const allCount = forwardedLeads?.length ?? 0;
  const pendingCount = (forwardedLeads || []).filter((l) => l.counselor_contact_status === 'PENDING').length;
  const contactedCount = (forwardedLeads || []).filter((l) => l.counselor_contact_status === 'CONTACTED').length;

  const filteredForwardedLeads = (forwardedLeads || []).filter((lead) => {
    if (filter === 'PENDING') return lead.counselor_contact_status === 'PENDING';
    if (filter === 'CONTACTED') return lead.counselor_contact_status === 'CONTACTED';
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COUNSELOR_TEAL} />}
      >
        <Text style={styles.title}>Leads</Text>
        <Text style={styles.subtitle}>
          {section === 'FORWARDED'
            ? 'Students forwarded to you for counselling.'
            : 'Leads you created and assigned to callers.'}
        </Text>

        {/* Section Tabs: Forwarded to me vs Created by me */}
        <View style={styles.tabSelector}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'FORWARDED' }}
            onPress={() => {
              setSection('FORWARDED');
              setSearch('');
              setQuery('');
            }}
            style={[styles.tabButton, section === 'FORWARDED' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, section === 'FORWARDED' && styles.tabButtonTextActive]}>
              Forwarded to me {forwardedLeads ? `(${forwardedLeads.length})` : ''}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: section === 'CREATED' }}
            onPress={() => {
              setSection('CREATED');
              setSearch('');
              setQuery('');
            }}
            style={[styles.tabButton, section === 'CREATED' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabButtonText, section === 'CREATED' && styles.tabButtonTextActive]}>
              Created by me {createdLeads ? `(${createdLeads.length})` : ''}
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or phone"
          placeholderTextColor={colors.placeholder}
          style={styles.search}
          accessibilityLabel="Search leads"
        />

        {/* Filter row for Forwarded tab */}
        {section === 'FORWARDED' && (
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
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Content for Forwarded Leads */}
        {section === 'FORWARDED' && (
          <>
            {forwardedLeads && filteredForwardedLeads.length === 0 ? (
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
            {filteredForwardedLeads.map((lead) => (
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
          </>
        )}

        {/* Content for Created Leads */}
        {section === 'CREATED' && (
          <>
            {createdLeads && createdLeads.length === 0 ? (
              <Text style={styles.empty}>
                {query
                  ? `No matching created leads for "${query}".`
                  : 'No leads created by you yet. Use "Add Lead" to intake and assign new students.'}
              </Text>
            ) : null}
            {(createdLeads || []).map((lead) => (
              <CounselorCreatedLeadRow
                key={lead.id}
                lead={lead}
                styles={styles}
                onPress={() =>
                  router.push({
                    pathname: '/counselor-created-lead' as never,
                    params: { id: String(lead.id) },
                  } as never)
                }
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
