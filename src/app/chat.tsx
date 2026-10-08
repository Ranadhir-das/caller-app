import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useAppTheme, useAppStyles, AppColors } from "@/context/AppThemeContext";
import { AnimatedBackButton } from "@/components/AnimatedBackButton";
import { useSpeechToText } from "@/services/speech";
import {
  ChatAttachment,
  ChatChannel,
  ChatMessage,
  chatSocketUrl,
  listChannels,
  listMessages,
  resolveAttachmentUrl,
  sendMessage,
  sendMessageWithAttachment,
} from "@/services/chat";

type PendingAttachment = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

export default function ChatScreen() {
  const { user, token } = useAuth();
  const { channelId, notificationId } = useLocalSearchParams<{ channelId?: string; notificationId?: string }>();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const speech = useSpeechToText({
    onResult: (spokenText) => {
      const clean = spokenText.trim();
      if (!clean) return;
      setText(current => {
        if (!current || !current.trim()) return clean;
        const sep = current.endsWith('\n') || current.endsWith(' ') ? '' : ' ';
        return `${current}${sep}${clean}`;
      });
    },
  });

  useEffect(() => {
    if (!token) return;
    let active = true;
    listChannels(token)
      .then((list) => {
        if (!active) return;
        setChannels(list);
        if (channelId) {
          const target = list.find(channel => String(channel.id) === channelId);
          setActiveChannel(target ?? null);
          if (!target) Alert.alert('Chat unavailable', 'This chat was removed or you no longer have access.');
        } else setActiveChannel((current) => current ?? list[0] ?? null);
      })
      .catch((e) => Alert.alert("Chat", e instanceof Error ? e.message : "Unable to load channels."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, channelId, notificationId]);

  useEffect(() => {
    setMessages([]);
    if (!token || !activeChannel) return;
    let active = true;

    listMessages(token, activeChannel.id)
      .then((list) => {
        if (active) setMessages(list);
      })
      .catch((e) => Alert.alert("Chat", e instanceof Error ? e.message : "Unable to load messages."));

    const socket = new WebSocket(chatSocketUrl(activeChannel.id, token));
    socketRef.current = socket;
    socket.onmessage = (event) => {
      if (!active) return;
      const incoming: ChatMessage = JSON.parse(event.data);
      setMessages((current) =>
        current.some((m) => m.id === incoming.id) ? current : [...current, incoming]
      );
    };

    return () => {
      active = false;
      socket.close();
      socketRef.current = null;
    };
  }, [token, activeChannel?.id]);

  useEffect(() => {
    if (messages.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  const handlePickImage = async () => {
    setShowAttachMenu(false);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const filename = asset.fileName || asset.uri.split("/").pop() || "image.jpg";
        setPendingAttachment({
          uri: asset.uri,
          name: filename,
          type: asset.mimeType || "image/jpeg",
          size: asset.fileSize,
        });
      }
    } catch {
      Alert.alert("Picker Error", "Could not pick image.");
    }
  };

  const handlePickVideo = async () => {
    setShowAttachMenu(false);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const filename = asset.fileName || asset.uri.split("/").pop() || "video.mp4";
        setPendingAttachment({
          uri: asset.uri,
          name: filename,
          type: asset.mimeType || "video/mp4",
          size: asset.fileSize,
        });
      }
    } catch {
      Alert.alert("Picker Error", "Could not pick video.");
    }
  };

  const handlePickDocument = async () => {
    setShowAttachMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "*/*"],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        setPendingAttachment({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/pdf",
          size: asset.size,
        });
      }
    } catch {
      Alert.alert("Picker Error", "Could not pick document.");
    }
  };

  const handleOpenAttachment = async (att: ChatAttachment) => {
    const fullUrl = resolveAttachmentUrl(att.file_url);
    try {
      await WebBrowser.openBrowserAsync(fullUrl);
    } catch {
      Alert.alert("Unable to open file", "Could not open attachment.");
    }
  };

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if ((!body && !pendingAttachment) || !token || !activeChannel || sending) return;

    const currentText = body;
    const currentAttachment = pendingAttachment;

    setText("");
    setPendingAttachment(null);
    setSending(true);

    try {
      let message: ChatMessage;
      if (currentAttachment) {
        message = await sendMessageWithAttachment(
          token,
          activeChannel.id,
          currentText,
          currentAttachment
        );
      } else {
        message = await sendMessage(token, activeChannel.id, currentText);
      }

      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message]
      );
    } catch (e) {
      setText(currentText);
      setPendingAttachment(currentAttachment);
      Alert.alert("Chat", e instanceof Error ? e.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }, [text, pendingAttachment, token, activeChannel, sending]);

  const canSend = (text.trim().length > 0 || pendingAttachment !== null) && !sending;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedBackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Team chat</Text>
          {!!activeChannel && <Text style={styles.subtitle}>{activeChannel.description || activeChannel.name}</Text>}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.channelScroll} contentContainerStyle={styles.channelRow}>
        {channels.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setActiveChannel(c)}
            style={[styles.chip, activeChannel?.id === c.id && { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: activeChannel?.id === c.id ? colors.onPrimary : colors.text }}>
              {c.kind === "GENERAL" ? "# " : "◆ "}
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.thread}
            renderItem={({ item }) => {
              const isMine = item.sender_id === user?.id;
              return (
                <View style={[styles.bubble, isMine && styles.bubbleMine]}>
                  {!isMine && <Text style={styles.sender}>{item.sender_name}</Text>}

                  {/* Text */}
                  {!!item.text && (
                    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                      {item.text}
                    </Text>
                  )}

                  {/* Attachments */}
                  {item.attachments && item.attachments.length > 0 && (
                    <View style={styles.bubbleAttachments}>
                      {item.attachments.map((att) => {
                        const isImg = att.mime_type.includes("image");
                        const isVid = att.mime_type.includes("video");
                        const fullUrl = resolveAttachmentUrl(att.file_url);

                        if (isImg) {
                          return (
                            <Pressable
                              key={att.id}
                              onPress={() => handleOpenAttachment(att)}
                              style={styles.chatImageWrap}
                            >
                              <Image
                                source={{ uri: fullUrl }}
                                style={styles.chatImage}
                                resizeMode="cover"
                              />
                            </Pressable>
                          );
                        }

                        return (
                          <Pressable
                            key={att.id}
                            onPress={() => handleOpenAttachment(att)}
                            style={[
                              styles.fileCard,
                              isMine ? styles.fileCardMine : styles.fileCardTheirs,
                            ]}
                          >
                            <Text style={styles.fileIcon}>{isVid ? "🎥" : "📄"}</Text>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[styles.fileName, isMine && { color: colors.onPrimary }]}
                                numberOfLines={1}
                              >
                                {att.original_name}
                              </Text>
                              <Text
                                style={[
                                  styles.fileMeta,
                                  isMine ? { color: "rgba(255,255,255,0.7)" } : { color: colors.muted },
                                ]}
                              >
                                {isVid ? "Video" : "Document"} · {(att.file_size / 1024).toFixed(0)} KB
                              </Text>
                            </View>
                            <Text style={[styles.fileArrow, isMine && { color: colors.onPrimary }]}>
                              ↗
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <Text style={[styles.time, isMine && styles.timeMine]}>
                    {new Date(item.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.subtitle}>No messages yet. Say hello.</Text>}
          />

          {/* Pending attachment preview banner */}
          {pendingAttachment && (
            <View style={styles.previewBanner}>
              {pendingAttachment.type.includes("image") ? (
                <Image source={{ uri: pendingAttachment.uri }} style={styles.previewThumb} />
              ) : (
                <View style={styles.previewIconBox}>
                  <Text style={{ fontSize: 18 }}>
                    {pendingAttachment.type.includes("video") ? "🎥" : "📄"}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {pendingAttachment.name}
                </Text>
                {pendingAttachment.size ? (
                  <Text style={styles.previewSize}>
                    {(pendingAttachment.size / 1024).toFixed(0)} KB
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setPendingAttachment(null)}
                style={styles.previewRemoveBtn}
                hitSlop={8}
              >
                <Text style={styles.previewRemoveText}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Compose Bar */}
          <View style={styles.compose}>
            <Pressable
              style={styles.clipButton}
              onPress={() => setShowAttachMenu(true)}
              hitSlop={8}
            >
              <Text style={styles.clipIcon}>📎</Text>
            </Pressable>

            <TextInput
              style={styles.input}
              placeholder={activeChannel ? `Message #${activeChannel.name}` : "Message"}
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={mode}
              value={text}
              onChangeText={setText}
              multiline
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={speech.isListening ? "Stop recording voice" : "Dictate message"}
              style={[
                styles.clipButton,
                speech.isListening && { backgroundColor: colors.danger + '25' },
              ]}
              onPress={speech.toggle}
              hitSlop={8}
            >
              <Text style={{ fontSize: 18 }}>{speech.isListening ? "🔴" : "🎙️"}</Text>
            </Pressable>

            <Pressable
              style={[styles.sendButton, !canSend && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!canSend}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Attachment Options Modal */}
      <Modal
        visible={showAttachMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachMenu(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={styles.menuBox}>
            <Text style={styles.menuTitle}>Share in Chat</Text>

            <Pressable style={styles.menuItem} onPress={handlePickImage}>
              <Text style={styles.menuIcon}>🖼</Text>
              <View>
                <Text style={styles.menuItemLabel}>Photo / Image</Text>
                <Text style={styles.menuItemSub}>JPG, PNG, WebP</Text>
              </View>
            </Pressable>

            <Pressable style={styles.menuItem} onPress={handlePickVideo}>
              <Text style={styles.menuIcon}>🎥</Text>
              <View>
                <Text style={styles.menuItemLabel}>Video</Text>
                <Text style={styles.menuItemSub}>MP4, MOV, WebM</Text>
              </View>
            </Pressable>

            <Pressable style={styles.menuItem} onPress={handlePickDocument}>
              <Text style={styles.menuIcon}>📄</Text>
              <View>
                <Text style={styles.menuItemLabel}>Document / PDF</Text>
                <Text style={styles.menuItemSub}>PDF files</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.menuCancel}
              onPress={() => setShowAttachMenu(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
    title: { fontSize: 20, fontWeight: "700", color: c.text },
    subtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
    channelScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 50 },
    channelRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12, alignItems: "flex-start" },
    chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.surface, alignSelf: "flex-start" },
    thread: { padding: 16, gap: 10, flexGrow: 1 },
    bubble: {
      maxWidth: "85%",
      alignSelf: "flex-start",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      padding: 10,
      gap: 6,
    },
    bubbleMine: {
      alignSelf: "flex-end",
      backgroundColor: c.primary,
      borderColor: c.primary,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 4,
    },
    sender: { fontSize: 11, fontWeight: "700", color: c.accent, marginBottom: 2 },
    messageText: { fontSize: 14, color: c.text, lineHeight: 20 },
    messageTextMine: { color: c.onPrimary },
    bubbleAttachments: {
      gap: 6,
      marginTop: 2,
    },
    chatImageWrap: {
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: c.surfaceMuted,
    },
    chatImage: {
      width: 220,
      height: 160,
      borderRadius: 10,
    },
    fileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 8,
      borderRadius: 8,
    },
    fileCardMine: {
      backgroundColor: "rgba(255,255,255,0.15)",
    },
    fileCardTheirs: {
      backgroundColor: c.surfaceMuted,
    },
    fileIcon: {
      fontSize: 20,
    },
    fileName: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    fileMeta: {
      fontSize: 10,
      marginTop: 1,
    },
    fileArrow: {
      fontSize: 14,
      color: c.muted,
      marginLeft: 4,
    },
    time: { fontSize: 9, color: c.muted, marginTop: 2, alignSelf: "flex-end" },
    timeMine: { color: c.onPrimary, opacity: 0.75 },
    previewBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    previewThumb: {
      width: 36,
      height: 36,
      borderRadius: 6,
      backgroundColor: c.surfaceMuted,
    },
    previewIconBox: {
      width: 36,
      height: 36,
      borderRadius: 6,
      backgroundColor: c.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    previewName: {
      fontSize: 12,
      fontWeight: "600",
      color: c.text,
    },
    previewSize: {
      fontSize: 10,
      color: c.muted,
    },
    previewRemoveBtn: {
      padding: 6,
    },
    previewRemoveText: {
      fontSize: 14,
      color: c.muted,
      fontWeight: "700",
    },
    compose: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.background,
    },
    clipButton: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    clipIcon: {
      fontSize: 16,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: c.text,
      backgroundColor: c.background,
      fontSize: 15,
    },
    sendButton: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    sendButtonText: { color: c.onPrimary, fontWeight: "600", fontSize: 14 },
    menuOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuBox: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      gap: 12,
    },
    menuTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
      marginBottom: 4,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: c.background,
    },
    menuIcon: {
      fontSize: 22,
    },
    menuItemLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
    menuItemSub: {
      fontSize: 11,
      color: c.muted,
      marginTop: 1,
    },
    menuCancel: {
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    menuCancelText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.muted,
    },
  });
