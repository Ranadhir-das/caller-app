import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import {
  FlatList,
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
  const { leads } = useLeads();

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

          <Text style={styles.phone}>
            📞 {item.phone}
          </Text>
        </View>

        <View
          style={[
            styles.status,
            {
              backgroundColor:
                item.status === 'pending'
                  ? '#FEF3C7'
                  : `${getStatusColor(item.status)}18`,
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: getStatusColor(item.status),
              },
            ]}
          >
            {getStatusLabel(item.status)}
          </Text>
        </View>

        <Text style={styles.chevron}>
          ›
        </Text>
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

      {/* Search */}

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>
          🔎
        </Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search name or phone number"
          placeholderTextColor="#9CA3AF"
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
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>
            👥
          </Text>

          <Text style={styles.emptyTitle}>
            No students assigned
          </Text>

          <Text style={styles.emptyText}>
            Students assigned by the admin will
            appear here.
          </Text>
        </View>
      ) : filteredLeads.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>
            🔎
          </Text>

          <Text style={styles.emptyTitle}>
            No students found
          </Text>

          <Text style={styles.emptyText}>
            Try changing the search or selected
            filter.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredLeads}
          keyExtractor={(item) => item.id}
          renderItem={renderLead}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
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
    color: '#111827',
  },

  subtitle: {
    marginTop: 5,
    fontSize: 14,
    color: '#6B7280',
  },

  countBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  countText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  searchContainer: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },

  filterWrapper: {
    marginTop: 14,
    marginHorizontal: -20,
  },

  filterList: {
    paddingHorizontal: 20,
  },

  filterButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 9,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  filterButtonSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },

  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },

  filterTextSelected: {
    color: '#FFFFFF',
  },

  summaryCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
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
    color: '#111827',
  },

  summaryLabel: {
    marginTop: 3,
    fontSize: 12,
    color: '#6B7280',
  },

  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },

  list: {
    paddingTop: 18,
    paddingBottom: 20,
  },

  leadCard: {
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563EB',
  },

  leadInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  phone: {
    marginTop: 5,
    fontSize: 13,
    color: '#374151',
  },

  status: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },

  chevron: {
    marginLeft: 7,
    fontSize: 25,
    color: '#9CA3AF',
    fontWeight: '400',
  },

  emptyCard: {
    marginTop: 25,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
  },

  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },

  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});