import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CallerAvatar } from '@/components/CallerAvatar';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { useNotificationUnreadCount } from '@/hooks/useNotificationUnreadCount';
import { unreadBadge } from '@/services/notificationCenter';
import { NotificationIcon } from '@/components/NotificationIcon';
import { COUNSELOR_TEAL, COUNSELOR_TEAL_SOFT_LIGHT, COUNSELOR_TEAL_SOFT_DARK } from '@/services/counselor';

export default function CounselorMoreScreen() {
  const styles = useAppStyles(createStyles);
  const { user, logout } = useAuth();
  const unread = useNotificationUnreadCount();
  const [busy, setBusy] = useState(false);
  const signingOut = useRef(false);

  const signOut = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setBusy(true);
    try {
      await logout();
      router.replace('/login');
    } catch {
      Alert.alert('Could not log out', 'Please try again.');
    } finally {
      signingOut.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>Your account and app preferences.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open my profile"
          style={[styles.card, styles.profileCard]}
          onPress={() => router.push('/profile')}
        >
          <CallerAvatar size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name?.trim() || user?.username || 'Counselor'}</Text>
            <Text style={styles.subtitle}>Counselor</Text>
          </View>
          <View style={styles.chevron} />
        </Pressable>

        <Text style={styles.groupTitle}>ACCOUNT & WORKSPACE</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Notifications, ${unread} unread`}
          style={styles.card}
          onPress={() => router.push('/notifications')}
        >
          <View style={styles.menuIcon}>
            <NotificationIcon size={23} color={COUNSELOR_TEAL} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Notifications</Text>
            <Text style={styles.subtitle}>Your lead forwards and announcements</Text>
          </View>
          {unread > 0 && <Text style={styles.badge}>{unreadBadge(unread)}</Text>}
          <View style={styles.chevron} />
        </Pressable>

        {([
          ['Employee workspace', 'Attendance, leave and daily work', '/employee', '💼'],
          ['My Profile', 'Account details and profile photo', '/profile', '👤'],
          ['Settings', 'Appearance and app preferences', '/settings', '⚙️'],
        ] as const).map(([title, subtitle, route, icon]) => (
          <Pressable
            key={route}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() => router.push(route as never)}
          >
            <View style={styles.menuIcon}>
              <Text style={styles.menuLetter}>{icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <View style={styles.chevron} />
          </Pressable>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          disabled={busy}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          onPress={signOut}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.logout}>{busy ? 'Logging out...' : 'Logout'}</Text>
            <Text style={styles.subtitle}>Check-out and sign out</Text>
          </View>
          <View style={styles.chevron} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => {
  const isDark = colors.background === '#070B14';
  const softTeal = isDark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 32, gap: 12 },
    title: { color: colors.text, fontSize: 28, fontWeight: '700' },
    subtitle: { color: colors.muted, fontSize: 14, marginTop: 5, lineHeight: 21 },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 76,
    },
    name: { color: colors.text, fontSize: 17, fontWeight: '600' },
    logout: { color: colors.danger, fontSize: 17, fontWeight: '600' },
    chevron: {
      width: 9,
      height: 9,
      borderTopWidth: 2,
      borderRightWidth: 2,
      borderColor: colors.muted,
      transform: [{ rotate: '45deg' }],
      marginRight: 4,
    },
    profileCard: { backgroundColor: softTeal, paddingVertical: 26, marginBottom: 10, borderColor: COUNSELOR_TEAL },
    groupTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginVertical: 8 },
    menuIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: softTeal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuLetter: { color: COUNSELOR_TEAL, fontSize: 18, fontWeight: '700' },
    pressed: { backgroundColor: colors.surfaceMuted },
    badge: {
      backgroundColor: COUNSELOR_TEAL,
      color: '#fff',
      borderRadius: 14,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontWeight: '700',
      overflow: 'hidden',
    },
  });
};
