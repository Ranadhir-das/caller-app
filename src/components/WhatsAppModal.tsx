import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useAppStyles, type AppColors } from "@/context/AppThemeContext";
import {
  initiateWhatsApp,
  launchWhatsAppHandoff,
  listWhatsAppTemplates,
  type WhatsAppTemplate,
} from "@/services/whatsapp";

interface WhatsAppModalProps {
  visible: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  leadPhone: string;
}

export function WhatsAppModal({
  visible,
  onClose,
  leadId,
  leadName,
  leadPhone,
}: WhatsAppModalProps) {
  const { token } = useAuth();
  const styles = useAppStyles(makeStyles);

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !token) return;
    setLoadingTemplates(true);
    listWhatsAppTemplates(token)
      .then((data) => {
        setTemplates(data);
        if (data.length > 0) {
          // Preselect first template
          const first = data[0];
          setSelectedTemplateId(first.id);
          setMessage(first.message.replace(/\{name\}/g, leadName || "there"));
        } else {
          setSelectedTemplateId(null);
          setMessage("");
        }
      })
      .catch(() => {
        // Fallback to custom
        setSelectedTemplateId(null);
        setMessage("");
      })
      .finally(() => setLoadingTemplates(false));
  }, [visible, token, leadName]);

  const handleSelectTemplate = (template: WhatsAppTemplate | null) => {
    if (!template) {
      setSelectedTemplateId(null);
      setMessage("");
    } else {
      setSelectedTemplateId(template.id);
      setMessage(template.message.replace(/\{name\}/g, leadName || "there"));
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!leadPhone) {
      Alert.alert("Missing Phone", "This student has no phone number on record.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Attempt to open WhatsApp application / web fallback
      const result = await launchWhatsAppHandoff(leadPhone, message);

      if (!result.success) {
        Alert.alert(
          "WhatsApp Unavailable",
          result.error || "Could not launch WhatsApp. Please check if WhatsApp is installed."
        );
        return;
      }

      // 2. Record WHATSAPP_INITIATED on the backend
      if (token) {
        void initiateWhatsApp(token, leadId, {
          template_id: selectedTemplateId,
          message: message.trim(),
          source: "CALLER",
        }).catch((err) => {
          console.warn("[WhatsApp] Failed to record initiated activity:", err);
        });
      }

      onClose();
    } catch (err) {
      Alert.alert("Error", "An unexpected error occurred while launching WhatsApp.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>WhatsApp Student</Text>
              <Text style={styles.subtitle}>Prefilled manual message handoff</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Student details */}
          <View style={styles.infoBox}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Student</Text>
              <Text style={styles.infoVal}>{leadName}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoVal}>{leadPhone}</Text>
            </View>
          </View>

          {/* Template pills */}
          <Text style={styles.sectionHeading}>Choose Template</Text>
          {loadingTemplates ? (
            <ActivityIndicator style={{ marginVertical: 10 }} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templateList}
            >
              <Pressable
                style={[
                  styles.pill,
                  selectedTemplateId === null && styles.pillActive,
                ]}
                onPress={() => handleSelectTemplate(null)}
              >
                <Text
                  style={[
                    styles.pillText,
                    selectedTemplateId === null && styles.pillTextActive,
                  ]}
                >
                  Custom
                </Text>
              </Pressable>
              {templates.map((tpl) => (
                <Pressable
                  key={tpl.id}
                  style={[
                    styles.pill,
                    selectedTemplateId === tpl.id && styles.pillActive,
                  ]}
                  onPress={() => handleSelectTemplate(tpl)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      selectedTemplateId === tpl.id && styles.pillTextActive,
                    ]}
                  >
                    {tpl.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Message input */}
          <Text style={styles.sectionHeading}>Message (Editable)</Text>
          <TextInput
            style={styles.messageInput}
            multiline
            numberOfLines={4}
            value={message}
            onChangeText={setMessage}
            placeholder="Type your WhatsApp message..."
            placeholderTextColor="#888"
          />

          <Text style={styles.disclaimer}>
            ℹ️ WhatsApp will open with this message prefilled. You must press Send in WhatsApp.
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.openBtn, submitting && { opacity: 0.6 }]}
              onPress={handleOpenWhatsApp}
              disabled={submitting}
            >
              <Text style={styles.openText}>
                {submitting ? "Opening..." : "💬 Open WhatsApp"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: AppColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      gap: 12,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
    },
    subtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    closeBtn: {
      padding: 6,
    },
    closeText: {
      fontSize: 16,
      color: c.muted,
      fontWeight: "600",
    },
    infoBox: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: c.background,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    infoCol: {
      flex: 1,
    },
    infoLabel: {
      fontSize: 11,
      color: c.muted,
      textTransform: "uppercase",
      fontWeight: "600",
    },
    infoVal: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
      marginTop: 2,
    },
    sectionHeading: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
      marginTop: 4,
    },
    templateList: {
      gap: 8,
      paddingVertical: 4,
    },
    pill: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    pillActive: {
      backgroundColor: "#25D366",
      borderColor: "#25D366",
    },
    pillText: {
      fontSize: 13,
      color: c.text,
    },
    pillTextActive: {
      color: "#ffffff",
      fontWeight: "600",
    },
    messageInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      color: c.text,
      backgroundColor: c.background,
      minHeight: 90,
      textAlignVertical: "top",
      fontSize: 14,
      lineHeight: 20,
    },
    disclaimer: {
      fontSize: 11,
      color: c.muted,
      lineHeight: 16,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 6,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelText: {
      color: c.text,
      fontWeight: "600",
      fontSize: 14,
    },
    openBtn: {
      flex: 2,
      backgroundColor: "#25D366",
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    openText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 15,
    },
  });
