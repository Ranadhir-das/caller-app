import { useCallback, useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  Keyboard,
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
import * as SafeAreaContext from "react-native-safe-area-context";
const { SafeAreaView } = SafeAreaContext;
import { useAuth } from "@/context/AuthContext";
import { useAppTheme, useAppStyles, AppColors } from "@/context/AppThemeContext";
import { AnimatedBackButton } from "@/components/AnimatedBackButton";
import { useSpeechToText, appendDictatedText } from "@/services/speech";
import {
  ChatAttachment,
  ChatChannel,
  ChatMessage,
  chatSocketUrl,
  getChatTicket,
  listChannels,
  listMessages,
  chatAttachmentImageSource,
  openChatAttachment,
  sendMessage,
  sendMessageWithAttachment,
} from "@/services/chat";

type PendingAttachment = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

type ReplyingContext = {
  id: number;
  sender_name: string;
  text: string;
};

const POPULAR_EMOJIS = [
  "👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏",
  "🎉", "🚀", "💯", "✨", "🤝", "👋", "😊", "😍",
  "🥰", "😎", "🤔", "😅", "🥳", "🙌", "💼", "📌",
  "⏳", "📞", "📝", "✅",
];

function parseQuotedMessage(rawText: string) {
  if (rawText && rawText.startsWith("> @")) {
    const idx = rawText.indexOf("\n\n");
    if (idx !== -1) {
      const header = rawText.slice(3, idx);
      const colon = header.indexOf(":");
      if (colon !== -1) {
        const sender = header.slice(0, colon).trim();
        const quoted = header.slice(colon + 1).trim();
        const rest = rawText.slice(idx + 2).trim();
        return { isQuote: true, sender, quoted, body: rest };
      }
    }
  }
  return { isQuote: false, sender: "", quoted: "", body: rawText || "" };
}

const AVATAR_COLORS = [
  "#005DF2",
  "#0D9488",
  "#7C3AED",
  "#DB2777",
  "#EA580C",
  "#2563EB",
  "#059669",
  "#D97706",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function formatMessageDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ChatScreen() {
  const { user, token } = useAuth();
  const { channelId, notificationId } = useLocalSearchParams<{
    channelId?: string;
    notificationId?: string;
  }>();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const insets =
    typeof SafeAreaContext.useSafeAreaInsets === "function"
      ? SafeAreaContext.useSafeAreaInsets()
      : { top: 0, bottom: 0, left: 0, right: 0 };

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [openingAttachment, setOpeningAttachment] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ReplyingContext | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ uri: string; name: string } | null>(null);

  const attachmentRequest = useRef<AbortController | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionSeqRef = useRef(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    setFailedImages({});
    return () => {
      attachmentRequest.current?.abort();
    };
  }, [token, activeChannel?.id]);

  // Android keyboard height listener for edge-to-edge responsiveness
  useEffect(() => {
    if (!Keyboard || typeof Keyboard.addListener !== "function") return;
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, []);

  const speech = useSpeechToText({
    onResult: (spokenText) => {
      setText((current) => appendDictatedText(current, spokenText));
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
          const target = list.find((channel) => String(channel.id) === channelId);
          setActiveChannel(target ?? null);
          if (!target)
            Alert.alert(
              "Chat unavailable",
              "This chat was removed or you no longer have access."
            );
        } else {
          setActiveChannel((current) => current ?? list[0] ?? null);
        }
      })
      .catch((e) =>
        Alert.alert("Chat", e instanceof Error ? e.message : "Unable to load channels.")
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, channelId, notificationId]);

  useEffect(() => {
    setMessages([]);
    setIsConnected(false);
    if (!token || !activeChannel) return;
    let active = true;
    const currentChanId = activeChannel.id;
    let reconnectDelay = 2000;

    const cleanupSocket = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        const s = socketRef.current;
        socketRef.current = null;
        s.onopen = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        try {
          s.close();
        } catch {}
      }
      if (active) setIsConnected(false);
    };

    const loadChannelMessages = () => {
      listMessages(token, currentChanId)
        .then((list) => {
          if (active) setMessages(list);
        })
        .catch((e) => {
          if (active) {
            Alert.alert("Chat", e instanceof Error ? e.message : "Unable to load messages.");
          }
        });
    };

    loadChannelMessages();

    const connect = async () => {
      if (!active) return;
      cleanupSocket();

      const seq = ++connectionSeqRef.current;

      try {
        const ticketRes = await getChatTicket(token, currentChanId);
        if (!active || seq !== connectionSeqRef.current) return;

        const socket = new WebSocket(chatSocketUrl(currentChanId, ticketRes.ticket));
        socketRef.current = socket;

        socket.onopen = () => {
          if (!active || seq !== connectionSeqRef.current) {
            try {
              socket.close();
            } catch {}
            return;
          }
          setIsConnected(true);
          reconnectDelay = 2000;
        };

        socket.onmessage = (event) => {
          if (!active || seq !== connectionSeqRef.current) return;
          try {
            const incoming: ChatMessage = JSON.parse(event.data);
            setMessages((current) =>
              current.some((m) => m.id === incoming.id) ? current : [...current, incoming]
            );
          } catch {
            // Ignore malformed message payloads safely
          }
        };

        socket.onerror = () => {
          if (active) setIsConnected(false);
        };

        socket.onclose = (event) => {
          if (!active || seq !== connectionSeqRef.current) return;
          socketRef.current = null;
          setIsConnected(false);
          if (event.code === 1000) return;

          const delay = reconnectDelay;
          reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (active && seq === connectionSeqRef.current) {
              void connect();
            }
          }, delay);
        };
      } catch {
        if (!active || seq !== connectionSeqRef.current) return;
        setIsConnected(false);
        const delay = reconnectDelay;
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (active && seq === connectionSeqRef.current) {
            void connect();
          }
        }, delay);
      }
    };

    void connect();

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && active) {
        loadChannelMessages();
        const currentSocket = socketRef.current;
        if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
          reconnectDelay = 2000;
          void connect();
        }
      }
    });

    return () => {
      active = false;
      connectionSeqRef.current++;
      appStateSub.remove();
      cleanupSocket();
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
    if (attachmentRequest.current) return;
    if (!token) {
      Alert.alert("Unable to open file", "Please sign in again to open this attachment.");
      return;
    }
    const controller = new AbortController();
    attachmentRequest.current = controller;
    setOpeningAttachment(att.id);
    try {
      await openChatAttachment(att, token, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        Alert.alert(
          "Unable to open file",
          error instanceof Error ? error.message : "Could not open attachment. Please try again."
        );
    } finally {
      if (attachmentRequest.current === controller) {
        attachmentRequest.current = null;
        setOpeningAttachment(null);
      }
    }
  };

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if ((!body && !pendingAttachment) || !token || !activeChannel || sending) return;

    let messageBody = body;
    if (replyingTo) {
      const snippet = replyingTo.text ? replyingTo.text.slice(0, 80) : "Attachment";
      messageBody = `> @${replyingTo.sender_name}: ${snippet}\n\n${body}`;
    }

    const currentText = messageBody;
    const currentAttachment = pendingAttachment;

    setText("");
    setReplyingTo(null);
    setShowEmojiPicker(false);
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
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Top Header Bar */}
      <View style={styles.header}>
        <AnimatedBackButton onPress={() => router.back()} />
        <View style={styles.channelBadge}>
          <Text style={styles.channelBadgeHash}>#</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activeChannel?.name || "General"}
          </Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? "#10B981" : "#F59E0B" },
              ]}
            />
            <Text style={styles.headerSubtitle}>
              {isConnected ? "Live Chat" : "Connecting..."}
              {activeChannel?.description ? ` • ${activeChannel.description}` : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Channel Pills Selector Strip */}
      {channels.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.channelScroll}
          contentContainerStyle={styles.channelRow}
        >
          {channels.map((c) => {
            const isActive = activeChannel?.id === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setActiveChannel(c)}
                style={[styles.chip, isActive && styles.chipActive]}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {c.kind === "GENERAL" ? "# " : "◆ "}
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            renderItem={({ item, index }) => {
              const isMine = item.sender_id === user?.id;
              const prev = index > 0 ? messages[index - 1] : null;
              const isNewDay =
                !prev ||
                new Date(item.created_at).toDateString() !==
                  new Date(prev.created_at).toDateString();
              const isSameSenderAsPrev =
                !isNewDay && prev && prev.sender_id === item.sender_id;

              const senderInitials = Array.from(item.sender_name || "U")[0]?.toUpperCase();
              const avatarColor = getAvatarColor(item.sender_name || "User");
              const parsed = parseQuotedMessage(item.text || "");

              return (
                <View style={styles.messageRowWrapper}>
                  {/* Date Separator Pill */}
                  {isNewDay && (
                    <View style={styles.dateSeparator}>
                      <View style={styles.dateSeparatorLine} />
                      <View style={styles.datePill}>
                        <Text style={styles.datePillText}>
                          {formatMessageDate(item.created_at)}
                        </Text>
                      </View>
                      <View style={styles.dateSeparatorLine} />
                    </View>
                  )}

                  {/* Message Item with Avatar */}
                  <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
                    {!isMine && (
                      <View style={styles.avatarSpace}>
                        {!isSameSenderAsPrev ? (
                          <View
                            style={[
                              styles.senderAvatar,
                              { backgroundColor: avatarColor },
                            ]}
                          >
                            <Text style={styles.senderAvatarText}>{senderInitials}</Text>
                          </View>
                        ) : (
                          <View style={styles.avatarSpacer} />
                        )}
                      </View>
                    )}

                    <View
                      style={[
                        styles.bubble,
                        isMine ? styles.bubbleMine : styles.bubbleTheirs,
                      ]}
                    >
                      {!isMine && !isSameSenderAsPrev && (
                        <Text style={[styles.sender, { color: avatarColor }]}>
                          {item.sender_name}
                        </Text>
                      )}

                      {/* Quoted Message Block (WhatsApp style) */}
                      {parsed.isQuote && (
                        <View style={[styles.bubbleQuote, isMine && styles.bubbleQuoteMine]}>
                          <View
                            style={[
                              styles.bubbleQuoteBar,
                              { backgroundColor: isMine ? "#FFFFFF" : getAvatarColor(parsed.sender) },
                            ]}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.bubbleQuoteSender,
                                isMine ? { color: "#FFFFFF" } : { color: getAvatarColor(parsed.sender) },
                              ]}
                              numberOfLines={1}
                            >
                              {parsed.sender}
                            </Text>
                            <Text
                              style={[
                                styles.bubbleQuoteText,
                                isMine && { color: "rgba(255,255,255,0.85)" },
                              ]}
                              numberOfLines={2}
                            >
                              {parsed.quoted}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Text Body */}
                      {!!parsed.body && (
                        <Text
                          style={[
                            styles.messageText,
                            isMine ? styles.messageTextMine : styles.messageTextTheirs,
                          ]}
                          selectable
                        >
                          {parsed.body}
                        </Text>
                      )}

                      {/* Attachments */}
                      {item.attachments && item.attachments.length > 0 && (
                        <View style={styles.bubbleAttachments}>
                          {item.attachments.map((att) => {
                            const isImg = att.mime_type.includes("image");
                            const isVid = att.mime_type.includes("video");

                            if (isImg) {
                              const baseSource = token ? chatAttachmentImageSource(att.id, token) : undefined;
                              const imageSource = baseSource
                                ? {
                                    ...baseSource,
                                    uri: `${baseSource.uri}?token=${encodeURIComponent(token || "")}`,
                                  }
                                : undefined;

                              return (
                                <Pressable
                                  key={att.id}
                                  onPress={() =>
                                    failedImages[att.id]
                                      ? (setFailedImages((current) => ({ ...current, [att.id]: false })), Promise.resolve())
                                      : handleOpenAttachment(att)
                                  }
                                  disabled={openingAttachment !== null}
                                  style={styles.chatImageWrap}
                                >
                                  {failedImages[att.id] ? (
                                    <View style={styles.imageFallbackWrap}>
                                      <Text style={styles.imageFallbackIcon}>🖼️</Text>
                                      <Text style={styles.imageFallbackText}>
                                        Image unavailable. Tap to retry.
                                      </Text>
                                    </View>
                                  ) : (
                                    <Image
                                      source={imageSource}
                                      onError={() =>
                                        setFailedImages((current) => ({
                                          ...current,
                                          [att.id]: true,
                                        }))
                                      }
                                      style={styles.chatImage}
                                      resizeMode="cover"
                                    />
                                  )}
                                  {openingAttachment === att.id && (
                                    <View style={styles.imageOverlayLoading}>
                                      <ActivityIndicator size="small" color="#FFFFFF" />
                                    </View>
                                  )}
                                </Pressable>
                              );
                            }

                            return (
                              <Pressable
                                key={att.id}
                                onPress={() => handleOpenAttachment(att)}
                                disabled={openingAttachment !== null}
                                style={[
                                  styles.fileCard,
                                  isMine ? styles.fileCardMine : styles.fileCardTheirs,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.fileIconBox,
                                    isMine && { backgroundColor: "rgba(255,255,255,0.2)" },
                                  ]}
                                >
                                  <Text style={styles.fileIcon}>
                                    {isVid ? "🎥" : "📄"}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      styles.fileName,
                                      isMine && { color: colors.onPrimary },
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {att.original_name}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.fileMeta,
                                      isMine
                                        ? { color: "rgba(255,255,255,0.75)" }
                                        : { color: colors.muted },
                                    ]}
                                  >
                                    {isVid ? "Video" : "Document"} •{" "}
                                    {(att.file_size / 1024).toFixed(0)} KB
                                  </Text>
                                </View>
                                {openingAttachment === att.id ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={isMine ? "#FFFFFF" : colors.primary}
                                  />
                                ) : (
                                  <Text
                                    style={[
                                      styles.fileArrow,
                                      isMine && { color: colors.onPrimary },
                                    ]}
                                  >
                                    ↗
                                  </Text>
                                )}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {/* Timestamp & Status */}
                      <View style={styles.metaRow}>
                        <Pressable
                          onPress={() => {
                            setReplyingTo({
                              id: item.id,
                              sender_name: item.sender_name || "User",
                              text: parsed.body || (item.attachments?.length ? "Attachment" : ""),
                            });
                            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
                          }}
                          hitSlop={8}
                          style={styles.replyButton}
                          accessibilityRole="button"
                          accessibilityLabel="Reply to this message"
                        >
                          <Text style={[styles.replyIcon, isMine && styles.replyIconMine]}>↩</Text>
                        </Pressable>
                        <Text style={[styles.time, isMine && styles.timeMine]}>
                          {formatMessageTime(item.created_at)}
                        </Text>
                        {isMine && <Text style={styles.deliveredCheck}>✓✓</Text>}
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  Start the conversation with your team. Say hello!
                </Text>
              </View>
            }
          />

          {/* Replying Banner (WhatsApp style) */}
          {replyingTo && (
            <View style={styles.replyBanner}>
              <View
                style={[
                  styles.replyAccentBar,
                  { backgroundColor: getAvatarColor(replyingTo.sender_name) },
                ]}
              />
              <View style={{ flex: 1, paddingHorizontal: 10, justifyContent: "center" }}>
                <Text
                  style={[
                    styles.replySender,
                    { color: getAvatarColor(replyingTo.sender_name) },
                  ]}
                  numberOfLines={1}
                >
                  Replying to {replyingTo.sender_name}
                </Text>
                <Text style={styles.replySnippet} numberOfLines={1}>
                  {replyingTo.text || "Attachment"}
                </Text>
              </View>
              <Pressable
                onPress={() => setReplyingTo(null)}
                style={styles.replyCloseBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
              >
                <Text style={styles.replyCloseText}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Pending attachment preview banner */}
          {pendingAttachment && (
            <View style={styles.previewBanner}>
              {pendingAttachment.type.includes("image") ? (
                <Image
                  source={{ uri: pendingAttachment.uri }}
                  style={styles.previewThumb}
                />
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
                accessibilityRole="button"
                accessibilityLabel="Remove attachment"
              >
                <Text style={styles.previewRemoveText}>✕</Text>
              </Pressable>
            </View>
          )}

          {/* Compose Bar */}
          <View
            style={[
              styles.compose,
              {
                paddingBottom:
                  Platform.OS === "android" && keyboardHeight > 0
                    ? keyboardHeight + 8
                    : Math.max(12, insets.bottom),
              },
            ]}
          >
            <Pressable
              style={styles.clipButton}
              onPress={() => {
                setShowEmojiPicker(false);
                setShowAttachMenu(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Attach photo, video or document"
            >
              <Text style={styles.clipIcon}>📎</Text>
            </Pressable>

            <Pressable
              style={styles.emojiToggleBtn}
              onPress={() => {
                setShowAttachMenu(false);
                if (showEmojiPicker) {
                  setShowEmojiPicker(false);
                } else {
                  Keyboard?.dismiss?.();
                  setShowEmojiPicker(true);
                  requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
                }
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Toggle emoji picker"
            >
              <Text style={styles.emojiToggleIcon}>😊</Text>
            </Pressable>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={
                  activeChannel ? `Message #${activeChannel.name}` : "Message"
                }
                placeholderTextColor={colors.placeholder}
                keyboardAppearance={mode}
                value={text}
                onChangeText={setText}
                onFocus={() => setShowEmojiPicker(false)}
                multiline
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  speech.isListening ? "Stop recording voice" : "Dictate message"
                }
                style={[
                  styles.micButton,
                  speech.isListening && styles.micButtonListening,
                ]}
                onPress={speech.toggle}
                hitSlop={6}
              >
                <Text style={{ fontSize: 16 }}>
                  {speech.isListening ? "🔴" : "🎙️"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.sendButtonIcon}>➤</Text>
              )}
            </Pressable>
          </View>

          {/* Emoji Tray */}
          {showEmojiPicker && (
            <View style={styles.emojiTray}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 180 }}
                contentContainerStyle={styles.emojiGrid}
              >
                {POPULAR_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={styles.emojiCell}
                    onPress={() => {
                      setText((prev) => prev + emoji);
                    }}
                    hitSlop={4}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* Full-Screen Image Lightbox Modal */}
      <Modal
        visible={lightboxImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxImage(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <SafeAreaView style={{ flex: 1, width: "100%" }} edges={["top", "bottom"]}>
            <View style={styles.lightboxHeader}>
              <Text style={styles.lightboxTitle} numberOfLines={1}>
                {lightboxImage?.name || "Image Preview"}
              </Text>
              <Pressable
                onPress={() => setLightboxImage(null)}
                style={styles.lightboxCloseBtn}
                hitSlop={10}
              >
                <Text style={styles.lightboxCloseText}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.lightboxBody}>
              {lightboxImage && (
                <Image
                  source={{
                    uri: lightboxImage.uri,
                    headers: token ? { Authorization: `Token ${token}` } : undefined,
                  }}
                  style={styles.lightboxImg}
                  resizeMode="contain"
                />
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>

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
            <View style={styles.menuDragHandle} />
            <Text style={styles.menuTitle}>Share with Team</Text>

            <Pressable
              style={styles.menuItem}
              onPress={handlePickImage}
              accessibilityRole="button"
            >
              <View style={[styles.menuIconWrap, { backgroundColor: "#EBF3FF" }]}>
                <Text style={styles.menuIcon}>🖼️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemLabel}>Photo / Image</Text>
                <Text style={styles.menuItemSub}>JPG, PNG, WebP format</Text>
              </View>
              <Text style={styles.menuItemChevron}>›</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={handlePickVideo}
              accessibilityRole="button"
            >
              <View style={[styles.menuIconWrap, { backgroundColor: "#F3E8FF" }]}>
                <Text style={styles.menuIcon}>🎥</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemLabel}>Video Clip</Text>
                <Text style={styles.menuItemSub}>MP4, MOV recordings</Text>
              </View>
              <Text style={styles.menuItemChevron}>›</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={handlePickDocument}
              accessibilityRole="button"
            >
              <View style={[styles.menuIconWrap, { backgroundColor: "#FEF3C7" }]}>
                <Text style={styles.menuIcon}>📄</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemLabel}>Document / PDF</Text>
                <Text style={styles.menuItemSub}>PDF, reports, spreadsheets</Text>
              </View>
              <Text style={styles.menuItemChevron}>›</Text>
            </Pressable>

            <Pressable
              style={styles.menuCancel}
              onPress={() => setShowAttachMenu(false)}
              accessibilityRole="button"
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
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
      gap: 12,
    },
    channelBadge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.accentSoft || "#EBF3FF",
      alignItems: "center",
      justifyContent: "center",
    },
    channelBadgeHash: {
      fontSize: 20,
      fontWeight: "800",
      color: c.primary,
    },
    headerInfo: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.text,
      letterSpacing: -0.2,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 2,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    headerSubtitle: {
      fontSize: 12,
      color: c.muted,
      fontWeight: "500",
    },
    channelScroll: {
      flexGrow: 0,
      flexShrink: 0,
      maxHeight: 52,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    channelRow: {
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      alignItems: "center",
    },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
      elevation: 2,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    chipTextActive: {
      color: c.onPrimary,
      fontWeight: "700",
    },
    centerContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: c.muted,
      fontWeight: "500",
    },
    thread: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 8,
      flexGrow: 1,
    },
    messageRowWrapper: {
      gap: 8,
    },
    dateSeparator: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 12,
      gap: 10,
    },
    dateSeparatorLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
    },
    datePill: {
      paddingHorizontal: 12,
      paddingVertical: 3,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    datePillText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.muted,
    },
    messageRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      maxWidth: "88%",
      alignSelf: "flex-start",
    },
    messageRowMine: {
      alignSelf: "flex-end",
      justifyContent: "flex-end",
    },
    avatarSpace: {
      width: 32,
      alignItems: "center",
    },
    senderAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      elevation: 1,
    },
    senderAvatarText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    avatarSpacer: {
      width: 32,
      height: 32,
    },
    bubble: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 8,
      borderRadius: 18,
      gap: 4,
      maxWidth: "100%",
    },
    bubbleTheirs: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderBottomLeftRadius: 4,
      elevation: 1,
      shadowColor: "#000",
      shadowOpacity: 0.03,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    bubbleMine: {
      backgroundColor: c.primary,
      borderBottomRightRadius: 4,
      elevation: 1,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    sender: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: -0.1,
      marginBottom: 2,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 21,
    },
    messageTextTheirs: {
      color: c.text,
    },
    messageTextMine: {
      color: c.onPrimary,
    },
    bubbleQuote: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 8,
      padding: 8,
      borderRadius: 10,
      backgroundColor: "rgba(0,0,0,0.06)",
      marginBottom: 6,
    },
    bubbleQuoteMine: {
      backgroundColor: "rgba(255,255,255,0.18)",
    },
    bubbleQuoteBar: {
      width: 3.5,
      borderRadius: 2,
    },
    bubbleQuoteSender: {
      fontSize: 11.5,
      fontWeight: "800",
      marginBottom: 2,
    },
    bubbleQuoteText: {
      fontSize: 12,
      color: c.text,
      lineHeight: 16,
    },
    bubbleAttachments: {
      gap: 6,
      marginTop: 4,
    },
    chatImageWrap: {
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      position: "relative",
    },
    chatImage: {
      width: 220,
      height: 160,
      borderRadius: 12,
    },
    imageFallbackWrap: {
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: 220,
      backgroundColor: c.surfaceMuted,
    },
    imageFallbackIcon: {
      fontSize: 24,
    },
    imageFallbackText: {
      fontSize: 12,
      color: c.text,
      textAlign: "center",
      fontWeight: "600",
    },
    imageOverlayLoading: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    fileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    fileCardMine: {
      backgroundColor: "rgba(255,255,255,0.15)",
      borderColor: "rgba(255,255,255,0.25)",
    },
    fileCardTheirs: {
      backgroundColor: c.surfaceMuted,
      borderColor: c.border,
    },
    fileIconBox: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    fileIcon: {
      fontSize: 18,
    },
    fileName: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
    },
    fileMeta: {
      fontSize: 11,
      marginTop: 2,
    },
    fileArrow: {
      fontSize: 15,
      fontWeight: "700",
      color: c.muted,
      marginLeft: 4,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 6,
      marginTop: 2,
    },
    replyButton: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      marginRight: 2,
    },
    replyIcon: {
      fontSize: 13,
      color: c.muted,
      fontWeight: "700",
    },
    replyIconMine: {
      color: "rgba(255,255,255,0.85)",
    },
    time: {
      fontSize: 10,
      color: c.muted,
      fontWeight: "500",
    },
    timeMine: {
      color: "rgba(255,255,255,0.75)",
    },
    deliveredCheck: {
      fontSize: 11,
      fontWeight: "700",
      color: "rgba(255,255,255,0.85)",
      letterSpacing: -1,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 80,
      paddingHorizontal: 24,
      gap: 8,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 4,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
    },
    emptySubtitle: {
      fontSize: 13,
      color: c.muted,
      textAlign: "center",
      lineHeight: 18,
    },
    previewBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    previewThumb: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
    },
    previewIconBox: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    previewName: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    previewSize: {
      fontSize: 11,
      color: c.muted,
    },
    previewRemoveBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    previewRemoveText: {
      fontSize: 13,
      color: c.muted,
      fontWeight: "700",
    },
    compose: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    clipButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.accentSoft || "#EBF3FF",
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    clipIcon: {
      fontSize: 18,
    },
    inputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.background,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      minHeight: 42,
      maxHeight: 110,
    },
    input: {
      flex: 1,
      paddingVertical: 8,
      fontSize: 15,
      color: c.text,
      lineHeight: 20,
    },
    micButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
    micButtonListening: {
      backgroundColor: c.danger + "25",
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      elevation: 2,
    },
    sendButtonDisabled: {
      opacity: 0.45,
    },
    sendButtonIcon: {
      color: c.onPrimary,
      fontSize: 17,
      fontWeight: "700",
      transform: [{ rotate: "0deg" }],
    },
    emojiToggleBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.accentSoft || "#EBF3FF",
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    emojiToggleIcon: {
      fontSize: 18,
    },
    emojiTray: {
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    emojiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 8,
    },
    emojiCell: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: c.background,
    },
    emojiText: {
      fontSize: 22,
    },
    replyBanner: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      borderLeftWidth: 4,
      borderLeftColor: c.primary,
    },
    replyAccentBar: {
      width: 4,
      height: "100%",
      borderRadius: 2,
    },
    replySender: {
      fontSize: 12,
      fontWeight: "800",
      color: c.primary,
      marginBottom: 2,
    },
    replySnippet: {
      fontSize: 12,
      color: c.muted,
    },
    replyCloseBtn: {
      padding: 6,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    replyCloseText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.muted,
    },
    lightboxBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
    },
    lightboxHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255,255,255,0.15)",
    },
    lightboxTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: "#FFFFFF",
      flex: 1,
      marginRight: 12,
    },
    lightboxCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    lightboxCloseText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    lightboxBody: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
    },
    lightboxImg: {
      width: "100%",
      height: "100%",
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuBox: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 28,
      gap: 12,
    },
    menuDragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.muted,
      alignSelf: "center",
      opacity: 0.4,
      marginBottom: 6,
    },
    menuTitle: {
      fontSize: 17,
      fontWeight: "800",
      color: c.text,
      letterSpacing: -0.2,
      marginBottom: 4,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    menuIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    menuIcon: {
      fontSize: 20,
    },
    menuItemLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: c.text,
    },
    menuItemSub: {
      fontSize: 11,
      color: c.muted,
      marginTop: 2,
    },
    menuItemChevron: {
      fontSize: 20,
      color: c.muted,
      fontWeight: "300",
    },
    menuCancel: {
      paddingVertical: 14,
      alignItems: "center",
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      marginTop: 6,
    },
    menuCancelText: {
      fontSize: 15,
      fontWeight: "700",
      color: c.text,
    },
  });
