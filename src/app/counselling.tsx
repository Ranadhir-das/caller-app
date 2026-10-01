import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import {
  createWalkInCounselling,
  getLeadCounsellings,
  type CounsellingRecord,
} from '@/services/counselling';

export default function WalkInCounsellingScreen() {
  const styles = useAppStyles(createStyles);
  const { colors } = useAppTheme();
  const { token } = useAuth();
  const { refresh: refreshLeads } = useLeads();
  const { leadId, leadName, leadPhone, college: initialCollege } = useLocalSearchParams<{
    leadId: string;
    leadName?: string;
    leadPhone?: string;
    college?: string;
  }>();

  const [collegeInput, setCollegeInput] = useState(initialCollege || '');
  const [courseInput, setCourseInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [conductedDate, setConductedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prior history
  const [historyLoading, setHistoryLoading] = useState(false);
  const [counsellings, setCounsellings] = useState<CounsellingRecord[]>([]);

  const loadHistory = useCallback(async () => {
    if (!token || !leadId) return;
    setHistoryLoading(true);
    try {
      const data = await getLeadCounsellings(token, leadId);
      setCounsellings(data.counsellings);
    } catch {
      // Non-fatal if prior history cannot be loaded
    } finally {
      setHistoryLoading(false);
    }
  }, [token, leadId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleSave = async () => {
    if (!leadId) {
      Alert.alert('Missing Lead', 'No lead selected for walk-in counselling.');
      return;
    }
    if (!token) {
      Alert.alert('Session Expired', 'Please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      await createWalkInCounselling(token, {
        lead_id: Number(leadId),
        counselling_type: 'WALK_IN',
        college: collegeInput.trim(),
        course: courseInput.trim(),
        notes: notesInput.trim(),
        conducted_at: conductedDate.toISOString(),
      });

      await refreshLeads();
      Alert.alert(
        'Walk-in Counselling Recorded',
        `Counselling consultation for ${leadName || 'student'} has been saved successfully.`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error('Record counselling failed:', error);
      Alert.alert(
        'Recording Failed',
        error instanceof Error ? error.message : 'Could not save walk-in counselling.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <AnimatedBackButton />
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Walk-in Counselling</Text>
            <Text style={styles.headerSubtitle}>
              Record in-person student counselling consultation
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Student Info Card */}
          <View style={styles.studentCard}>
            <View style={styles.studentAvatar}>
              <Text style={styles.studentAvatarText}>
                {(leadName || 'S').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.studentDetails}>
              <Text style={styles.studentName}>{leadName || 'Student Candidate'}</Text>
              <Text style={styles.studentPhone}>{leadPhone || 'No phone'}</Text>
              {leadId ? (
                <Text style={styles.studentLeadId}>Lead #{leadId}</Text>
              ) : null}
            </View>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>College / Institution</Text>
            <TextInput
              style={styles.input}
              value={collegeInput}
              onChangeText={setCollegeInput}
              placeholder="e.g. Tbilisi State Medical University"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={styles.fieldLabel}>Course / Program of Interest</Text>
            <TextInput
              style={styles.input}
              value={courseInput}
              onChangeText={setCourseInput}
              placeholder="e.g. MBBS, MD, MBA"
              placeholderTextColor={colors.placeholder}
            />

            <Text style={styles.fieldLabel}>Counselling Date</Text>
            <Pressable
              style={styles.dateSelector}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateSelectorText}>
                📅{' '}
                {conductedDate.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </Pressable>

            {showDatePicker && (
              <DateTimePicker
                value={conductedDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(_, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) setConductedDate(selectedDate);
                }}
              />
            )}

            <Text style={styles.fieldLabel}>Discussion &amp; Counselling Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notesInput}
              onChangeText={setNotesInput}
              placeholder="Details of student interaction, document verification, queries answered, candidate interest level…"
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Save Walk-in Counselling 📋</Text>
              )}
            </Pressable>
          </View>

          {/* Prior Counselling History */}
          <View style={styles.historySection}>
            <Text style={styles.historySectionTitle}>Previous Counselling Sessions</Text>
            {historyLoading ? (
              <ActivityIndicator
                size="small"
                color={colors.accent}
                style={{ marginTop: 12 }}
              />
            ) : counsellings.length > 0 ? (
              counsellings.map((c) => (
                <View key={c.id} style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <Text style={styles.historyTypeBadge}>
                      {c.counselling_type_display || 'Walk-in'}
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(c.conducted_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  {c.college ? (
                    <Text style={styles.historyCollege}>
                      🏛️ {c.college} {c.course ? `(${c.course})` : ''}
                    </Text>
                  ) : null}
                  {c.notes ? (
                    <Text style={styles.historyNotes}>{c.notes}</Text>
                  ) : null}
                  <Text style={styles.historyCounsellor}>
                    By {c.caller_name || 'Counselor'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.historyEmpty}>
                No previous counselling sessions recorded for this lead.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    headerTitles: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    studentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
      gap: 12,
    },
    studentAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    studentAvatarText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '700',
    },
    studentDetails: {
      flex: 1,
    },
    studentName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    studentPhone: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
    },
    studentLeadId: {
      fontSize: 11,
      color: colors.accent,
      fontWeight: '600',
      marginTop: 2,
    },
    formSection: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 24,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.secondary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
    },
    textArea: {
      minHeight: 90,
      textAlignVertical: 'top',
    },
    dateSelector: {
      backgroundColor: colors.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dateSelectorText: {
      fontSize: 14,
      color: colors.text,
    },
    submitButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },
    historySection: {
      marginTop: 8,
    },
    historySectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    historyCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    historyCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    historyTypeBadge: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent,
      backgroundColor: 'rgba(37,99,235,0.1)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    historyDate: {
      fontSize: 12,
      color: colors.muted,
    },
    historyCollege: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    historyNotes: {
      fontSize: 13,
      color: colors.secondary,
      marginBottom: 6,
      lineHeight: 18,
    },
    historyCounsellor: {
      fontSize: 11,
      color: colors.muted,
      fontStyle: 'italic',
    },
    historyEmpty: {
      fontSize: 13,
      color: colors.muted,
      fontStyle: 'italic',
      marginTop: 4,
    },
  });
