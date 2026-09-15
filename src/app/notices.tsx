import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme, useAppStyles, AppColors } from "@/context/AppThemeContext";
import { AnimatedBackButton } from "@/components/AnimatedBackButton";
import { listNotices, Notice } from "@/services/notices";

export default function NoticesScreen() {
  const { token } = useAuth();
  const { colors } = useAppTheme();
  const styles = useAppStyles(makeStyles);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    if (!token) return Promise.resolve();
    return listNotices(token)
      .then(setNotices)
      .catch((e) => Alert.alert("Notices", e instanceof Error ? e.message : "Unable to load notices."));
  }, [token]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedBackButton onPress={() => router.back()} />
        <Text style={styles.title}>Notices</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={notices}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.audience}</Text>
                </View>
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.meta}>
                {item.created_by} ·{" "}
                {new Date(item.created_at).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.subtitle}>No notices right now.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
    title: { fontSize: 20, fontWeight: "700", color: c.text },
    subtitle: { fontSize: 13, color: c.muted, textAlign: "center", marginTop: 40 },
    list: { padding: 16, gap: 12 },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 14,
      gap: 8,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: c.text },
    badge: { backgroundColor: c.surfaceMuted, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
    badgeText: { fontSize: 10, fontWeight: "600", color: c.accent },
    body: { fontSize: 13, lineHeight: 20, color: c.text },
    meta: { fontSize: 11, color: c.muted },
  });
