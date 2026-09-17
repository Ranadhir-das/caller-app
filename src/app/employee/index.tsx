import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { CallerAvatar } from '@/components/CallerAvatar';
import { useEmployeeWorkspace } from '@/context/EmployeeWorkspaceContext';
import { makeStyles } from '@/components/employee/shared';

export default function EmployeeHomeScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { data, refreshing, load, error } = useEmployeeWorkspace();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}>
        <Pressable accessibilityRole="button" accessibilityLabel="My profile" style={styles.profileCard} onPress={() => router.push('/profile')}>
          <CallerAvatar size={52} />
          <View style={{ flex: 1 }}><Text style={styles.title}>{user?.name || user?.username}</Text><Text style={styles.subtitle}>{data?.role_label || user?.role} workspace</Text></View>
          <View style={styles.chevron} />
        </Pressable>
        <View style={styles.actionsRow}>
          {user?.role === 'CALLER' && !user.needs_onboarding && <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.replace('/(tabs)')}><View style={styles.actionIcon}><Text style={styles.actionIconText}>📞</Text></View><Text style={styles.actionTitle}>Calling workspace</Text><Text style={styles.actionSubtitle}>Switch to dialer</Text></Pressable>}
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/chat')}><View style={styles.actionIcon}><Text style={styles.actionIconText}>💬</Text></View><Text style={styles.actionTitle}>Team chat</Text><Text style={styles.actionSubtitle}>Message your team</Text></Pressable>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={() => router.push('/notices')}><View style={styles.actionIcon}><Text style={styles.actionIconText}>📣</Text></View><Text style={styles.actionTitle}>Notices</Text><Text style={styles.actionSubtitle}>Company announcements</Text></Pressable>
        </View>
        {user?.needs_onboarding && <View style={styles.card}><Text style={styles.heading}>Welcome - set up your employee photo</Text><Text style={styles.subtitle}>Capture your enrollment photo on the Attendance tab once. Management will review it before photo attendance becomes available.</Text></View>}
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}
