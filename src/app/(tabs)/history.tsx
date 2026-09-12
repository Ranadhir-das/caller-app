import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
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

import { SafeAreaView } from 'react-native-safe-area-context';

import { useLeads } from '@/context/LeadContext';
import { CallHistory } from '@/types';

type FilterType = 'all' | CallHistory['outcome'];

export default function HistoryScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const { callHistory } = useLeads();

  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('all');

  const filters: {
    id: FilterType;
    label: string;
  }[] = [
    {
      id: 'all',
      label: 'All',
    },
    {
      id: 'interested',
      label: 'Interested',
    },
    {
      id: 'not_interested',
      label: 'Not Interested',
    },
    {
      id: 'no_answer',
      label: 'No Answer',
    },
    {
      id: 'busy',
      label: 'Busy',
    },
    {
      id: 'call_back',
      label: 'Call Back',
    },
    {
      id: 'wrong_number',
      label: 'Wrong Number',
    },
  ];

  const filteredHistory = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    const filtered = callHistory.filter((item) => {
      const matchesSearch =
        !search ||
        item.leadName.toLowerCase().includes(search) ||
        item.phone.includes(search);

      const matchesFilter =
        selectedFilter === 'all' ||
        item.outcome === selectedFilter;

      return matchesSearch && matchesFilter;
    });

    return [...filtered].sort(
      (a, b) =>
        new Date(b.calledAt).getTime() -
        new Date(a.calledAt).getTime()
    );
  }, [callHistory, searchText, selectedFilter]);

  const getOutcomeLabel = (
    outcome: CallHistory['outcome']
  ) => {
    switch (outcome) {
      case 'interested':
        return 'Interested';

      case 'not_interested':
        return 'Not Interested';

      case 'no_answer':
        return 'No Answer';

      case 'busy':
        return 'Busy';

      case 'call_back':
        return 'Call Back';

      case 'wrong_number':
        return 'Wrong Number';

      default:
        return 'Called';
    }
  };

  const getOutcomeStyle = (
    outcome: CallHistory['outcome']
  ) => {
    switch (outcome) {
      case 'interested':
        return {
          container: styles.outcomeInterested,
          text: styles.outcomeInterestedText,
        };

      case 'not_interested':
        return {
          container: styles.outcomeNotInterested,
          text: styles.outcomeNotInterestedText,
        };

      case 'no_answer':
        return {
          container: styles.outcomeNoAnswer,
          text: styles.outcomeNoAnswerText,
        };

      case 'busy':
        return {
          container: styles.outcomeBusy,
          text: styles.outcomeBusyText,
        };

      case 'call_back':
        return {
          container: styles.outcomeCallBack,
          text: styles.outcomeCallBackText,
        };

      case 'wrong_number':
        return {
          container: styles.outcomeWrongNumber,
          text: styles.outcomeWrongNumberText,
        };

      default:
        return {
          container: styles.outcomeBadge,
          text: styles.outcomeText,
        };
    }
  };

  const formatDate = (date: string) => {
    const value = new Date(date);
    const now = new Date();

    const isToday =
      value.toDateString() === now.toDateString();

    const yesterday = new Date(now);

    yesterday.setDate(now.getDate() - 1);

    const isYesterday =
      value.toDateString() ===
      yesterday.toDateString();

    const time = value.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });

    if (isToday) {
      return `Today • ${time}`;
    }

    if (isYesterday) {
      return `Yesterday • ${time}`;
    }

    const datePart = value.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

    return `${datePart} • ${time}`;
  };

  const formatFollowUpDate = (date: string) => {
    const value = new Date(date);

    return value.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );
  };

  const renderHistoryItem = ({
    item,
  }: {
    item: CallHistory;
  }) => {
    const outcomeStyle = getOutcomeStyle(
      item.outcome
    );

    return (
      <Pressable
        style={styles.historyCard}
        onPress={() => {
          router.push({
            pathname: '/call-history-details',
            params: {
              id: item.id,
            },
          });
        }}
      >
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.leadName
                .charAt(0)
                .toUpperCase()}
            </Text>
          </View>

          <View style={styles.leadInfo}>
            <Text style={styles.leadName}>
              {item.leadName}
            </Text>

            <Text style={styles.phone}>
              {item.phone}
            </Text>
          </View>

          <View
            style={[
              styles.outcomeBadge,
              outcomeStyle.container,
            ]}
          >
            <Text
              style={[
                styles.outcomeText,
                outcomeStyle.text,
              ]}
            >
              {getOutcomeLabel(item.outcome)}
            </Text>
          </View>

          <Text style={styles.chevron}>
            ›
          </Text>
        </View>

        {item.notes ? (
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>
              Notes
            </Text>

            <Text style={styles.notes}>
              {item.notes}
            </Text>
          </View>
        ) : null}

        {item.followUpDate ? (
          <View style={styles.followUpContainer}>
            <Text style={styles.followUpIcon}>
              📅
            </Text>

            <View>
              <Text style={styles.followUpLabel}>
                Follow-up
              </Text>

              <Text style={styles.followUpDate}>
                {formatFollowUpDate(
                  item.followUpDate
                )}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.date}>
          {formatDate(item.calledAt)}
        </Text>
      </Pressable>
    );
  };

  const interestedCount = callHistory.filter(
    (item) => item.outcome === 'interested'
  ).length;

  const callBackCount = callHistory.filter(
    (item) => item.outcome === 'call_back'
  ).length;

  const noAnswerCount = callHistory.filter(
    (item) => item.outcome === 'no_answer'
  ).length;

  const notInterestedCount = callHistory.filter(
    (item) =>
      item.outcome === 'not_interested'
  ).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}

      <Text style={styles.title}>
        Call History
      </Text>

      <Text style={styles.subtitle}>
        {callHistory.length}{' '}
        {callHistory.length === 1
          ? 'call'
          : 'calls'}{' '}
        recorded
      </Text>

      {/* Search */}

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>
          🔎
        </Text>

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
          contentContainerStyle={
            styles.filterList
          }
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
            {interestedCount}
          </Text>

          <Text style={styles.summaryLabel}>
            Interested
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {callBackCount}
          </Text>

          <Text style={styles.summaryLabel}>
            Call Back
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {noAnswerCount}
          </Text>

          <Text style={styles.summaryLabel}>
            No Answer
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryNumber}>
            {notInterestedCount}
          </Text>

          <Text style={styles.summaryLabel}>
            Not Interested
          </Text>
        </View>
      </View>

      {/* History */}

      {callHistory.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.icon}>
            📞
          </Text>

          <Text style={styles.emptyTitle}>
            No call history
          </Text>

          <Text style={styles.emptyText}>
            Completed calls will be recorded
            here.
          </Text>
        </View>
      ) : filteredHistory.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.icon}>
            🔎
          </Text>

          <Text style={styles.emptyTitle}>
            No matching calls
          </Text>

          <Text style={styles.emptyText}>
            Try changing the search or
            selected filter.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredHistory}
          keyExtractor={(item) => item.id}
          renderItem={renderHistoryItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
    paddingTop: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },

  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.muted,
  },

  searchContainer: {
    marginTop: 16,
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
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },

  summaryNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },

  summaryLabel: {
    marginTop: 4,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },

  list: {
    paddingTop: 20,
    paddingBottom: 30,
  },

  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.secondary,
  },

  leadInfo: {
    flex: 1,
    marginLeft: 12,
  },

  leadName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  phone: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },

  outcomeBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  outcomeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },

  outcomeInterested: {
    backgroundColor: colors.successSoft,
  },

  outcomeInterestedText: {
    color: colors.success,
  },

  outcomeNotInterested: {
    backgroundColor: colors.dangerSoft,
  },

  outcomeNotInterestedText: {
    color: colors.danger,
  },

  outcomeNoAnswer: {
    backgroundColor: colors.surfaceMuted,
  },

  outcomeNoAnswerText: {
    color: colors.secondary,
  },

  outcomeBusy: {
    backgroundColor: colors.orangeSoft,
  },

  outcomeBusyText: {
    color: colors.orange,
  },

  outcomeCallBack: {
    backgroundColor: colors.accentSoft,
  },

  outcomeCallBackText: {
    color: colors.accent,
  },

  outcomeWrongNumber: {
    backgroundColor: colors.dangerSoft,
  },

  outcomeWrongNumberText: {
    color: colors.danger,
  },

  notesContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },

  notes: {
    marginTop: 4,
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
  },

  followUpContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.orangeSoft,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  followUpIcon: {
    color: colors.text,
    fontSize: 18,
    marginRight: 9,
  },

  followUpLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.orange,
  },

  followUpDate: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: colors.orange,
  },

  date: {
    marginTop: 12,
    fontSize: 12,
    color: colors.placeholder,
  },

  chevron: {
    marginLeft: 8,
    fontSize: 26,
    color: colors.placeholder,
    fontWeight: '400',
  },

  emptyCard: {
    marginTop: 30,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
  },

  icon: {
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