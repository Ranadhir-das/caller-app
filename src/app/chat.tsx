import { useCallback, useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import {
  ChatChannel,
  ChatMessage,
  chatSocketUrl,
  listChannels,
  listMessages,
  sendMessage,
} from "@/services/chat";

export default function ChatScreen() {
  const { user, token } = useAuth();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!token) return;
    listChannels(token)
      .then((list) => {
        setChannels(list);
        setActiveChannel((current) => current ?? list[0] ?? null);
      })
      .catch((e) => Alert.alert("Chat", e instanceof Error ? e.message : "Unable to load channels."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
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

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || !token || !activeChannel || sending) return;
    setText("");
    setSending(true);
    try {
      const message = await sendMessage(token, activeChannel.id, body);
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message]
      );
    } catch (e) {
      setText(body);
      Alert.alert("Chat", e instanceof Error ? e.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }, [text, token, activeChannel, sending]);

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
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.sender_id === user?.id && styles.bubbleMine]}>
                {item.sender_id !== user?.id && <Text style={styles.sender}>{item.sender_name}</Text>}
                <Text style={[styles.messageText, item.sender_id === user?.id && styles.messageTextMine]}>{item.text}</Text>
                <Text style={[styles.time, item.sender_id === user?.id && styles.timeMine]}>
                  {new Date(item.created_at).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.subtitle}>No messages yet. Say hello.</Text>}
          />

          <View style={styles.compose}>
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
              style={[styles.sendButton, (!text.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
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
      maxWidth: "80%",
      alignSelf: "flex-start",
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      padding: 10,
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
    time: { fontSize: 9, color: c.muted, marginTop: 4, alignSelf: "flex-end" },
    timeMine: { color: c.onPrimary, opacity: 0.75 },
    compose: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 10,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
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
    sendButton: { backgroundColor: c.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
    sendButtonText: { color: c.onPrimary, fontWeight: "600", fontSize: 14 },
  });
