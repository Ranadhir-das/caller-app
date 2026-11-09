import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles, AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import {
  getProjectDetail,
  requestProjectCompletion,
  updateProjectStatus,
  ProjectDetail,
  ProjectStatus,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  formatProjectDate,
  formatProjectDateTime,
} from '@/services/projects';

export default function ProjectDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = parseInt(id || '', 10);

  const { token } = useAuth();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createStyles);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(!isNaN(projectId) && !!token);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token || isNaN(projectId)) {
      return;
    }

    getProjectDetail(token, projectId)
      .then(data => {
        if (active) {
          setProject(data);
          setLoading(false);
        }
      })
      .catch(e => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Unable to load project details.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [token, projectId]);

  const refreshDetail = useCallback(async () => {
    if (!token || isNaN(projectId)) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await getProjectDetail(token, projectId);
      setProject(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load project details.');
    } finally {
      setRefreshing(false);
    }
  }, [token, projectId]);

  const handleStartWork = async () => {
    if (!token || !project || actionBusy) return;
    setActionBusy(true);
    try {
      await updateProjectStatus(token, project.id, { status: 'IN_PROGRESS' });
      await refreshDetail();
    } catch (e) {
      Alert.alert('Status Update Failed', e instanceof Error ? e.message : 'Unable to start project.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRequestCompletion = () => {
    if (!token || !project || actionBusy) return;

    Alert.alert(
      'Request Completion Review',
      'Submit this project to management for final approval? Once submitted, the project enters review and further edits are paused.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Review',
          style: 'default',
          onPress: async () => {
            setActionBusy(true);
            try {
              const res = await requestProjectCompletion(token, project.id);
              Alert.alert('Completion Requested', res.detail || 'Your project is now pending management review.');
              await refreshDetail();
            } catch (e) {
              Alert.alert('Request Failed', e instanceof Error ? e.message : 'Could not submit completion request.');
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  const openLink = async (url: string) => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else Alert.alert('Invalid Link', 'Could not open this address.');
    } catch {
      Alert.alert('Invalid Link', 'Could not open this address.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <AnimatedBackButton />
          <Text style={styles.headerTitle}>Project Details</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.centerSubtitle, { marginTop: 12 }]}>Loading details…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !project) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <AnimatedBackButton />
          <Text style={styles.headerTitle}>Project Details</Text>
        </View>
        <View style={styles.centerContainer}>
          <Text style={[styles.centerTitle, { color: colors.danger }]}>Project Not Found</Text>
          <Text style={styles.centerSubtitle}>{error || 'The requested project could not be found or access is restricted.'}</Text>
          <Pressable style={styles.retryBtn} onPress={() => refreshDetail()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const statusStyle = getStatusColor(project.status, colors, mode);
  const priorityStyle = getPriorityColor(project.priority, colors);
  const isTerminal = project.status === 'COMPLETED' || project.status === 'CANCELLED';
  const isPendingReview = project.status === 'PENDING_REVIEW';
  const isNeedsChanges = project.status === 'NEEDS_CHANGES';

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <AnimatedBackButton />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {project.title}
          </Text>
          <Text style={styles.headerSubtitle}>#{project.id}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh Project"
          disabled={refreshing || actionBusy}
          style={({ pressed }) => [styles.refreshIconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => refreshDetail()}
        >
          <Text style={styles.refreshIconText}>🔄</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refreshDetail()}
            tintColor={colors.accent}
          />
        }
      >
        {/* Main Info Card */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.mainTitle}>{project.title}</Text>
          </View>

          {/* Badges Bar */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.badgeText, { color: statusStyle.text }]}>
                {project.status_display || PROJECT_STATUS_LABELS[project.status] || project.status}
              </Text>
            </View>

            <View style={[styles.badge, { backgroundColor: priorityStyle.bg }]}>
              <Text style={[styles.badgeText, { color: priorityStyle.text }]}>
                {PROJECT_PRIORITY_LABELS[project.priority] || project.priority} Priority
              </Text>
            </View>

            {project.self_created && (
              <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={[styles.badgeText, { color: colors.secondary }]}>Self-created</Text>
              </View>
            )}
          </View>

          {/* Description */}
          {!!project.description ? (
            <Text style={styles.descriptionText}>{project.description}</Text>
          ) : (
            <Text style={[styles.descriptionText, { color: colors.placeholder, fontStyle: 'italic' }]}>
              No description provided.
            </Text>
          )}

          {/* Timeline & Metadata */}
          <View style={[styles.metaGrid, { borderColor: colors.border }]}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Due Date</Text>
              <Text
                style={[
                  styles.metaValue,
                  project.is_overdue && { color: colors.danger, fontWeight: '700' },
                ]}
              >
                {project.is_overdue ? '⚠️ ' : ''}
                {formatProjectDate(project.due_date)}
              </Text>
            </View>

            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Created</Text>
              <Text style={styles.metaValue}>{formatProjectDate(project.created_at)}</Text>
            </View>
          </View>

          {/* Completion Request Timestamp */}
          {!!project.completion_requested_at && (
            <View style={[styles.timestampRow, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={styles.timestampLabel}>Completion Requested:</Text>
              <Text style={styles.timestampValue}>
                {formatProjectDateTime(project.completion_requested_at)}
              </Text>
            </View>
          )}
        </View>

        {/* Management Review Feedback Banner */}
        {isNeedsChanges && (
          <View
            style={[
              styles.reviewFeedbackBox,
              { backgroundColor: colors.orangeSoft, borderColor: colors.orange },
            ]}
          >
            <Text style={[styles.reviewFeedbackTitle, { color: colors.orange }]}>
              ⚠️ Management Requested Changes
            </Text>
            <Text style={styles.reviewFeedbackBody}>
              {project.review_comments || 'Please revise your deliverables and submit for review again.'}
            </Text>
          </View>
        )}

        {!isNeedsChanges && !!project.review_comments && (
          <View
            style={[
              styles.reviewFeedbackBox,
              { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}
          >
            <Text style={[styles.reviewFeedbackTitle, { color: colors.primary }]}>
              💬 Management Notes
            </Text>
            <Text style={styles.reviewFeedbackBody}>{project.review_comments}</Text>
          </View>
        )}

        {/* Lifecycle Status & Actions Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Lifecycle & Status</Text>

          {isTerminal ? (
            <View
              style={[
                styles.noticeBanner,
                {
                  backgroundColor:
                    project.status === 'COMPLETED' ? colors.successSoft : colors.dangerSoft,
                },
              ]}
            >
              <Text
                style={[
                  styles.noticeBannerText,
                  {
                    color: project.status === 'COMPLETED' ? colors.success : colors.danger,
                  },
                ]}
              >
                {project.status === 'COMPLETED'
                  ? '✅ This project is completed and approved. Edits are locked.'
                  : '⛔ This project was cancelled. Further actions are disabled.'}
              </Text>
            </View>
          ) : isPendingReview ? (
            <View
              style={[
                styles.noticeBanner,
                { backgroundColor: colors.warningSoft, borderColor: colors.warning },
              ]}
            >
              <Text style={[styles.noticeBannerText, { color: colors.warning }]}>
                ⏳ Under Review: This project is pending management review. Status modification is locked until management acts.
              </Text>
            </View>
          ) : (
            <View style={styles.actionButtonsContainer}>
              {project.status === 'STARTED' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Start Work"
                  disabled={actionBusy}
                  style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleStartWork}
                >
                  {actionBusy ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <Text style={[styles.primaryActionBtnText, { color: colors.onPrimary }]}>
                      ▶️ Start Work (Set In Progress)
                    </Text>
                  )}
                </Pressable>
              )}

              {project.can_request_completion && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Request Completion Review"
                  disabled={actionBusy}
                  style={[styles.completionActionBtn, { backgroundColor: colors.success }]}
                  onPress={handleRequestCompletion}
                >
                  {actionBusy ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.completionActionBtnText}>
                      🏁 Request Completion Review
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Work Sessions History Section */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>Recent Work Sessions</Text>
            <Text style={styles.counterBadge}>
              {project.work_reports?.length || 0}
            </Text>
          </View>

          {project.work_reports && project.work_reports.length > 0 ? (
            <View style={styles.sessionsList}>
              {project.work_reports.map((session, index) => (
                <View
                  key={session.id || index}
                  style={[styles.sessionItem, { borderColor: colors.border }]}
                >
                  <View style={styles.sessionHeader}>
                    <Text style={styles.sessionDate}>
                      📅 {formatProjectDate(session.work_date)}
                    </Text>
                    <View
                      style={[
                        styles.sessionDurationBadge,
                        { backgroundColor: colors.accentSoft },
                      ]}
                    >
                      <Text style={[styles.sessionDurationText, { color: colors.primary }]}>
                        ⏱️ {session.duration_formatted}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.sessionDescription}>{session.description}</Text>

                  {!!session.reference_link && (
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel="Open reference link"
                      onPress={() => openLink(session.reference_link)}
                    >
                      <Text
                        style={[styles.sessionLink, { color: colors.primary }]}
                        numberOfLines={1}
                      >
                        🔗 {session.reference_link}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptySessions}>
              <Text style={styles.emptySessionsText}>
                No work sessions logged yet for this project.
              </Text>
              <Text style={styles.emptySessionsSub}>
                Work sessions submitted on the My Work tab will appear here automatically.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStatusColor(status: ProjectStatus, c: AppColors, mode: string) {
  switch (status) {
    case 'COMPLETED':
      return { bg: c.successSoft, text: c.success };
    case 'PENDING_REVIEW':
      return { bg: c.warningSoft, text: c.warning };
    case 'NEEDS_CHANGES':
      return { bg: c.orangeSoft, text: c.orange };
    case 'IN_PROGRESS':
      return { bg: c.accentSoft, text: c.primary };
    case 'STARTED':
      return { bg: c.accentSoft, text: c.accent };
    case 'ASSIGNED':
      return { bg: mode === 'dark' ? '#2E1065' : '#F3E8FF', text: mode === 'dark' ? '#C084FC' : '#6B21A8' };
    case 'CANCELLED':
      return { bg: c.dangerSoft, text: c.danger };
    case 'ON_HOLD':
    default:
      return { bg: c.surfaceMuted, text: c.muted };
  }
}

function getPriorityColor(priority: string, c: AppColors) {
  switch (priority) {
    case 'URGENT':
      return { bg: c.dangerSoft, text: c.danger };
    case 'HIGH':
      return { bg: c.orangeSoft, text: c.orange };
    case 'MEDIUM':
      return { bg: c.accentSoft, text: c.primary };
    case 'LOW':
    default:
      return { bg: c.surfaceMuted, text: c.muted };
  }
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
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 1,
    },
    refreshIconBtn: {
      padding: 6,
    },
    refreshIconText: {
      fontSize: 18,
    },
    content: {
      padding: 16,
      gap: 16,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    titleRow: {
      gap: 4,
    },
    mainTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: c.text,
      lineHeight: 26,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    descriptionText: {
      fontSize: 14,
      lineHeight: 21,
      color: c.secondary,
      marginTop: 4,
    },
    metaGrid: {
      flexDirection: 'row',
      borderTopWidth: 1,
      paddingTop: 12,
      marginTop: 6,
      gap: 16,
    },
    metaCol: {
      flex: 1,
      gap: 2,
    },
    metaLabel: {
      fontSize: 12,
      color: c.muted,
    },
    metaValue: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    timestampRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      borderRadius: 10,
      marginTop: 4,
    },
    timestampLabel: {
      fontSize: 12,
      color: c.muted,
    },
    timestampValue: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
    },
    reviewFeedbackBox: {
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      gap: 6,
    },
    reviewFeedbackTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
    reviewFeedbackBody: {
      fontSize: 13,
      lineHeight: 19,
      color: c.text,
    },
    cardSectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    counterBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: c.muted,
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    noticeBanner: {
      padding: 12,
      borderRadius: 10,
    },
    noticeBannerText: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
    },
    actionButtonsContainer: {
      gap: 10,
      marginTop: 4,
    },
    primaryActionBtn: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryActionBtnText: {
      fontSize: 14,
      fontWeight: '700',
    },
    completionActionBtn: {
      paddingVertical: 13,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    completionActionBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    sessionsList: {
      gap: 10,
    },
    sessionItem: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      gap: 6,
    },
    sessionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionDate: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    sessionDurationBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    sessionDurationText: {
      fontSize: 12,
      fontWeight: '700',
    },
    sessionDescription: {
      fontSize: 13,
      color: c.secondary,
      lineHeight: 18,
    },
    sessionLink: {
      fontSize: 12,
      textDecorationLine: 'underline',
      marginTop: 2,
    },
    emptySessions: {
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    emptySessionsText: {
      fontSize: 13,
      fontWeight: '500',
      color: c.muted,
      textAlign: 'center',
    },
    emptySessionsSub: {
      fontSize: 11.5,
      color: c.placeholder,
      textAlign: 'center',
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
    },
    centerTitle: {
      fontSize: 17,
      fontWeight: '700',
    },
    centerSubtitle: {
      fontSize: 13,
      color: c.muted,
      textAlign: 'center',
      lineHeight: 19,
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
