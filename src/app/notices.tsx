import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme, useAppStyles, AppColors } from "@/context/AppThemeContext";
import { AnimatedBackButton } from "@/components/AnimatedBackButton";
import {
  listNotices,
  Notice,
  NoticeAttachment,
  resolveNoticeAttachmentUrl,
} from "@/services/notices";

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

  const handleOpenAttachment = async (att: NoticeAttachment) => {
    const fullUrl = resolveNoticeAttachmentUrl(att.file_url);
    try {
      await WebBrowser.openBrowserAsync(fullUrl);
    } catch {
      Alert.alert("Unable to open file", "Could not open attachment.");
    }
  };

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

              {/* Attachments */}
              {item.attachments && item.attachments.length > 0 && (
                <View style={styles.attachmentsContainer}>
                  <Text style={styles.attachmentsTitle}>
                    Attachments ({item.attachments.length})
                  </Text>
                  {item.attachments.map((att) => {
                    const isImage = att.mime_type.includes("image");
                    const isVideo = att.mime_type.includes("video");
                    const fullUrl = resolveNoticeAttachmentUrl(att.file_url);
                    const sizeStr = `${(att.file_size / 1024).toFixed(0)} KB`;

                    return (
                      <Pressable
                        key={att.id}
                        style={styles.attachmentCard}
                        onPress={() => handleOpenAttachment(att)}
                      >
                        {isImage ? (
                          <Image
                            source={{ uri: fullUrl }}
                            style={styles.attachmentThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.attachmentIconBox}>
                            <Text style={styles.attachmentIcon}>
                              {isVideo ? "🎥" : "📄"}
                            </Text>
                          </View>
                        )}
                        <View style={styles.attachmentInfo}>
                          <Text style={styles.attachmentName} numberOfLines={1}>
                            {att.original_filename}
                          </Text>
                          <Text style={styles.attachmentMeta}>
                            {isImage ? "Image" : isVideo ? "Video" : "Document"} · {sizeStr}
                          </Text>
                        </View>
                        <Text style={styles.attachmentArrow}>↗</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

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
      gap: 10,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: c.text },
    badge: { backgroundColor: c.surfaceMuted, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
    badgeText: { fontSize: 10, fontWeight: "600", color: c.accent },
    body: { fontSize: 13, lineHeight: 20, color: c.text },
    meta: { fontSize: 11, color: c.muted },
    attachmentsContainer: {
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 6,
    },
    attachmentsTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: c.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    attachmentCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 8,
      gap: 10,
    },
    attachmentThumb: {
      width: 40,
      height: 40,
      borderRadius: 6,
      backgroundColor: c.surfaceMuted,
    },
    attachmentIconBox: {
      width: 40,
      height: 40,
      borderRadius: 6,
      backgroundColor: c.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    attachmentIcon: {
      fontSize: 20,
    },
    attachmentInfo: {
      flex: 1,
    },
    attachmentName: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    attachmentMeta: {
      fontSize: 11,
      color: c.muted,
      marginTop: 2,
    },
    attachmentArrow: {
      fontSize: 14,
      color: c.muted,
      marginRight: 4,
    },
  });
