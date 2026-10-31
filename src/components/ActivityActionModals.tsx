import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useAppTheme, useAppStyles, type AppColors } from '@/context/AppThemeContext';
import { type ActivityCategory, type BreakReasonConfig } from '@/services/activity';
import { formatDuration } from '@/context/ActivityContext';

// ==========================================
// 1. PAUSE MODAL
// ==========================================
export function PauseModal({
  visible,
  onClose,
  onConfirm,
  breakReasons,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (breakReasonId: number, note?: string) => Promise<void>;
  breakReasons: BreakReasonConfig[];
  busy: boolean;
}) {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createModalStyles);

  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState('');

  // Auto-select first reason on open
  useEffect(() => {
    if (visible && breakReasons.length > 0 && selectedReasonId === null) {
      setSelectedReasonId(breakReasons[0].id);
    }
    if (!visible) {
      setNote('');
      setValidationError('');
    }
  }, [visible, breakReasons, selectedReasonId]);

  const selectedReason = breakReasons.find((r) => r.id === selectedReasonId);

  const handleSubmit = async () => {
    if (!selectedReasonId) {
      setValidationError('Please select a break reason.');
      return;
    }
    if (selectedReason?.requires_note && !note.trim()) {
      setValidationError('A note is mandatory for this break reason.');
      return;
    }
    setValidationError('');
    try {
      await onConfirm(selectedReasonId, note);
      onClose();
    } catch (e: unknown) {
      setValidationError(e instanceof Error ? e.message : 'Could not pause session.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Take a Break</Text>
          <Text style={styles.dialogSubtitle}>
            Select your break reason. Work tracking pauses while on break.
          </Text>

          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8, paddingVertical: 4 }}>
              {breakReasons.map((reason) => {
                const isSelected = reason.id === selectedReasonId;
                return (
                  <Pressable
                    key={reason.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.selectableRow,
                      isSelected && {
                        borderColor: colors.accent,
                        backgroundColor: colors.accentSoft,
                      },
                    ]}
                    onPress={() => {
                      setSelectedReasonId(reason.id);
                      setValidationError('');
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionTitle,
                          isSelected && { color: colors.accent, fontWeight: '700' },
                        ]}
                      >
                        {reason.name}
                      </Text>
                      <Text style={styles.optionSubtitle}>
                        Expected limit: {reason.warning_threshold_minutes} min
                        {reason.requires_note ? ' • Note required' : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && { borderColor: colors.accent },
                      ]}
                    >
                      {isSelected && (
                        <View
                          style={[
                            styles.radioDot,
                            { backgroundColor: colors.accent },
                          ]}
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Note Input */}
          <View style={{ gap: 6, marginTop: 10 }}>
            <Text style={styles.inputLabel}>
              Break Note {selectedReason?.requires_note ? '(Required)' : '(Optional)'}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                selectedReason?.requires_note && !note.trim() && !!validationError
                  ? { borderColor: colors.danger }
                  : null,
              ]}
              placeholder={
                selectedReason?.requires_note
                  ? 'Enter reason note (mandatory)...'
                  : 'Add an optional remark...'
              }
              placeholderTextColor={colors.placeholder}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                if (validationError) setValidationError('');
              }}
              keyboardAppearance={mode}
              maxLength={250}
            />
          </View>

          {!!validationError && (
            <Text style={styles.errorText}>{validationError}</Text>
          )}

          {/* Buttons */}
          <View style={styles.buttonsRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={[styles.button, styles.confirmButton, busy && { opacity: 0.6 }]}
              onPress={handleSubmit}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Start Break</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// 2. SWITCH CATEGORY MODAL
// ==========================================
export function SwitchCategoryModal({
  visible,
  onClose,
  onConfirm,
  categories,
  currentCategoryId,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (categoryId: number, note?: string) => Promise<void>;
  categories: ActivityCategory[];
  currentCategoryId?: number;
  busy: boolean;
}) {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createModalStyles);

  const [selectedCatId, setSelectedCatId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (visible && categories.length > 0 && selectedCatId === null) {
      // Default to next category different from current
      const candidate = categories.find((c) => c.id !== currentCategoryId) || categories[0];
      setSelectedCatId(candidate.id);
    }
    if (!visible) {
      setNote('');
      setValidationError('');
    }
  }, [visible, categories, currentCategoryId, selectedCatId]);

  const handleSubmit = async () => {
    if (!selectedCatId) {
      setValidationError('Please select a category.');
      return;
    }
    if (selectedCatId === currentCategoryId) {
      setValidationError('Already on this category. Choose a different one.');
      return;
    }
    setValidationError('');
    try {
      await onConfirm(selectedCatId, note);
      onClose();
    } catch (e: unknown) {
      setValidationError(e instanceof Error ? e.message : 'Could not switch category.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Switch Activity</Text>
          <Text style={styles.dialogSubtitle}>
            Change what you are currently working on without taking a break.
          </Text>

          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8, paddingVertical: 4 }}>
              {categories.map((cat) => {
                const isSelected = cat.id === selectedCatId;
                const isCurrent = cat.id === currentCategoryId;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.selectableRow,
                      isSelected && {
                        borderColor: colors.accent,
                        backgroundColor: colors.accentSoft,
                      },
                    ]}
                    onPress={() => {
                      setSelectedCatId(cat.id);
                      setValidationError('');
                    }}
                  >
                    <View
                      style={[
                        styles.categoryIconPill,
                        { backgroundColor: (cat.color_hex || colors.accent) + '22' },
                      ]}
                    >
                      <View
                        style={[
                          styles.categoryColorDot,
                          { backgroundColor: cat.color_hex || colors.accent },
                        ]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.optionTitle,
                          isSelected && { color: colors.accent, fontWeight: '700' },
                        ]}
                      >
                        {cat.name}
                        {isCurrent ? ' (Current)' : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && { borderColor: colors.accent },
                      ]}
                    >
                      {isSelected && (
                        <View
                          style={[
                            styles.radioDot,
                            { backgroundColor: colors.accent },
                          ]}
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Optional Note */}
          <View style={{ gap: 6, marginTop: 10 }}>
            <Text style={styles.inputLabel}>Switch Remark (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Switched to follow-ups..."
              placeholderTextColor={colors.placeholder}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                if (validationError) setValidationError('');
              }}
              keyboardAppearance={mode}
              maxLength={250}
            />
          </View>

          {!!validationError && (
            <Text style={styles.errorText}>{validationError}</Text>
          )}

          {/* Buttons */}
          <View style={styles.buttonsRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={[styles.button, styles.confirmButton, busy && { opacity: 0.6 }]}
              onPress={handleSubmit}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Switch</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// 3. END SHIFT MODAL
// ==========================================
export function EndShiftModal({
  visible,
  onClose,
  onConfirm,
  elapsedNet,
  elapsedBreak,
  elapsedGross,
  busy,
  onRequestEarlyEnd,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => Promise<void>;
  elapsedNet: number;
  elapsedBreak: number;
  elapsedGross: number;
  busy: boolean;
  onRequestEarlyEnd?: () => void;
}) {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(createModalStyles);

  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!visible) {
      setNote('');
      setErrorMsg('');
    }
  }, [visible]);

  const handleConfirm = async () => {
    setErrorMsg('');
    try {
      await onConfirm(note);
      onClose();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not end shift.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.dialogCard}>
          <Text style={[styles.dialogTitle, { color: colors.danger }]}>
            End Today's Shift?
          </Text>
          <Text style={styles.dialogSubtitle}>
            This completes your active work session and locks your hours for today. You will remain logged in to the app.
          </Text>

          {/* Durations Summary Card */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Net Work Time</Text>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>
                {formatDuration(elapsedNet)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Break Time</Text>
              <Text style={styles.summaryValue}>{formatDuration(elapsedBreak)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Gross</Text>
              <Text style={styles.summaryValue}>{formatDuration(elapsedGross)}</Text>
            </View>
          </View>

          {/* Optional Note */}
          <View style={{ gap: 6, marginTop: 10 }}>
            <Text style={styles.inputLabel}>Shift Completion Note (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Completed scheduled call batch..."
              placeholderTextColor={colors.placeholder}
              value={note}
              onChangeText={(text) => {
                setNote(text);
                if (errorMsg) setErrorMsg('');
              }}
              keyboardAppearance={mode}
              maxLength={250}
            />
          </View>

          {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

          {/* Under 8 Hours Notice & Early Shift-End Request shortcut */}
          {(elapsedNet < 28800 || !!errorMsg) && (
            <View
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 1,
                borderColor: 'rgba(245, 158, 11, 0.3)',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 16,
                  color: colors.text,
                }}
              >
                ⚠️ Standard shifts require 8 hours of net work. If you need to leave early, submit an Early Shift-End Request for manager approval.
              </Text>
              <Pressable
                accessibilityRole="button"
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: '#a855f7',
                  alignSelf: 'flex-start',
                }}
                onPress={() => {
                  onClose();
                  if (onRequestEarlyEnd) {
                    onRequestEarlyEnd();
                  } else {
                    router.push('/employee/attendance');
                  }
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                  Request Early Shift-End Approval →
                </Text>
              </Pressable>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonsRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={[
                styles.button,
                { backgroundColor: colors.danger },
                busy && { opacity: 0.6 },
              ]}
              onPress={handleConfirm}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm & End Shift</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// STYLES
// ==========================================
const createModalStyles = (c: AppColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    dialogCard: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 8,
    },
    dialogTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
    dialogSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: c.muted,
    },
    selectableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
      gap: 10,
    },
    optionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    optionSubtitle: {
      fontSize: 12,
      color: c.muted,
      marginTop: 2,
    },
    categoryIconPill: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryColorDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    radioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    textInput: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      backgroundColor: c.background,
      fontSize: 14,
    },
    errorText: {
      color: c.danger,
      fontSize: 12,
      marginTop: 2,
    },
    buttonsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    cancelButton: {
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelButtonText: {
      color: c.text,
      fontWeight: '600',
      fontSize: 13,
    },
    confirmButton: {
      backgroundColor: c.primary,
    },
    confirmButtonText: {
      color: c.onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    summaryBox: {
      flexDirection: 'row',
      backgroundColor: c.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
    },
    summaryLabel: {
      fontSize: 11,
      color: c.muted,
      marginBottom: 4,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: '700',
      color: c.text,
    },
    summaryDivider: {
      width: 1,
      height: 28,
      backgroundColor: c.border,
    },
  });

