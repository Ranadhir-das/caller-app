import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
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
import { AvailableLead, Lead } from '@/types';
import { ApiError } from '@/services/api';
import { isNotifiedLeadAvailable } from '@/services/notificationRouting';

type FilterType = 'all' | Lead['status'];
type TabType = 'assigned' | 'available';

function formatLeadTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function LeadsScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const {
    leads,
    availableLeads,
    loadingAvailable,
    availableError,
    refreshAvailableLeads,
    claimLead,
    refresh,
    refreshing,
    refreshError,
  } = useLeads();

  const [activeTab, setActiveTab] = useState<TabType>('assigned');
  const pushParams = useLocalSearchParams<{ tab?: string; availableLeadId?: string; notificationId?: string }>();
  const refreshAvailableRef = useRef(refreshAvailableLeads);
  refreshAvailableRef.current = refreshAvailableLeads;
  const [checkedNotification, setCheckedNotification] = useState<string | null>(null);
  const warnedNotification = useRef<string | null>(null);
  useEffect(() => {
    if (pushParams.tab !== 'available' || !pushParams.notificationId) return;
    let active = true;
    setActiveTab('available');
    setAvailableSearchText('');
    setCheckedNotification(null);
    void refreshAvailableRef.current().then(() => {
      if (active) setCheckedNotification(pushParams.notificationId!);
    });
    return () => { active = false; };
  }, [pushParams.tab, pushParams.notificationId]);
  useEffect(() => {
    if (!checkedNotification || checkedNotification !== pushParams.notificationId ||
        warnedNotification.current === checkedNotification || loadingAvailable || availableError) return;
    if (!isNotifiedLeadAvailable(availableLeads, pushParams.availableLeadId)) {
      warnedNotification.current = checkedNotification;
      Alert.alert('Lead Unavailable', 'This lead is no longer in your available queue. It may already have been claimed.');
    }
  }, [checkedNotification, pushParams.notificationId, pushParams.availableLeadId, availableLeads, loadingAvailable, availableError]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Assigned leads search & filter
  const [searchText, setSearchText] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('all');

  // Available leads search & claiming
  const [availableSearchText, setAvailableSearchText] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);

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
    { id: 'forwarded_calls', label: 'Forwarded Calls' },
    { id: 'no_candidate', label: 'No Candidate' },
    { id: 'disconnected', label: 'Disconnected' },
    { id: 'admission_done', label: 'Admission Done' },
    { id: 'all_waiting', label: 'Call Waiting' },
    { id: 'not_reachable', label: 'Not Reachable' },
    { id: 'ringing', label: 'Ringing' },
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

  const filteredAvailableLeads = useMemo(() => {
    const search = availableSearchText.trim().toLowerCase();
    if (!search) return [...availableLeads].sort((a, b) =>
      Number(b.id === pushParams.availableLeadId) - Number(a.id === pushParams.availableLeadId));

    return availableLeads.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(search);
      const serviceMatch =
        item.service?.name?.toLowerCase().includes(search) ||
        item.service?.code?.toLowerCase().includes(search);
      const sourceMatch = item.source?.toLowerCase().includes(search);
      const campaignMatch = item.campaign?.toLowerCase().includes(search);

      return nameMatch || serviceMatch || sourceMatch || campaignMatch;
    });
  }, [availableLeads, availableSearchText, pushParams.availableLeadId]);

  const handleClaimAndCall = async (item: AvailableLead) => {
    if (claimingId) return; // Prevent double-tapping while claiming
    setClaimingId(item.id);

    try {
      const claimedLead = await claimLead(item.id);
      // Claim succeeded! Navigate to dialer
      router.push({
        pathname: '/dialer',
        params: { id: claimedLead.id, isClaimed: '1' },
      });
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 409) {
        Alert.alert(
          'Lead Unavailable',
          'This lead has already been taken by another caller.'
        );
        void refreshAvailableLeads();
      } else {
        Alert.alert(
          'Unable to Claim Lead',
          error instanceof Error ? error.message : 'Please check your connection and try again.'
        );
      }
    } finally {
      setClaimingId(null);
    }
  };

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

  const renderAvailableLead = ({ item }: { item: AvailableLead }) => {
    const isClaiming = claimingId === item.id;
    const isAnyClaiming = claimingId !== null;

    return (
      <View style={styles.availableCard}>
        <View style={styles.availableCardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.name ? item.name.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>

          <View style={styles.availableLeadInfo}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.phoneMasked}>
              {item.phoneMasked || '••••••••••'}
            </Text>
          </View>

          {item.createdAt ? (
            <Text style={styles.timeText}>
              {formatLeadTime(item.createdAt)}
            </Text>
          ) : null}
        </View>

        {/* Badges: Service, Source, Status */}
        <View style={styles.badgesRow}>
          {item.service ? (
            <View style={styles.serviceBadge}>
              <Text style={styles.serviceBadgeText}>
                {item.service.name || item.service.code}
              </Text>
            </View>
          ) : null}

          {item.source ? (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>
                {item.source}
              </Text>
            </View>
          ) : null}

          <View style={styles.availableStatusBadge}>
            <Text style={styles.availableStatusText}>
              {item.statusDisplay || 'Available'}
            </Text>
          </View>
        </View>

        {/* Action Button: Claim & Call */}
        <Pressable
          style={[
            styles.claimCallButton,
            isAnyClaiming && styles.claimCallButtonDisabled,
          ]}
          disabled={isAnyClaiming}
          onPress={() => handleClaimAndCall(item)}
        >
          {isClaiming ? (
            <View style={styles.claimButtonContent}>
              <ActivityIndicator size="small" color={colors.onPrimary} />
              <Text style={styles.claimButtonText}>Claiming...</Text>
            </View>
          ) : (
            <View style={styles.claimButtonContent}>
              <View style={styles.phoneIconShape} />
              <Text style={styles.claimButtonText}>Call</Text>
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>
            {activeTab === 'assigned' ? 'Students' : 'Available Leads'}
          </Text>

          <Text style={styles.subtitle}>
            {activeTab === 'assigned'
              ? 'Your assigned students'
              : 'Website leads ready to claim'}
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {activeTab === 'assigned' ? leads.length : availableLeads.length}
          </Text>
        </View>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <Pressable
          style={[
            styles.tabItem,
            activeTab === 'assigned' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('assigned')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'assigned' && styles.tabTextActive,
            ]}
          >
            Assigned
          </Text>
          <View
            style={[
              styles.tabBadge,
              activeTab === 'assigned' && styles.tabBadgeActive,
            ]}
          >
            <Text
              style={[
                styles.tabBadgeText,
                activeTab === 'assigned' && styles.tabBadgeTextActive,
              ]}
            >
              {leads.length}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={[
            styles.tabItem,
            activeTab === 'available' && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab('available')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'available' && styles.tabTextActive,
            ]}
          >
            Available
          </Text>
          {availableLeads.length > 0 ? (
            <View
              style={[
                styles.tabBadge,
                activeTab === 'available'
                  ? styles.tabBadgeActive
                  : styles.tabBadgeNew,
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  activeTab === 'available'
                    ? styles.tabBadgeTextActive
                    : styles.tabBadgeTextNew,
                ]}
              >
                {availableLeads.length}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Error Banners */}
      {refreshError && (
        <Text style={{ color: colors.danger, marginBottom: 12 }}>
          {refreshError}
        </Text>
      )}

      {activeTab === 'available' && availableError && (
        <Text style={{ color: colors.danger, marginBottom: 12 }}>
          {availableError}
        </Text>
      )}

      {/* Tab 1: Assigned Leads */}
      {activeTab === 'assigned' && (
        <>
          {/* Search */}
          <View style={styles.searchContainer}>
            <View
              style={{
                width: 16,
                height: 16,
                borderWidth: 2,
                borderColor: colors.muted,
                borderRadius: 8,
                marginRight: 12,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  width: 7,
                  height: 2,
                  backgroundColor: colors.muted,
                  right: -5,
                  bottom: -3,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </View>

            <TextInput
              keyboardAppearance={mode}
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
                const isSelected = selectedFilter === filter.id;
                const count = filter.id === 'all'
                  ? leads.length
                  : leads.filter((l) => l.status === filter.id).length;

                return (
                  <Pressable
                    key={filter.id}
                    style={[
                      styles.filterButton,
                      isSelected && styles.filterButtonSelected,
                    ]}
                    onPress={() => {
                      setSelectedFilter(filter.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        isSelected && styles.filterTextSelected,
                      ]}
                    >
                      {filter.label} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{leads.length}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{pendingCount}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{completedCount}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
          </View>

          {/* Assigned Student List */}
          {leads.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyCard}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={colors.accent}
                />
              }
            >
              <Text style={styles.emptyTitle}>No students assigned</Text>
              <Text style={styles.emptyText}>
                Students assigned by the admin will appear here.
              </Text>
            </ScrollView>
          ) : filteredLeads.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyCard}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={colors.accent}
                />
              }
            >
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptyText}>
                Try changing the search or selected filter.
              </Text>
            </ScrollView>
          ) : (
            <SectionList
              sections={sections}
              refreshing={refreshing}
              onRefresh={refresh}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !collapsed.has(section.key) }}
                  onPress={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(section.key)) next.delete(section.key);
                      else next.add(section.key);
                      return next;
                    })
                  }
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    backgroundColor: colors.accentSoft,
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 16,
                      fontWeight: '700',
                    }}
                  >
                    {section.title} ({section.count})
                  </Text>
                  <Text style={{ color: colors.secondary, marginTop: 4 }}>
                    {collapsed.has(section.key)
                      ? 'Tap to show leads'
                      : 'Tap to collapse'}
                    {section.key !== 'unbatched'
                      ? ` - Batch #${section.key}`
                      : ''}
                  </Text>
                </Pressable>
              )}
              keyExtractor={(item) => item.id}
              renderItem={renderLead}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
            />
          )}
        </>
      )}

      {/* Tab 2: Available Leads */}
      {activeTab === 'available' && (
        <>
          {/* Search */}
          <View style={styles.searchContainer}>
            <View
              style={{
                width: 16,
                height: 16,
                borderWidth: 2,
                borderColor: colors.muted,
                borderRadius: 8,
                marginRight: 12,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  width: 7,
                  height: 2,
                  backgroundColor: colors.muted,
                  right: -5,
                  bottom: -3,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            </View>

            <TextInput
              keyboardAppearance={mode}
              style={styles.searchInput}
              placeholder="Search name, service or source"
              placeholderTextColor={colors.placeholder}
              value={availableSearchText}
              onChangeText={setAvailableSearchText}
              autoCapitalize="none"
            />
          </View>

          {/* Available Leads List / States */}
          {loadingAvailable && availableLeads.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>
                Loading available leads...
              </Text>
            </View>
          ) : availableError && availableLeads.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyCard}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing || loadingAvailable}
                  onRefresh={refresh}
                  tintColor={colors.accent}
                />
              }
            >
              <Text style={[styles.emptyTitle, { color: colors.danger }]}>
                Unable to load leads
              </Text>
              <Text style={styles.emptyText}>{availableError}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => void refreshAvailableLeads()}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </ScrollView>
          ) : availableLeads.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyCard}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing || loadingAvailable}
                  onRefresh={refresh}
                  tintColor={colors.accent}
                />
              }
            >
              <Text style={styles.emptyTitle}>No website leads available</Text>
              <Text style={styles.emptyText}>
                New website leads will appear here when they match your services.
              </Text>
            </ScrollView>
          ) : filteredAvailableLeads.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyCard}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing || loadingAvailable}
                  onRefresh={refresh}
                  tintColor={colors.accent}
                />
              }
            >
              <Text style={styles.emptyTitle}>No matching leads</Text>
              <Text style={styles.emptyText}>
                Try searching for a different name, service, or source.
              </Text>
            </ScrollView>
          ) : (
            <FlatList
              data={filteredAvailableLeads}
              keyExtractor={(item) => item.id}
              renderItem={renderAvailableLead}
              refreshing={refreshing || loadingAvailable}
              onRefresh={refresh}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.list}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 20,
    },

    header: {
      paddingTop: 20,
      paddingBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },

    title: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
    },

    subtitle: {
      marginTop: 4,
      fontSize: 13,
      color: colors.muted,
    },

    countBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },

    countText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontWeight: '700',
    },

    // Tab Switcher
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 4,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },

    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 9,
    },

    tabItemActive: {
      backgroundColor: colors.primary,
    },

    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.secondary,
      marginRight: 6,
    },

    tabTextActive: {
      color: colors.onPrimary,
    },

    tabBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: colors.border,
    },

    tabBadgeActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
    },

    tabBadgeNew: {
      backgroundColor: colors.accent,
    },

    tabBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.secondary,
    },

    tabBadgeTextActive: {
      color: colors.onPrimary,
    },

    tabBadgeTextNew: {
      fontSize: 11,
      fontWeight: '700',
      color: '#ffffff',
    },

    // Search
    searchContainer: {
      height: 46,
      backgroundColor: colors.surface,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },

    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
    },

    // Filters
    filterWrapper: {
      marginTop: 12,
      marginHorizontal: -20,
    },

    filterList: {
      paddingHorizontal: 20,
    },

    filterButton: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
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

    // Summary
    summaryCard: {
      marginTop: 14,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },

    summaryItem: {
      flex: 1,
      alignItems: 'center',
    },

    summaryNumber: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },

    summaryLabel: {
      marginTop: 3,
      fontSize: 11,
      color: colors.muted,
    },

    summaryDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
    },

    list: {
      paddingTop: 14,
      paddingBottom: 24,
    },

    leadCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },

    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },

    avatarText: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.accent,
    },

    leadInfo: {
      flex: 1,
      marginLeft: 12,
      marginRight: 8,
    },

    name: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },

    phone: {
      marginTop: 4,
      fontSize: 13,
      color: colors.secondary,
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

    // Available Lead Card
    availableCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },

    availableCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    availableLeadInfo: {
      flex: 1,
      marginLeft: 12,
      marginRight: 8,
    },

    phoneMasked: {
      marginTop: 4,
      fontSize: 13,
      color: colors.secondary,
      letterSpacing: 0.5,
    },

    timeText: {
      fontSize: 11,
      color: colors.muted,
    },

    badgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
      marginBottom: 12,
    },

    serviceBadge: {
      backgroundColor: colors.accentSoft,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },

    serviceBadgeText: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: '600',
    },

    sourceBadge: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },

    sourceBadgeText: {
      color: colors.secondary,
      fontSize: 11,
      fontWeight: '500',
    },

    availableStatusBadge: {
      backgroundColor: colors.warningSoft,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },

    availableStatusText: {
      color: colors.warning,
      fontSize: 11,
      fontWeight: '600',
    },

    claimCallButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },

    claimCallButtonDisabled: {
      opacity: 0.65,
    },

    claimButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },

    claimButtonText: {
      color: colors.onPrimary,
      fontSize: 14,
      fontWeight: '700',
      marginLeft: 6,
    },

    phoneIconShape: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.onPrimary,
    },

    // Empty & Loading States
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      marginTop: 12,
      fontSize: 13,
      color: colors.muted,
    },

    emptyCard: {
      marginTop: 20,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 26,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },

    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },

    emptyText: {
      marginTop: 6,
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 18,
    },

    retryButton: {
      marginTop: 14,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 8,
    },

    retryButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
  });
