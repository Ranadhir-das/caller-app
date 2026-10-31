import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import {
  useOptionalEmployeeWorkspace,
  type CreateAttendanceRequestPayload,
} from '@/context/EmployeeWorkspaceContext';
import {
  submitAttendanceRequest as submitRequestApi,
  type AttendanceRequestItem,
} from '@/services/employee';

interface AttendanceRequestModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialType?: 'LATE_ARRIVAL' | 'EARLY_SHIFT_END';
  onSubmit?: (payload: CreateAttendanceRequestPayload) => Promise<AttendanceRequestItem>;
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseTimeToIso(dateStr: string, timeStr: string): string | null {
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  // If already an ISO string
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Parse 12-hour format: "10:30 AM", "4:15 pm"
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  // Parse 24-hour format: "10:30", "16:00"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);

  let hours = 0;
  let minutes = 0;

  if (match12) {
    hours = parseInt(match12[1], 10);
    minutes = parseInt(match12[2], 10);
    const ampm = match12[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  } else if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  } else {
    const fallback = new Date(`${dateStr}T${trimmed}`);
    if (!isNaN(fallback.getTime())) {
      return fallback.toISOString();
    }
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const d = new Date(`${dateStr}T${hh}:${mm}:00`);
  if (isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString();
}

export function AttendanceRequestModal({
  visible,
  onClose,
  onSuccess,
  initialType = 'LATE_ARRIVAL',
  onSubmit,
}: AttendanceRequestModalProps) {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const workspace = useOptionalEmployeeWorkspace();
  const { token } = useAuth();

  const [requestType, setRequestType] = useState<'LATE_ARRIVAL' | 'EARLY_SHIFT_END'>(initialType);
  const [dateStr, setDateStr] = useState(getTodayString());
  const [reason, setReason] = useState('');
  const [timeDetail, setTimeDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (visible) {
      setRequestType(initialType);
      setDateStr(getTodayString());
      setReason('');
      setTimeDetail('');
      setErrorMsg('');
      setSubmitting(false);
    }
  }, [visible, initialType]);

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMsg('Please enter a reason for your request.');
      return;
    }
    if (trimmedReason.length < 10) {
      setErrorMsg('Reason must be at least 10 characters long.');
      return;
    }
    if (trimmedReason.length > 2000) {
      setErrorMsg('Reason cannot exceed 2000 characters.');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const payload: CreateAttendanceRequestPayload = {
        date: dateStr,
        request_type: requestType,
        reason: trimmedReason,
      };

      if (timeDetail.trim()) {
        const trimmedTime = timeDetail.trim();
        if (requestType === 'EARLY_SHIFT_END') {
          const isNumeric = !trimmedTime.includes(':') && !isNaN(parseFloat(trimmedTime));
          if (isNumeric) {
            const numericHours = parseFloat(trimmedTime);
            if (numericHours > 0 && numericHours <= 24) {
              payload.requested_net_hours = numericHours.toFixed(2);
            } else {
              setErrorMsg('Net work hours must be between 0.5 and 24.');
              setSubmitting(false);
              return;
            }
          } else {
            const iso = parseTimeToIso(dateStr, trimmedTime);
            if (!iso) {
              setErrorMsg('Please enter a valid departure time (e.g. 04:30 PM or 16:30) or worked hours (e.g. 6.5).');
              setSubmitting(false);
              return;
            }
            payload.requested_end = iso;
          }
        } else {
          // LATE_ARRIVAL
          const iso = parseTimeToIso(dateStr, trimmedTime);
          if (!iso) {
            setErrorMsg('Please enter a valid arrival time (e.g. 10:30 AM or 10:30).');
            setSubmitting(false);
            return;
          }
          payload.requested_start = iso;
        }
      }

      if (onSubmit) {
        await onSubmit(payload);
      } else if (workspace) {
        await workspace.submitAttendanceRequest(payload);
      } else {
        if (!token) throw new Error('Not authenticated.');
        await submitRequestApi(token, payload);
      }
      Alert.alert(
        'Request Submitted',
        requestType === 'LATE_ARRIVAL'
          ? 'Your late arrival request has been submitted for management review.'
          : 'Your early shift-end request has been submitted. Once approved by management, you will be able to end your shift.',
        [{ text: 'OK', onPress: () => {
          onSuccess?.();
          onClose();
        } }]
      );
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to submit attendance request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.dialogCard}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <Text style={styles.dialogTitle}>Shift &amp; Attendance Request</Text>
            <Text style={styles.dialogSubtitle}>
              Submit a formal request for late arrival or leaving your shift early. Requests are reviewed by management.
            </Text>

            {/* Type Selector */}
            <Text style={styles.fieldLabel}>Request Type</Text>
            <View style={styles.typeSelectorRow}>
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.typeOption,
                  requestType === 'LATE_ARRIVAL' && styles.typeOptionActive,
                  requestType === 'LATE_ARRIVAL' && { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)' },
                ]}
                onPress={() => setRequestType('LATE_ARRIVAL')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    requestType === 'LATE_ARRIVAL' && { color: '#f59e0b', fontWeight: '700' },
                  ]}
                >
                  ⏰ Late Arrival
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={[
                  styles.typeOption,
                  requestType === 'EARLY_SHIFT_END' && styles.typeOptionActive,
                  requestType === 'EARLY_SHIFT_END' && { borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.12)' },
                ]}
                onPress={() => setRequestType('EARLY_SHIFT_END')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    requestType === 'EARLY_SHIFT_END' && { color: '#c084fc', fontWeight: '700' },
                  ]}
                >
                  🚪 Early Shift End
                </Text>
              </Pressable>
            </View>

            {/* Date Input */}
            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.textInput}
              value={dateStr}
              onChangeText={(text) => {
                setDateStr(text);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={mode}
              maxLength={10}
            />

            {/* Time / Duration Detail (Optional) */}
            <Text style={styles.fieldLabel}>
              {requestType === 'LATE_ARRIVAL'
                ? 'Expected Arrival Time (Optional, e.g. 10:30 AM)'
                : 'Expected End Time or Hours (Optional, e.g. 4:00 PM or 6.5h)'}
            </Text>
            <TextInput
              style={styles.textInput}
              value={timeDetail}
              onChangeText={(text) => {
                setTimeDetail(text);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder={requestType === 'LATE_ARRIVAL' ? 'e.g. 10:45 AM' : 'e.g. 04:30 PM'}
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={mode}
              maxLength={40}
            />

            {/* Reason */}
            <Text style={styles.fieldLabel}>Reason (Required, min 10 chars)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder={
                requestType === 'LATE_ARRIVAL'
                  ? 'Explain why you are delayed (traffic, vehicle issue, emergency)...'
                  : 'Explain why you need to end your shift early...'
              }
              placeholderTextColor={colors.placeholder}
              keyboardAppearance={mode}
              multiline
              numberOfLines={4}
              maxLength={2000}
            />

            {/* Error Message */}
            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            {/* Buttons */}
            <View style={styles.buttonsRow}>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                style={[
                  styles.button,
                  { backgroundColor: colors.accent },
                  submitting && { opacity: 0.6 },
                ]}
                onPress={handleSubmit}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Request</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (c: AppColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    dialogCard: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '90%',
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
    },
    scrollContent: {
      paddingBottom: 8,
    },
    dialogTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
      marginBottom: 6,
    },
    dialogSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: c.muted,
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.muted,
      marginBottom: 6,
      marginTop: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    typeSelectorRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 6,
    },
    typeOption: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    typeOptionActive: {
      borderWidth: 1.5,
    },
    typeOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
    },
    textInput: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.background,
    },
    textArea: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    errorText: {
      marginTop: 12,
      fontSize: 13,
      color: c.danger,
      fontWeight: '500',
    },
    buttonsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: 'transparent',
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.muted,
    },
    submitButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
