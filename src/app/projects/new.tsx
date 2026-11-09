import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles, AppColors } from '@/context/AppThemeContext';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { KeyboardAwareContainer } from '@/components/KeyboardAwareContainer';
import {
  createProject,
  ProjectPriority,
  PROJECT_PRIORITY_LABELS,
  formatProjectDate,
} from '@/services/projects';

const PRIORITIES: ProjectPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function CreateProjectScreen() {
  const { token } = useAuth();
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createStyles);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const handleDateChange = (event: { type: string }, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type !== 'set' || !selectedDate) return;
    const iso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    setDueDate(iso);
  };

  const handleCreate = async () => {
    if (busy) return;
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setTitleError('Project title is required.');
      return;
    }
    if (cleanTitle.length > 180) {
      setTitleError('Title cannot exceed 180 characters.');
      return;
    }
    setTitleError(null);

    if (!token) {
      Alert.alert('Session Error', 'Please sign in again to create a project.');
      return;
    }

    setBusy(true);
    try {
      const created = await createProject(token, {
        title: cleanTitle,
        description: description.trim(),
        priority,
        due_date: dueDate || null,
      });

      Alert.alert(
        'Project Created',
        `Project "${created.title}" has been created and is now active.`,
        [
          {
            text: 'View Project',
            onPress: () => {
              router.replace({ pathname: '/projects/details', params: { id: String(created.id) } } as never);
            },
          },
        ],
        { cancelable: false },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unable to create project. Please try again.';
      Alert.alert('Failed to Create Project', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <AnimatedBackButton />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>New Project</Text>
          <Text style={styles.headerSubtitle}>Self-created work assignment</Text>
        </View>
      </View>

      <KeyboardAwareContainer contentContainerStyle={styles.content}>
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
          <Text style={[styles.infoBannerText, { color: colors.primary }]}>
            ℹ️ Self-created projects are assigned to you and marked as Started immediately. You can track work sessions and request completion review once finished.
          </Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {/* Title Field */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Project Title *</Text>
              <Text style={[styles.counterText, cleanTitleLen(title) > 180 && { color: colors.danger }]}>
                {title.length}/180
              </Text>
            </View>
            <TextInput
              style={[
                styles.textInput,
                { color: colors.text, borderColor: titleError ? colors.danger : colors.border },
              ]}
              placeholder="e.g. Video Reels Batch 4, CRM API Optimization"
              placeholderTextColor={colors.placeholder}
              value={title}
              onChangeText={val => {
                setTitle(val);
                if (titleError) setTitleError(null);
              }}
              maxLength={180}
              editable={!busy}
            />
            {!!titleError && <Text style={[styles.errorText, { color: colors.danger }]}>{titleError}</Text>}
          </View>

          {/* Description Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
              placeholder="Outline project scope, deliverables, requirements, or links..."
              placeholderTextColor={colors.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              editable={!busy}
            />
          </View>

          {/* Priority Selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map(p => {
                const isSelected = priority === p;
                const pillColor = getPriorityPillColor(p, colors);

                return (
                  <Pressable
                    key={p}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    disabled={busy}
                    style={[
                      styles.priorityPill,
                      { borderColor: isSelected ? pillColor.activeBorder : colors.border },
                      isSelected && { backgroundColor: pillColor.bg },
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityPillText,
                        { color: isSelected ? pillColor.text : colors.muted },
                        isSelected && { fontWeight: '700' },
                      ]}
                    >
                      {PROJECT_PRIORITY_LABELS[p]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Due Date Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Due Date (Optional)</Text>
            <View style={styles.dateRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select Due Date"
                disabled={busy}
                style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.dateButtonText, { color: dueDate ? colors.text : colors.placeholder }]}>
                  {dueDate ? formatProjectDate(dueDate) : 'No due date chosen'}
                </Text>
                <Text style={styles.calendarIcon}>📅</Text>
              </Pressable>

              {!!dueDate && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear Date"
                  disabled={busy}
                  style={[styles.clearDateBtn, { backgroundColor: colors.dangerSoft }]}
                  onPress={() => setDueDate(null)}
                >
                  <Text style={[styles.clearDateText, { color: colors.danger }]}>Clear</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Date Picker Modal */}
          {showDatePicker && (
            <DateTimePicker
              themeVariant={mode}
              value={dueDate ? new Date(`${dueDate}T12:00:00`) : new Date()}
              mode="date"
              display={Platform.OS === 'android' ? 'default' : 'spinner'}
              onChange={handleDateChange}
            />
          )}

          {/* Submit Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create Project"
            disabled={busy}
            style={[styles.submitBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]}
            onPress={handleCreate}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>Create Project</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAwareContainer>
    </SafeAreaView>
  );
}

function cleanTitleLen(t: string): number {
  return t.length;
}

function getPriorityPillColor(p: ProjectPriority, c: AppColors) {
  switch (p) {
    case 'URGENT':
      return { bg: c.dangerSoft, text: c.danger, activeBorder: c.danger };
    case 'HIGH':
      return { bg: c.orangeSoft, text: c.orange, activeBorder: c.orange };
    case 'MEDIUM':
      return { bg: c.accentSoft, text: c.primary, activeBorder: c.primary };
    case 'LOW':
    default:
      return { bg: c.surfaceMuted, text: c.secondary, activeBorder: c.border };
  }
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.surface,
    },
    headerCenter: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 1,
    },
    content: {
      padding: 16,
      gap: 16,
      paddingBottom: 40,
    },
    infoBanner: {
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
    },
    infoBannerText: {
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: '500',
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 16,
    },
    fieldGroup: {
      gap: 6,
    },
    fieldHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    counterText: {
      fontSize: 12,
      color: c.muted,
    },
    textInput: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 48,
      fontSize: 15,
      backgroundColor: c.background,
    },
    textArea: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      minHeight: 110,
      textAlignVertical: 'top',
      backgroundColor: c.background,
    },
    errorText: {
      fontSize: 12,
      marginTop: 2,
    },
    priorityRow: {
      flexDirection: 'row',
      gap: 8,
    },
    priorityPill: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    priorityPillText: {
      fontSize: 13,
      fontWeight: '600',
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    dateButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 48,
    },
    dateButtonText: {
      fontSize: 14,
    },
    calendarIcon: {
      fontSize: 16,
    },
    clearDateBtn: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
    },
    clearDateText: {
      fontSize: 13,
      fontWeight: '600',
    },
    submitBtn: {
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    submitBtnText: {
      fontSize: 15,
      fontWeight: '700',
    },
  });
