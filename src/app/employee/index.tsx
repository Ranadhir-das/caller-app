import { CallerPointsCard } from '@/components/CallerPointsCard';
import { ActivityStatusWidget } from '@/components/ActivityStatusWidget';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { CallerAvatar } from '@/components/CallerAvatar';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';
import { makeStyles } from '@/components/employee/shared';
import { useNotificationUnreadCount } from '@/hooks/useNotificationUnreadCount';
import { unreadBadge } from '@/services/notificationCenter';
import { isCallerCapable, isCounselorCapable, isDualRole, isProjectWorker } from '@/services/capabilities';

export default function EmployeeHomeScreen() {
  const { user } = useAuth();
  const { colors, mode, toggleTheme } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { data, refreshing, load, error } = useEmployeeWorkspace();
  const unread = useNotificationUnreadCount();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My profile"
          style={styles.profileCard}
          onPress={() => router.push('/profile')}
        >
          <View style={{ position: 'relative' }}>
            <CallerAvatar size={50} />
            <View
              style={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#10B981',
                borderWidth: 2,
                borderColor: colors.surface,
              }}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <Text style={styles.title} numberOfLines={1}>{user?.name || user?.username}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                  {(data?.role_label || user?.role || 'Employee').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.subtitle}>Workspace</Text>
            </View>
          </View>
          <View
            style={{
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Profile ›</Text>
          </View>
        </Pressable>
      <CallerPointsCard />
      <ActivityStatusWidget />
      {isProjectWorker(user) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Projects Workspace"
          style={({ pressed }) => [
            styles.card,
            { borderColor: colors.primary, backgroundColor: colors.surface },
            pressed && { backgroundColor: colors.surfaceMuted },
          ]}
          onPress={() => router.push('/projects' as never)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}>
                <Text style={styles.actionIconText}>📂</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heading}>Projects Workspace</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {data?.projects?.length
                    ? `${data.projects.length} accessible projects — view, manage & create`
                    : 'Manage tasks and self-created assignments'}
                </Text>
              </View>
            </View>
            <View style={styles.chevron} />
          </View>
        </Pressable>
      )}
        {isDualRole(user) && !user?.needs_onboarding && (
          <View style={styles.card} testID="dual-role-workspace-switcher">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.heading}>Dual-Role Workspaces</Text>
              <View style={{ backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>DUAL-ROLE</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              Switch between your approved Caller and Counselor workspaces:
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Calling workspace"
                style={({ pressed }) => [styles.actionCard, { flex: 1, borderColor: colors.primary }, pressed && styles.actionCardPressed]}
                onPress={() => router.push('/(tabs)')}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}>
                  <Text style={styles.actionIconText}>📞</Text>
                </View>
                <Text style={styles.actionTitle}>Caller Workspace</Text>
                <Text style={styles.actionSubtitle}>Leads, calling & follow-ups</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Counselling workspace"
                style={({ pressed }) => [styles.actionCard, { flex: 1, borderColor: colors.primary }, pressed && styles.actionCardPressed]}
                onPress={() => router.push('/counselor' as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}>
                  <Text style={styles.actionIconText}>🎓</Text>
                </View>
                <Text style={styles.actionTitle}>Counselor Workspace</Text>
                <Text style={styles.actionSubtitle}>Forwarded leads & notes</Text>
              </Pressable>
            </View>
          </View>
        )}
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={styles.heading}>Workspace Tools</Text>
          <View style={styles.actionsRow}>
            <Pressable accessibilityRole="button" style={styles.actionCard} onPress={() => router.push('/notifications')}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>🔔</Text></View>
              <Text style={styles.actionTitle}>Notifications{unread ? ` (${unreadBadge(unread)})` : ''}</Text>
              <Text style={styles.actionSubtitle}>Team updates</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/activity' as never)}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>⏱️</Text></View>
              <Text style={styles.actionTitle}>Work Sessions</Text>
              <Text style={styles.actionSubtitle}>Activity log</Text>
            </Pressable>
            {isProjectWorker(user) && (
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/projects' as never)}>
                <View style={styles.actionIcon}><Text style={styles.actionIconText}>📂</Text></View>
                <Text style={styles.actionTitle}>Projects</Text>
                <Text style={styles.actionSubtitle}>All assignments</Text>
              </Pressable>
            )}
            {isCallerCapable(user) && !user?.needs_onboarding && (
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/performance' as never)}>
                <View style={styles.actionIcon}><Text style={styles.actionIconText}>📊</Text></View>
                <Text style={styles.actionTitle}>Performance</Text>
                <Text style={styles.actionSubtitle}>Talk metrics</Text>
              </Pressable>
            )}
            {isCallerCapable(user) && !user?.needs_onboarding && (
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/direct-dialer')}>
                <View style={styles.actionIcon}><Text style={styles.actionIconText}>⌨️</Text></View>
                <Text style={styles.actionTitle}>Direct Dialer</Text>
                <Text style={styles.actionSubtitle}>Quick keypad</Text>
              </Pressable>
            )}
            {isCallerCapable(user) && !isCounselorCapable(user) && !user?.needs_onboarding && (
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.replace('/(tabs)')}>
                <View style={styles.actionIcon}><Text style={styles.actionIconText}>📞</Text></View>
                <Text style={styles.actionTitle}>Calling</Text>
                <Text style={styles.actionSubtitle}>Switch to dialer</Text>
              </Pressable>
            )}
            {isCounselorCapable(user) && !isCallerCapable(user) && !user?.needs_onboarding && (
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.replace('/counselor' as never)}>
                <View style={styles.actionIcon}><Text style={styles.actionIconText}>🎓</Text></View>
                <Text style={styles.actionTitle}>Counselling</Text>
                <Text style={styles.actionSubtitle}>Forwarded leads</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/chat')}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>💬</Text></View>
              <Text style={styles.actionTitle}>Team Chat</Text>
              <Text style={styles.actionSubtitle}>Conversations</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/notices')}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>📣</Text></View>
              <Text style={styles.actionTitle}>Notices</Text>
              <Text style={styles.actionSubtitle}>Announcements</Text>
            </Pressable>
          </View>
        </View>
        {user?.needs_onboarding && <View style={styles.card}><Text style={styles.heading}>Welcome - set up your employee photo</Text><Text style={styles.subtitle}>Capture your enrollment photo on the Attendance tab once. Management will review it before photo attendance becomes available.</Text></View>}
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
