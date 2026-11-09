import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '@/context/AppThemeContext';
import {
  type ProjectWorkEntryForm,
  type ProjectWorkReportStatus,
  PROJECT_WORK_STATUSES,
  convertHoursMinutesToTotalMinutes,
  formatMinutesToDuration,
} from '@/services/projects';
import { DateField, FormInput } from './shared';

export interface AccessibleProjectOption {
  id: number;
  title: string;
  status?: string;
  due_date?: string | null;
}

export interface ProjectWorkEntryCardProps {
  entry: ProjectWorkEntryForm;
  index: number;
  totalEntries: number;
  accessibleProjects: AccessibleProjectOption[];
  onUpdate: <K extends keyof ProjectWorkEntryForm>(field: K, value: ProjectWorkEntryForm[K]) => void;
  onRemove: () => void;
  onSelectProject: (projectId: number, projectName: string) => void;
  onOpenDatePicker: () => void;
  disabled?: boolean;
}

export function ProjectWorkEntryCard({
  entry,
  index,
  totalEntries,
  accessibleProjects,
  onUpdate,
  onRemove,
  onSelectProject,
  onOpenDatePicker,
  disabled = false,
}: ProjectWorkEntryCardProps) {
  const { colors, mode } = useAppTheme();
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const totalMinutes = convertHoursMinutesToTotalMinutes(entry.hours, entry.minutes);
  const isOverLimit = totalMinutes > 1440;
  const isCompleted = entry.status === 'Completed';

  const handleHoursChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    onUpdate('hours', cleaned);
  };

  const handleMinutesChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    onUpdate('minutes', cleaned);
  };

  const handleProjectSelect = (proj: AccessibleProjectOption) => {
    onSelectProject(proj.id, proj.title);
    setProjectPickerOpen(false);
  };

  const handleStatusSelect = (status: ProjectWorkReportStatus) => {
    onUpdate('status', status);
    if (status === 'Completed') {
      onUpdate('expectedCompletionDate', '');
    }
  };

  const [pickingPhoto, setPickingPhoto] = useState(false);

  const handlePickPhoto = async () => {
    if (disabled || pickingPhoto) return;
    setPickingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.4,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Photo Error', 'Could not read image data. Please choose another image.');
        return;
      }
      if (asset.base64.length > 1_500_000) {
        Alert.alert('File Too Large', 'Please choose a smaller photo (under 1 MB).');
        return;
      }
      const fileName = asset.fileName || `project_${index + 1}_photo.jpg`;
      onUpdate('photo', `data:image/jpeg;base64,${asset.base64}`);
      onUpdate('photoName', fileName);
    } catch (e) {
      Alert.alert('Photo Error', e instanceof Error ? e.message : 'Failed to pick photo.');
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    onUpdate('photo', null);
    onUpdate('photoName', null);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* ---------------- CARD HEADER ---------------- */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.badgeCircle, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{index + 1}</Text>
          </View>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Project {index + 1}
            </Text>
            <Text
              style={[styles.uuidText, { color: colors.muted }]}
              accessibilityLabel={`Client Entry ID ${entry.clientId}`}
            >
              ID: {entry.clientId.slice(0, 8)}...
            </Text>
          </View>
        </View>

        {totalEntries > 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove project ${index + 1}`}
            disabled={disabled}
            onPress={onRemove}
            style={[styles.removeBtn, { backgroundColor: colors.dangerSoft }]}
          >
            <Text style={[styles.removeBtnText, { color: colors.danger }]}>✕ Remove</Text>
          </Pressable>
        )}
      </View>

      {/* ---------------- 1. PROJECT SELECTION ---------------- */}
      <View style={styles.fieldSection}>
        <View style={styles.projectSelectHeader}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Project Name *</Text>
          {accessibleProjects.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose from assigned projects"
              disabled={disabled}
              onPress={() => setProjectPickerOpen(true)}
              style={[styles.pickerBtn, { backgroundColor: colors.accentSoft }]}
            >
              <Text style={[styles.pickerBtnText, { color: colors.primary }]}>
                {entry.projectId ? 'Change Project ▾' : 'Select Project ▾'}
              </Text>
            </Pressable>
          )}
        </View>

        <FormInput
          label=""
          value={entry.projectName}
          onChangeText={(val) => {
            onUpdate('projectName', val);
            // If user types manually, clear projectId unless it matches
            const matching = accessibleProjects.find(
              (p) => p.title.trim().toLowerCase() === val.trim().toLowerCase(),
            );
            onUpdate('projectId', matching ? matching.id : null);
          }}
          placeholder="e.g. CRM Mobile Dialer, Video Reels Batch"
        />

        {entry.projectId && (
          <View style={[styles.linkedBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.linkedBadgeText, { color: colors.primary }]}>
              Linked to Project #{entry.projectId}
            </Text>
          </View>
        )}
      </View>

      {/* ---------------- 2. WORK DURATION (HOURS & MINUTES) ---------------- */}
      <View style={styles.fieldSection}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Work Duration *</Text>
        <View style={styles.durationRow}>
          <View style={styles.durationInputGroup}>
            <Text style={[styles.inputSubLabel, { color: colors.muted }]}>Hours</Text>
            <TextInput
              accessibilityLabel={`Project ${index + 1} duration hours`}
              value={entry.hours}
              onChangeText={handleHoursChange}
              placeholder="0"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              maxLength={2}
              editable={!disabled}
              keyboardAppearance={mode}
              style={[
                styles.durationInput,
                {
                  backgroundColor: colors.background,
                  borderColor: isOverLimit ? colors.danger : colors.border,
                  color: colors.text,
                },
              ]}
            />
          </View>

          <Text style={[styles.durationColon, { color: colors.muted }]}>:</Text>

          <View style={styles.durationInputGroup}>
            <Text style={[styles.inputSubLabel, { color: colors.muted }]}>Minutes</Text>
            <TextInput
              accessibilityLabel={`Project ${index + 1} duration minutes`}
              value={entry.minutes}
              onChangeText={handleMinutesChange}
              placeholder="0"
              placeholderTextColor={colors.placeholder}
              keyboardType="numeric"
              maxLength={2}
              editable={!disabled}
              keyboardAppearance={mode}
              style={[
                styles.durationInput,
                {
                  backgroundColor: colors.background,
                  borderColor: isOverLimit ? colors.danger : colors.border,
                  color: colors.text,
                },
              ]}
            />
          </View>

          {/* Quick presets for common times */}
          <View style={styles.presetsRow}>
            {['30m', '1h', '2h', '4h'].map((preset) => (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityLabel={`Set ${preset}`}
                disabled={disabled}
                onPress={() => {
                  if (preset === '30m') {
                    onUpdate('hours', '0');
                    onUpdate('minutes', '30');
                  } else if (preset === '1h') {
                    onUpdate('hours', '1');
                    onUpdate('minutes', '0');
                  } else if (preset === '2h') {
                    onUpdate('hours', '2');
                    onUpdate('minutes', '0');
                  } else if (preset === '4h') {
                    onUpdate('hours', '4');
                    onUpdate('minutes', '0');
                  }
                }}
                style={[
                  styles.presetChip,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.presetChipText, { color: colors.muted }]}>{preset}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Calculated duration display */}
        <View
          style={[
            styles.durationCalcBox,
            {
              backgroundColor: isOverLimit
                ? colors.dangerSoft
                : totalMinutes > 0
                ? colors.accentSoft
                : colors.surfaceMuted,
              borderColor: isOverLimit
                ? colors.danger
                : totalMinutes > 0
                ? colors.primary
                : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.durationCalcText,
              {
                color: isOverLimit
                  ? colors.danger
                  : totalMinutes > 0
                  ? colors.primary
                  : colors.muted,
              },
            ]}
          >
            {isOverLimit
              ? `⚠️ Exceeds 24 hour limit (${totalMinutes} mins)`
              : totalMinutes > 0
              ? `⏱ Total: ${formatMinutesToDuration(totalMinutes)} (${totalMinutes} mins)`
              : '⏱ Enter time spent today'}
          </Text>
        </View>
      </View>

      {/* ---------------- 3. PROJECT STATUS ---------------- */}
      <View style={styles.fieldSection}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Project Status *</Text>
        <View style={styles.statusRow}>
          {PROJECT_WORK_STATUSES.map((status) => {
            const isSelected = entry.status === status;
            return (
              <Pressable
                key={status}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                disabled={disabled}
                onPress={() => handleStatusSelect(status)}
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surfaceMuted,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    {
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? colors.onPrimary : colors.text,
                    },
                  ]}
                >
                  {status}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ---------------- 4. EXPECTED COMPLETION DATE ---------------- */}
      {!isCompleted && (
        <View style={styles.fieldSection}>
          <DateField
            label="Expected Completion Date *"
            value={
              entry.expectedCompletionDate
                ? new Date(`${entry.expectedCompletionDate}T12:00:00`)
                : null
            }
            onPress={onOpenDatePicker}
          />
        </View>
      )}

      {/* ---------------- 5. WORK NOTES / DESCRIPTION ---------------- */}
      <View style={styles.fieldSection}>
        <FormInput
          label="Work Note / Description"
          value={entry.notes}
          onChangeText={(val) => onUpdate('notes', val)}
          multiline
          withVoice
          placeholder="Describe work completed in this session (tap mic to speak)..."
        />
      </View>

      {/* ---------------- 6. OPTIONAL REFERENCE LINK ---------------- */}
      <View style={styles.fieldSection}>
        <FormInput
          label="Reference Link (optional)"
          value={entry.referenceLink}
          onChangeText={(val) => onUpdate('referenceLink', val)}
          placeholder="https://github.com/... or Figma link"
        />
      </View>

      {/* ---------------- 7. OPTIONAL WORK PHOTO ---------------- */}
      <View style={styles.fieldSection}>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>Work Photo (optional)</Text>
        {entry.photo ? (
          <View
            style={[
              styles.photoPreviewCard,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <Image source={{ uri: entry.photo }} style={styles.photoThumbnail} resizeMode="cover" />
            <View style={styles.photoInfoCol}>
              <Text
                style={[styles.photoFileName, { color: colors.text }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {entry.photoName || `Project ${index + 1} Photo`}
              </Text>
              <Text style={[styles.photoSubLabel, { color: colors.muted }]}>
                Attached to Project {index + 1}
              </Text>
              <View style={styles.photoActionsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Replace photo for project ${index + 1}`}
                  disabled={disabled || pickingPhoto}
                  onPress={handlePickPhoto}
                  style={[styles.photoActionBtn, { backgroundColor: colors.accentSoft }]}
                >
                  <Text style={[styles.photoActionText, { color: colors.primary }]}>
                    {pickingPhoto ? 'Opening…' : 'Replace'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo for project ${index + 1}`}
                  disabled={disabled}
                  onPress={handleRemovePhoto}
                  style={[styles.photoActionBtn, { backgroundColor: colors.dangerSoft }]}
                >
                  <Text style={[styles.photoActionText, { color: colors.danger }]}>
                    Remove
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add photo for project ${index + 1}`}
            disabled={disabled || pickingPhoto}
            onPress={handlePickPhoto}
            style={[
              styles.addPhotoBtn,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
              disabled && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.addPhotoIcon, { color: colors.primary }]}>📷</Text>
            <Text style={[styles.addPhotoText, { color: colors.text }]}>
              {pickingPhoto ? 'Opening gallery…' : 'Add Photo / Screenshot'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* ---------------- PROJECT PICKER MODAL ---------------- */}
      <Modal
        visible={projectPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setProjectPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Select an Accessible Project
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close project picker"
                onPress={() => setProjectPickerOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={[styles.modalCloseText, { color: colors.muted }]}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} contentContainerStyle={{ gap: 8 }}>
              {accessibleProjects.map((p) => {
                const isSelected = entry.projectId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => handleProjectSelect(p)}
                    style={[
                      styles.projectOption,
                      {
                        backgroundColor: isSelected ? colors.accentSoft : colors.surfaceMuted,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={[
                          styles.projectOptionTitle,
                          {
                            color: colors.text,
                            fontWeight: isSelected ? '700' : '600',
                          },
                        ]}
                    >
                        {p.title}
                      </Text>
                      <View style={styles.projectOptionMeta}>
                        {p.status && (
                          <Text style={[styles.projectOptionStatus, { color: colors.primary }]}>
                            {p.status.replaceAll('_', ' ')}
                          </Text>
                        )}
                        {p.due_date && (
                          <Text style={[styles.projectOptionDue, { color: colors.muted }]}>
                            Due: {p.due_date}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setProjectPickerOpen(false)}
                style={[styles.modalDismissBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.modalDismissText, { color: colors.onPrimary }]}>
                  Done
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badgeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  uuidText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  removeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  fieldSection: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  projectSelectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pickerBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  linkedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  linkedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationInputGroup: {
    width: 65,
    gap: 4,
  },
  inputSubLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  durationInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  durationColon: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
    marginLeft: 4,
    marginTop: 16,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  durationCalcBox: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  durationCalcText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 12,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '75%',
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalList: {
    maxHeight: 340,
  },
  projectOption: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectOptionTitle: {
    fontSize: 14,
  },
  projectOptionMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  projectOptionStatus: {
    fontSize: 11,
    fontWeight: '600',
  },
  projectOptionDue: {
    fontSize: 11,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 8,
  },
  modalFooter: {
    marginTop: 8,
  },
  modalDismissBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDismissText: {
    fontSize: 15,
    fontWeight: '700',
  },
  photoPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  photoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  photoInfoCol: {
    flex: 1,
    gap: 4,
  },
  photoFileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  photoSubLabel: {
    fontSize: 11,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  photoActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  photoActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addPhotoIcon: {
    fontSize: 18,
  },
  addPhotoText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
