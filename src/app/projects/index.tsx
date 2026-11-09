import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles, AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import {
  getProjects,
  Project,
  ProjectStatus,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  formatProjectDate,
} from '@/services/projects';

type FilterTab = 'ALL' | 'ACTIVE' | 'REVIEW' | 'CHANGES' | 'COMPLETED';

export default function ProjectsListScreen() {
  const { token } = useAuth();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createStyles);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const fetchProjects = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await getProjects(token);
        setProjects(res.projects || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load projects.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  // Auto-refresh when navigating back to list
  useFocusEffect(
    useCallback(() => {
      void fetchProjects(false);
    }, [fetchProjects]),
  );

  const filteredProjects = projects.filter(p => {
    switch (activeTab) {
      case 'ACTIVE':
        return p.status === 'STARTED' || p.status === 'IN_PROGRESS';
      case 'REVIEW':
        return p.status === 'PENDING_REVIEW';
      case 'CHANGES':
        return p.status === 'NEEDS_CHANGES';
      case 'COMPLETED':
        return p.status === 'COMPLETED';
      case 'ALL':
      default:
        return true;
    }
  });

  const getStatusStyle = (status: ProjectStatus) => {
    switch (status) {
      case 'COMPLETED':
        return { bg: colors.successSoft, text: colors.success };
      case 'PENDING_REVIEW':
        return { bg: colors.warningSoft, text: colors.warning };
      case 'NEEDS_CHANGES':
        return { bg: colors.orangeSoft, text: colors.orange };
      case 'IN_PROGRESS':
        return { bg: colors.accentSoft, text: colors.primary };
      case 'STARTED':
        return { bg: colors.accentSoft, text: colors.accent };
      case 'ASSIGNED':
        return { bg: mode === 'dark' ? '#2E1065' : '#F3E8FF', text: mode === 'dark' ? '#C084FC' : '#6B21A8' };
      case 'CANCELLED':
        return { bg: colors.dangerSoft, text: colors.danger };
      case 'ON_HOLD':
      default:
        return { bg: colors.surfaceMuted, text: colors.muted };
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return { bg: colors.dangerSoft, text: colors.danger };
      case 'HIGH':
        return { bg: colors.orangeSoft, text: colors.orange };
      case 'MEDIUM':
        return { bg: colors.accentSoft, text: colors.primary };
      case 'LOW':
      default:
        return { bg: colors.surfaceMuted, text: colors.muted };
    }
  };

  const renderProjectCard = ({ item }: { item: Project }) => {
    const statusStyle = getStatusStyle(item.status);
    const priorityStyle = getPriorityStyle(item.priority);

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Project ${item.title}`}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => router.push({ pathname: '/projects/details', params: { id: String(item.id) } } as never)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.projectTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.badgeText, { color: statusStyle.text }]}>
              {item.status_display || PROJECT_STATUS_LABELS[item.status] || item.status}
            </Text>
          </View>
        </View>

        {!!item.description && (
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        {/* Highlight management review notes if changes needed */}
        {item.status === 'NEEDS_CHANGES' && !!item.review_comments && (
          <View style={[styles.reviewNotice, { backgroundColor: colors.orangeSoft, borderColor: colors.orange }]}>
            <Text style={[styles.reviewNoticeText, { color: colors.orange }]} numberOfLines={2}>
              ⚠️ Review Feedback: {item.review_comments}
            </Text>
          </View>
        )}

        {/* Metadata Footer */}
        <View style={styles.metaRow}>
          <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bg }]}>
            <Text style={[styles.priorityText, { color: priorityStyle.text }]}>
              {PROJECT_PRIORITY_LABELS[item.priority] || item.priority}
            </Text>
          </View>

          {item.self_created && (
            <View style={[styles.selfCreatedBadge, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.selfCreatedText, { color: colors.secondary }]}>Self-created</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.dateBlock}>
            <Text style={[styles.dateText, item.is_overdue && { color: colors.danger, fontWeight: '700' }]}>
              {item.is_overdue ? '⚠️ Overdue: ' : 'Due: '}
              {formatProjectDate(item.due_date)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <AnimatedBackButton />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Projects</Text>
          <Text style={styles.headerSubtitle}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} accessible
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Project"
          style={({ pressed }) => [styles.newBtn, pressed && styles.newBtnPressed]}
          onPress={() => router.push('/projects/new' as never)}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        {(
          [
            ['ALL', 'All'],
            ['ACTIVE', 'Active'],
            ['REVIEW', 'In Review'],
            ['CHANGES', 'Changes'],
            ['COMPLETED', 'Done'],
          ] as [FilterTab, string][]
        ).map(([tabKey, label]) => {
          const isSelected = activeTab === tabKey;
          return (
            <Pressable
              key={tabKey}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              style={[styles.tabItem, isSelected && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab(tabKey)}
            >
              <Text style={[styles.tabText, isSelected ? { color: colors.onPrimary, fontWeight: '700' } : { color: colors.muted }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Body List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptySubtitle, { marginTop: 12 }]}>Loading projects…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyTitle, { color: colors.danger }]}>Could not load projects</Text>
          <Text style={styles.emptySubtitle}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => fetchProjects(false)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          keyExtractor={item => String(item.id)}
          renderItem={renderProjectCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchProjects(true)}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>
                {activeTab === 'ALL' ? 'No projects assigned yet' : 'No projects matching filter'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'ALL'
                  ? 'You can create your own project to track work sessions and request completion review.'
                  : 'Try selecting another status tab above.'}
              </Text>
              {activeTab === 'ALL' && (
                <Pressable style={styles.createEmptyBtn} onPress={() => router.push('/projects/new' as never)}>
                  <Text style={styles.createEmptyBtnText}>+ Create a Project</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    headerCenter: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 1,
    },
    newBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
    },
    newBtnPressed: {
      opacity: 0.8,
    },
    newBtnText: {
      color: c.onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    tabsContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 6,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tabItem: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: c.surfaceMuted,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
    },
    listContent: {
      padding: 16,
      gap: 12,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    cardPressed: {
      backgroundColor: c.surfaceMuted,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    projectTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      lineHeight: 22,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    description: {
      fontSize: 13,
      lineHeight: 19,
      color: c.secondary,
    },
    reviewNotice: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
    },
    reviewNoticeText: {
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 17,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    priorityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    priorityText: {
      fontSize: 11,
      fontWeight: '600',
    },
    selfCreatedBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    selfCreatedText: {
      fontSize: 11,
      fontWeight: '500',
    },
    dateBlock: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dateText: {
      fontSize: 12,
      color: c.muted,
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyIcon: {
      fontSize: 42,
      marginBottom: 6,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 13,
      lineHeight: 19,
      color: c.muted,
      textAlign: 'center',
    },
    createEmptyBtn: {
      marginTop: 12,
      backgroundColor: c.primary,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
    },
    createEmptyBtnText: {
      color: c.onPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    retryBtn: {
      marginTop: 14,
      backgroundColor: c.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
    },
    retryBtnText: {
      color: c.onPrimary,
      fontWeight: '600',
      fontSize: 14,
    },
  });
