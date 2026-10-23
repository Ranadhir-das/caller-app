import { CallerPointsCard } from '@/components/CallerPointsCard';
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
import { isCallerCapable, isCounselorCapable, isDualRole } from '@/services/capabilities';

export default function EmployeeHomeScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { data, refreshing, load, error } = useEmployeeWorkspace();
  const unread = useNotificationUnreadCount();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
        <Pressable accessibilityRole="button" accessibilityLabel="My profile" style={styles.profileCard} onPress={() => router.push('/profile')}>
          <CallerAvatar size={52} />
          <View style={{ flex: 1 }}><Text style={styles.title}>{user?.name || user?.username}</Text><Text style={styles.subtitle}>{data?.role_label || user?.role} workspace</Text></View>
          <View style={styles.chevron} />
        </Pressable>
      <CallerPointsCard />
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
        <View style={styles.actionsRow}>
          <Pressable accessibilityRole="button" style={styles.actionCard} onPress={() => router.push('/notifications')}>
            <View style={styles.actionIcon}><Text style={styles.actionIconText}>🔔</Text></View>
            <Text style={styles.actionTitle}>Notifications{unread ? ` (${unreadBadge(unread)})` : ''}</Text>
            <Text style={styles.actionSubtitle}>Team and app updates</Text>
          </Pressable>
          {isCallerCapable(user) && !user?.needs_onboarding && (
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/direct-dialer')}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>⌨️</Text></View>
              <Text style={styles.actionTitle}>Direct Dialer</Text>
              <Text style={styles.actionSubtitle}>Keypad calling</Text>
            </Pressable>
          )}
          {isCallerCapable(user) && !isCounselorCapable(user) && !user?.needs_onboarding && (
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.replace('/(tabs)')}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>📞</Text></View>
              <Text style={styles.actionTitle}>Calling workspace</Text>
              <Text style={styles.actionSubtitle}>Switch to dialer</Text>
            </Pressable>
          )}
          {isCounselorCapable(user) && !isCallerCapable(user) && !user?.needs_onboarding && (
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.replace('/counselor' as never)}>
              <View style={styles.actionIcon}><Text style={styles.actionIconText}>🎓</Text></View>
              <Text style={styles.actionTitle}>Counselling workspace</Text>
              <Text style={styles.actionSubtitle}>Your forwarded leads</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/chat')}><View style={styles.actionIcon}><Text style={styles.actionIconText}>💬</Text></View><Text style={styles.actionTitle}>Team chat</Text><Text style={styles.actionSubtitle}>Message your team</Text></Pressable>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/notices')}><View style={styles.actionIcon}><Text style={styles.actionIconText}>📣</Text></View><Text style={styles.actionTitle}>Notices</Text><Text style={styles.actionSubtitle}>Company announcements</Text></Pressable>
        </View>
        {user?.needs_onboarding && <View style={styles.card}><Text style={styles.heading}>Welcome - set up your employee photo</Text><Text style={styles.subtitle}>Capture your enrollment photo on the Attendance tab once. Management will review it before photo attendance becomes available.</Text></View>}
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
