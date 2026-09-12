import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import {
  SectionList,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  getStatusColor,
  getStatusLabel,
} from '@/utils/status';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeads } from '@/context/LeadContext';
import { Lead } from '@/types';

type FilterType = 'all' | Lead['status'];

export default function LeadsScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const { leads, refresh, refreshing, refreshError } = useLeads();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('all');

  const pendingCount = leads.filter(
    (item) => item.status === 'pending'
  ).length;

  const completedCount = leads.length - pendingCount;

  const filters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending', label: 'Pending' },
    { id: 'interested', label: 'Interested' },
    { id: 'not_interested', label: 'Not Interested' },
    { id: 'no_answer', label: 'No Answer' },
    { id: 'busy', label: 'Busy' },
    { id: 'call_back', label: 'Call Back' },
    { id: 'wrong_number', label: 'Wrong Number' },
  ];

  const filteredLeads = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return leads.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.phone.includes(search);

      const matchesFilter =
        selectedFilter === 'all' ||
        item.status === selectedFilter;

      return matchesSearch && matchesFilter;
    });
  }, [leads, searchText, selectedFilter]);


  const sections = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; data: Lead[]; count: number }>();
    filteredLeads.forEach(lead => {
      const key = String(lead.batchId ?? 'unbatched');
      if (!groups.has(key)) groups.set(key, { key, title: lead.batchName || 'Unbatched leads', data: [], count: 0 });
      const group = groups.get(key)!;
      group.count++;
      if (!collapsed.has(key)) group.data.push(lead);
    });
    return [...groups.values()];
  }, [filteredLeads, collapsed]);

  const renderLead = ({ item }: { item: Lead }) => {

    return (
      <Pressable
        style={styles.leadCard}
        onPress={() => {
          router.push({
            pathname: '/lead-details',
            params: {
              id: item.id,
            },
          });
        }}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.leadInfo}>
          <Text style={styles.name}>
            {item.name}
          </Text>

          <Text style={styles.phone}>{item.phone}</Text>
        </View>

        <View
          style={[
            styles.status,
            {
              backgroundColor:
                item.status === 'pending'
                  ? colors.warningSoft
                  : `${getStatusColor(item.status, mode)}18`,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: getStatusColor(item.status, mode),
              },
            ]}
          >
            {getStatusLabel(item.status)}
          </Text>
        </View>

        <View style={{ width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.muted, transform: [{ rotate: "45deg" }], marginLeft: 8 }} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            Students
          </Text>

          <Text style={styles.subtitle}>
            Your assigned students
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {leads.length}
          </Text>
        </View>
      </View>

      {refreshError && <Text style={{ color: colors.danger, marginBottom: 12 }}>{refreshError}</Text>}
      {/* Search */}

      <View style={styles.searchContainer}>
        <View style={{ width: 16, height: 16, borderWidth: 2, borderColor: colors.muted, borderRadius: 8, marginRight: 12 }}><View style={{ position: "absolute", width: 7, height: 2, backgroundColor: colors.muted, right: -5, bottom: -3, transform: [{ rotate: "45deg" }] }} /></View>

        <TextInput keyboardAppearance={mode}
          style={styles.searchInput}
          placeholder="Search name or phone number"
          placeholderTextColor={colors.placeholder}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
        />
      </View>

      {/* Filters */}

      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        >
          {filters.map((filter) => {
            const isSelected =
              selectedFilter === filter.id;

            return (
              <Pressable
                key={filter.id}
                style={[
                  styles.filterButton,
                  isSelected &&
                    styles.filterButtonSelected,
                ]}
                onPress={() => {
                  setSelectedFilter(filter.id);
                }}
              >
                <Text
                  style={[
                    styles.filterText,
                    isSelected &&
                      styles.filterTextSelected,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Summary */}

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {leads.length}
          </Text>

          <Text style={styles.summaryLabel}>
            Total
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {pendingCount}
          </Text>

          <Text style={styles.summaryLabel}>
            Pending
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {completedCount}
          </Text>

          <Text style={styles.summaryLabel}>
            Completed
          </Text>
        </View>
      </View>

      {/* Student List */}

      {leads.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyCard} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />} >


          <Text style={styles.emptyTitle}>
            No students assigned
          </Text>

          <Text style={styles.emptyText}>
            Students assigned by the admin will
            appear here.
          </Text>
        </ScrollView>
      ) : filteredLeads.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyCard} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />} >


          <Text style={styles.emptyTitle}>
            No students found
          </Text>

          <Text style={styles.emptyText}>
            Try changing the search or selected
            filter.
          </Text>
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          refreshing={refreshing}
          onRefresh={refresh}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed.has(section.key) }}
              onPress={() => setCollapsed(current => { const next = new Set(current); if (next.has(section.key)) next.delete(section.key); else next.add(section.key); return next; })}
              style={{ padding: 16, borderRadius: 14, backgroundColor: colors.accentSoft, marginBottom: 10 }}>
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>{section.title} ({section.count})</Text>
              <Text style={{ color: colors.secondary, marginTop: 4 }}>{collapsed.has(section.key) ? 'Tap to show leads' : 'Tap to collapse'}{section.key !== 'unbatched' ? ` - Batch #${section.key}` : ''}</Text>
            </Pressable>
          )}
          keyExtractor={(item) => item.id}
          renderItem={renderLead}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },

  header: {
    paddingTop: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },

  subtitle: {
    marginTop: 5,
    fontSize: 14,
    color: colors.muted,
  },

  countBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  countText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  searchContainer: {
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  searchIcon: {
    color: colors.text,
    fontSize: 18,
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },

  filterWrapper: {
    marginTop: 14,
    marginHorizontal: -20,
  },

  filterList: {
    paddingHorizontal: 20,
  },

  filterButton: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 9,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },

  filterButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.accent,
  },

  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
  },

  filterTextSelected: {
    color: colors.onPrimary,
  },

  summaryCard: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },

  summaryNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  summaryLabel: {
    marginTop: 3,
    fontSize: 12,
    color: colors.muted,
  },

  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },

  list: {
    paddingTop: 18,
    paddingBottom: 20,
  },

  leadCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
  },

  leadInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  phone: {
    marginTop: 5,
    fontSize: 13,
    color: colors.secondary,
  },

  status: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  statusText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },

  chevron: {
    marginLeft: 7,
    fontSize: 25,
    color: colors.placeholder,
    fontWeight: '400',
  },

  emptyCard: {
    marginTop: 25,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
  },

  emptyIcon: {
    color: colors.text,
    fontSize: 40,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});