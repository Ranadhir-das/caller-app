import React, { useState } from 'react';
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
import { NoteInputWithVoice } from '@/components/NoteInputWithVoice';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import { apiRequest, ApiError } from '@/services/api';
import { COURSES, validCourse, validYear } from '@/services/courses';
import { newCallId } from '@/services/callDrafts';

const ENQUIRY_SOURCES = [
  'Incoming Call',
  'WhatsApp',
  'Advertisement',
  'Referral',
  'Walk-in',
  'Other',
];

const OUTCOMES = [
  { id: 'interested', label: 'Interested', backend: 'INTERESTED', icon: '👍' },
  { id: 'call_back', label: 'Call Back', backend: 'CALL_BACK', icon: '🔄' },
  { id: 'not_interested', label: 'Not Interested', backend: 'NOT_INTERESTED', icon: '👎' },
  { id: 'no_answer', label: 'No Answer', backend: 'NO_ANSWER', icon: '📵' },
  { id: 'busy', label: 'Busy', backend: 'BUSY', icon: '📞' },
  { id: 'wrong_number', label: 'Wrong Number', backend: 'WRONG_NUMBER', icon: '❌' },
];

export default function IncomingEnquiryScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const { user, token } = useAuth();
  const { refresh, addCallHistory } = useLeads();
  const params = useLocalSearchParams<{ phone_number?: string }>();

  const [studentName, setStudentName] = useState('');
  const [phone, setPhone] = useState(params.phone_number || '');
  const [source, setSource] = useState('Incoming Call');
  const [selectedCourse, setSelectedCourse] = useState('MBBS');
  const [customCourse, setCustomCourse] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('interested');
  const currentYear = new Date().getFullYear();
  const [admissionYear, setAdmissionYear] = useState(String(currentYear + 1));
  const [notes, setNotes] = useState('');

  // Follow-up state
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [hasSelectedTime, setHasSelectedTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const handleDateChange = (event: unknown, selected?: Date) => {
    setShowDatePicker(false);
    if (!selected) return;
    const base = followUpDate || new Date();
    selected.setHours(base.getHours(), base.getMinutes(), 0, 0);
    setFollowUpDate(selected);
    setHasSelectedDate(true);
    setShowTimePicker(true);
  };

  const handleTimeChange = (event: unknown, selected?: Date) => {
    setShowTimePicker(false);
    if (!selected) return;
    const base = followUpDate || new Date();
    base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setFollowUpDate(new Date(base));
    setHasSelectedTime(true);
  };

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const handleSubmit = async () => {
    if (submitting) return;

    const trimmedName = studentName.trim();
    if (!trimmedName) {
      Alert.alert('Student Name Required', 'Please enter the student\'s name.');
      return;
    }

    const cleanPhone = phone.trim();
    const digitsOnly = cleanPhone.replace(/[^0-9]/g, '').replace(/^00/, '');
    if (!/^\+?[0-9 ().-]+$/.test(cleanPhone) || digitsOnly.length < 7 || digitsOnly.length > 15) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number (7 to 15 digits).');
      return;
    }

    if (!validCourse(selectedCourse, customCourse)) {
      Alert.alert(
        'Course Required',
        selectedCourse === 'OTHERS'
          ? 'Please enter the custom course name (1-150 characters).'
          : 'Please select a valid course.'
      );
      return;
    }

    if (selectedOutcome === 'interested' && !validYear(admissionYear)) {
      Alert.alert('Admission Year Required', 'Please enter a valid admission year (1-9999).');
      return;
    }

    if (selectedOutcome === 'call_back') {
      if (!followUpDate || !hasSelectedDate || !hasSelectedTime) {
        Alert.alert('Follow-up Required', 'Please select both date and time for Call Back.');
        return;
      }
    }

    if (!token) {
      Alert.alert('Session Expired', 'Please sign in again.');
      return;
    }

    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const outcomeBackend = OUTCOMES.find((o) => o.id === selectedOutcome)?.backend || 'INTERESTED';

    const payload = {
      client_event_id: newCallId(),
      phone_number: cleanPhone,
      create_lead: true,
      student_name: trimmedName,
      preferred_course: selectedCourse,
      preferred_course_custom: selectedCourse === 'OTHERS' ? customCourse.trim() : '',
      lead_source: source,
      outcome: outcomeBackend,
      notes: notes.trim(),
      started_at: nowIso,
      ended_at: nowIso,
      duration_seconds: 0,
      ...(selectedOutcome === 'interested'
        ? {
            selected_course: selectedCourse,
            selected_course_custom: selectedCourse === 'OTHERS' ? customCourse.trim() : '',
            expected_admission_year: Number(admissionYear),
          }
        : {}),
      ...(followUpDate && hasSelectedDate && hasSelectedTime
        ? { callback_at: followUpDate.toISOString() }
        : {}),
    };

    try {
      const response = await apiRequest<{
        id: number;
        lead: number | null;
        lead_name: string | null;
        phone_number: string;
        lead_created?: boolean;
        selected_course?: string;
        selected_course_custom?: string;
        expected_admission_year?: number;
        course_classification?: string;
        outcome_points?: number;
      }>('/calls/', {
        method: 'POST',
        body: payload,
        token,
      });

      // Update lead context & call history
      try {
        await refresh();
        if (response.id) {
          addCallHistory({
            id: String(response.id),
            leadId: response.lead ? String(response.lead) : '',
            leadName: response.lead_name || trimmedName,
            phone: response.phone_number || cleanPhone,
            isExternal: false,
            durationSeconds: 0,
            outcome: selectedOutcome as any,
            notes: notes.trim(),
            calledAt: nowIso,
            selectedCourse: response.selected_course,
            customCourse: response.selected_course_custom,
            admissionYear: response.expected_admission_year,
            courseClassification: response.course_classification,
            outcomePoints: response.outcome_points,
            followUpDate: followUpDate?.toISOString(),
          });
        }
      } catch (err) {
        console.warn('Refresh after enquiry creation error:', err);
      }

      const leadId = response.lead;
      const successTitle = response.lead_created ? 'Lead Created Successfully' : 'Enquiry Recorded';
      const successMessage = response.lead_created
        ? `${trimmedName} has been added to your assigned leads.`
        : 'This number was already in your CRM. The enquiry has been linked to the existing lead.';

      Alert.alert(
        successTitle,
        successMessage,
        [
          ...(leadId
            ? [
                {
                  text: 'View Lead',
                  onPress: () =>
                    router.replace({
                      pathname: '/lead-details' as never,
                      params: { id: String(leadId) },
                    }),
                },
              ]
            : []),
          {
            text: 'Done',
            onPress: () => router.back(),
          },
        ],
        { cancelable: false }
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        Alert.alert(
          'Lead Already Registered',
          'This number is already registered in the CRM. Please contact your administrator/manager if you believe this is an error.'
        );
      } else {
        Alert.alert(
          'Could Not Register Enquiry',
          err instanceof Error ? err.message : 'Please check your connection and try again.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <AnimatedBackButton />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Add Incoming Enquiry</Text>
          <Text style={styles.headerSubtitle}>Register direct call, WhatsApp, or lead enquiry</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 88 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
        {/* Student Name */}
        <View style={styles.card}>
          <Text style={styles.label}>Student Name *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Enter student's full name"
            placeholderTextColor={colors.muted}
            value={studentName}
            onChangeText={setStudentName}
            autoFocus={!params.phone_number}
          />

          {/* Phone Number */}
          <Text style={[styles.label, { marginTop: 14 }]}>Phone Number *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.muted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Enquiry Source */}
        <View style={styles.card}>
          <Text style={styles.label}>Enquiry Source *</Text>
          <View style={styles.chipRow}>
            {ENQUIRY_SOURCES.map((src) => {
              const active = source === src;
              return (
                <Pressable
                  key={src}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSource(src)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{src}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Preferred Course */}
        <View style={styles.card}>
          <Text style={styles.label}>Preferred Course *</Text>
          <View style={styles.chipRow}>
            {COURSES.map(([cCode, cLabel]) => {
              const active = selectedCourse === cCode;
              return (
                <Pressable
                  key={cCode}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedCourse(cCode)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{cLabel}</Text>
                </Pressable>
              );
            })}
          </View>

          {selectedCourse === 'OTHERS' && (
            <TextInput
              style={[styles.textInput, { marginTop: 10 }]}
              placeholder="Enter custom course name..."
              placeholderTextColor={colors.muted}
              value={customCourse}
              onChangeText={setCustomCourse}
            />
          )}
        </View>

        {/* Initial Outcome / Status */}
        <View style={styles.card}>
          <Text style={styles.label}>Call Outcome / Status *</Text>
          <View style={styles.outcomeGrid}>
            {OUTCOMES.map((o) => {
              const active = selectedOutcome === o.id;
              return (
                <Pressable
                  key={o.id}
                  style={[styles.outcomeCard, active && styles.outcomeCardActive]}
                  onPress={() => setSelectedOutcome(o.id)}
                >
                  <Text style={styles.outcomeIcon}>{o.icon}</Text>
                  <Text style={[styles.outcomeLabel, active && styles.outcomeLabelActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedOutcome === 'interested' && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.label}>Expected Admission Year *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 2026 or 2027"
                placeholderTextColor={colors.muted}
                value={admissionYear}
                onChangeText={setAdmissionYear}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Follow-up Section */}
        <View style={styles.card}>
          <View style={styles.followUpHeaderRow}>
            <Text style={styles.label}>
              📅 Follow-up Date & Time{' '}
              {selectedOutcome === 'call_back' ? (
                <Text style={{ color: colors.danger }}>* Required</Text>
              ) : (
                <Text style={{ color: colors.muted }}>(Optional)</Text>
              )}
            </Text>
            {followUpDate && (
              <Pressable
                onPress={() => {
                  setFollowUpDate(null);
                  setHasSelectedDate(false);
                  setHasSelectedTime(false);
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Clear</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.dateTimeRow}>
            <Pressable
              style={[styles.dateButton, { flex: 1, marginRight: 8 }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {followUpDate && hasSelectedDate ? formatDate(followUpDate) : 'Pick Date'}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => {
                if (!followUpDate || !hasSelectedDate) {
                  Alert.alert('Select Date First', 'Please select a follow-up date first.');
                  return;
                }
                setShowTimePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {followUpDate && hasSelectedTime ? formatTime(followUpDate) : 'Pick Time'}
              </Text>
            </Pressable>
          </View>

          {showDatePicker && (
            <DateTimePicker
              themeVariant={mode}
              value={followUpDate || new Date()}
              mode="date"
              minimumDate={new Date()}
              display={Platform.OS === 'android' ? 'default' : 'spinner'}
              onChange={handleDateChange}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              themeVariant={mode}
              value={followUpDate || new Date()}
              mode="time"
              display={Platform.OS === 'android' ? 'default' : 'spinner'}
              onChange={handleTimeChange}
            />
          )}
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.label}>Notes (Optional)</Text>
          <NoteInputWithVoice
            placeholder="Add notes about this enquiry (tap mic to speak)..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Submit Button */}
        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Register Enquiry & Save Lead</Text>
          )}
        </Pressable>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerCenter: {
      flex: 1,
      marginLeft: 12,
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
    headerSpacer: {
      width: 38,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    textInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    chipTextActive: {
      color: '#ffffff',
    },
    outcomeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    outcomeCard: {
      width: '31%',
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    outcomeCardActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentSoft,
    },
    outcomeIcon: {
      fontSize: 20,
      marginBottom: 4,
    },
    outcomeLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    outcomeLabelActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    followUpHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    dateTimeRow: {
      flexDirection: 'row',
      marginTop: 6,
    },
    dateButton: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: 'center',
    },
    dateButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    submitButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
