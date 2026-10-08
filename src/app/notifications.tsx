import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { NotificationIcon } from '@/components/NotificationIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { websiteLeadNotificationTarget } from '@/services/notificationRouting';
import {
  CallerNotification, getNotifications, markAllNotificationsRead,
  markNotificationRead, subscribeNotificationCenter,
} from '@/services/notificationCenter';

export default function NotificationsScreen() {
  const styles = useAppStyles(createStyles);
  const { token, user } = useAuth();
  const [items, setItems] = useState<CallerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextPage = useRef<number | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  const actionRequest = useRef<AbortController | null>(null);
  const focused = useRef(false);
  const focusVersion = useRef(0);

  const load = useCallback(async (page = 1) => {
    if (!token || !focused.current) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setError(null);
    setLoading(page === 1);
    setLoadingMore(page > 1);
    try {
      const result = await getNotifications(token, page, controller.signal);
      if (controller.signal.aborted) return;
      setItems(previous => page === 1 ? result.results : [
        ...previous, ...result.results.filter(item => !previous.some(existing => existing.id === item.id)),
      ]);
      nextPage.current = result.next ? page + 1 : null;
    } catch {
      if (!controller.signal.aborted) setError('Could not load notifications. Please try again.');
    } finally {
      if (!controller.signal.aborted) { listRequest.current = null; setLoading(false); setLoadingMore(false); }
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    focusVersion.current += 1;
    setBusy(false);
    actionRequest.current = null;
    setItems([]);
    nextPage.current = null;
    void load();
    const unsubscribe = subscribeNotificationCenter(() => { void load(); });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => {
      focused.current = false;
      focusVersion.current += 1;
      listRequest.current?.abort();
      actionRequest.current?.abort();
      unsubscribe(); subscription.remove();
    };
  }, [load]));

  const act = async (item?: CallerNotification) => {
    if (!token || actionRequest.current) return;
    const controller = new AbortController();
    const version = focusVersion.current;
    actionRequest.current = controller;
    setBusy(true);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      if (!item) await markAllNotificationsRead(token, controller.signal);
      else if (!item.is_read) await markNotificationRead(token, item.id, controller.signal);
    } catch {
      if (focused.current && version === focusVersion.current) Alert.alert('Could not mark as read', 'Please try again when your connection is available.');
    } finally {
      clearTimeout(timeout);
      if (actionRequest.current === controller) actionRequest.current = null;
      if (focused.current && version === focusVersion.current) {
        setBusy(false);
          if (item) {
            const isCaller = user?.role === 'CALLER' && !user.needs_onboarding;
            const isCounselor = user?.role === 'COUNSELOR' && !user.needs_onboarding;
            const target = websiteLeadNotificationTarget(item.data, isCaller, !!user, isCounselor);
            if (target) {
              router.push({ ...target, params: { ...target.params,
                ...(target.pathname === '/lead-details' ? { fromNotification: '1' } : {}),
              } } as never);
            }
          }
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedBackButton onPress={() => router.back()} />
        <Text style={styles.title}>Notifications</Text>
      </View>
      <View style={styles.toolbar}>
        <Text style={styles.subtitle}>Lead, follow-up, team chat and notice updates</Text>
        <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void act()}>
          <Text style={[styles.action, (busy || loading) && styles.dim]}>Mark all as read</Text>
        </Pressable>
      </View>
      {error && <View style={styles.error}><Text style={styles.subtitle}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.action}>Retry</Text></Pressable>
      </View>}
      <FlatList
        data={items} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list}
        refreshing={loading} onRefresh={() => void load()}
        ListEmptyComponent={loading ? <ActivityIndicator style={styles.empty} /> : !error ? (
          <View style={styles.empty}>
            <NotificationIcon size={44} color={styles.action.color} />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.subtitle}>Your notifications will appear here.</Text>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.is_read ? 'Read' : 'Unread'}: ${item.title}. ${item.body}`}
            disabled={busy} onPress={() => void act(item)} style={[styles.card, !item.is_read && styles.unread]}>
            <View style={styles.icon}><NotificationIcon size={23} color={styles.action.color} /></View>
            <View style={styles.message}>
              <View style={styles.row}><Text style={[styles.cardTitle, item.is_read && styles.readTitle]}>{item.title}</Text>
                {!item.is_read && <View style={styles.dot} />}</View>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={nextPage.current ? (
          <Pressable accessibilityRole="button" disabled={loading || loadingMore} style={styles.more}
            onPress={() => { if (nextPage.current) void load(nextPage.current); }}>
            {loadingMore ? <ActivityIndicator /> : <Text style={styles.action}>Load more</Text>}
          </Pressable>
        ) : null}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  toolbar: { paddingHorizontal: 20, gap: 12, paddingBottom: 18, alignItems: 'flex-start' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  action: { color: colors.accent, fontWeight: '700', fontSize: 14, paddingVertical: 5 },
  dim: { opacity: 0.5 },
  list: { paddingHorizontal: 20, paddingBottom: 30, gap: 12, flexGrow: 1 },
  card: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18 },
  unread: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 16 },
  readTitle: { color: colors.muted, fontWeight: '500' },
  body: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 6 },
  date: { color: colors.muted, fontSize: 12, marginTop: 10 },
  dot: { backgroundColor: colors.accent, width: 8, height: 8, borderRadius: 4 },
  empty: { paddingVertical: 70, alignItems: 'center', gap: 12 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '600' },
  error: { paddingHorizontal: 20, paddingBottom: 12 },
  more: { padding: 16, alignItems: 'center' },
});
