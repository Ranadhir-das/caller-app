import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { useEmployeeWorkspace, ProjectReportItem } from '@/context/EmployeeWorkspaceContext';
import { API_BASE_URL, ApiError } from '@/services/api';
import { ActionButton, FormInput, makeStyles } from '@/components/employee/shared';
import { KeyboardAwareContainer } from '@/components/KeyboardAwareContainer';
import {
  type ProjectWorkEntryForm,
  type Project,
  getProjects,
  createEmptyProjectWorkEntry,
  validateAllProjectWorkEntries,
  buildProjectReportPayloadItem,
  getEntryDurationInfo,
} from '@/services/projects';
import { ProjectWorkEntryCard } from '@/components/employee/ProjectWorkEntryCard';
import { DailyProjectSummaryCard } from '@/components/employee/DailyProjectSummaryCard';

function ReportPhoto({ id, size }: { id: number; size: number }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const source = { uri: `${API_BASE_URL}/mobile/employee/reports/${id}/photo/`, headers: { Authorization: `Token ${token}` } };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="View uploaded photo" onPress={() => setOpen(true)}>
        <Image source={source} style={{ width: size, height: size, borderRadius: 10 }} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={photoStyles.backdrop} onPress={() => setOpen(false)}>
          <Image source={source} style={photoStyles.full} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

export default function MyWorkScreen() {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { token, user } = useAuth();
  const { data, refreshing, busy, load, request } = useEmployeeWorkspace();

  const userRole = (user?.role || data?.role || '').toUpperCase();
  const isProjectWorker = userRole === 'IT' || userRole === 'VIDEO_EDITOR';

  // Submission lock to avoid double taps
  const [submitting, setSubmitting] = useState(false);
  const isActionBusy = busy || submitting;

  // Accessible projects list for selection (fetched from backend)
  const [accessibleProjects, setAccessibleProjects] = useState<Project[]>([]);

  useEffect(() => {
    let ignore = false;
    if (token) {
      getProjects(token)
        .then((res) => {
          if (!ignore && res?.projects) {
            setAccessibleProjects(res.projects);
          }
        })
        .catch(() => {
          // Fallback relies on combinedProjects below
        });
    }
    return () => {
      ignore = true;
    };
  }, [token]);

  const refreshAccessibleProjects = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getProjects(token);
      if (res?.projects) {
        setAccessibleProjects(res.projects);
      }
    } catch {
      // Fallback relies on combinedProjects below
    }
  }, [token]);

  const combinedProjects = useMemo(() => {
    if (accessibleProjects.length > 0) return accessibleProjects;
    return (data?.projects || []).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status as Project['status'],
      status_display: p.status,
      priority: 'MEDIUM' as const,
      priority_display: 'Medium',
      due_date: p.due_date,
      description: p.description,
      self_created: false,
      created_at: '',
      can_request_completion: false,
      is_overdue: false,
      review_comments: '',
      completion_requested_at: null,
    }));
  }, [accessibleProjects, data?.projects]);

  // Check if today's daily report has already been submitted in the workspace snapshot
  const todaySubmittedReport = useMemo(() => {
    if (!data?.reports?.length || !data?.date) return null;
    return data.reports.find((r) => r.date === data.date) || null;
  }, [data]);

  // Legacy single daily report state (for non-IT/Video Editor roles)
  const [notes, setNotes] = useState('');

  // Project-wise state (for IT & Video Editor roles)
  // Initialized with a single entry containing an RFC4122 v4 UUID
  const [projectEntries, setProjectEntries] = useState<ProjectWorkEntryForm[]>([
    createEmptyProjectWorkEntry(),
  ]);
  const [activeDatePickerIndex, setActiveDatePickerIndex] = useState<number | null>(null);

  // Common links and photo
  const [links, setLinks] = useState<string[]>(['']);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  // Update a single field on a project work entry card
  const updateProjectEntry = <K extends keyof ProjectWorkEntryForm>(
    index: number,
    field: K,
    value: ProjectWorkEntryForm[K],
  ) => {
    setProjectEntries((curr) =>
      curr.map((p, i) =>
        i !== index
          ? p
          : {
              ...p,
              [field]: value,
              ...(field === 'status' && value === 'Completed' ? { expectedCompletionDate: '' } : {}),
            },
      ),
    );
    if (field === 'status' && value === 'Completed') {
      setActiveDatePickerIndex(null);
    }
  };

  // Select project from picker modal
  const handleSelectProject = (index: number, projectId: number, projectName: string) => {
    setProjectEntries((curr) =>
      curr.map((p, i) =>
        i !== index
          ? p
          : {
              ...p,
              projectId,
              projectName,
            },
      ),
    );
  };

  // Add another project work entry card (generates a fresh unique UUID)
  const addProjectEntry = () => {
    setProjectEntries((curr) => [...curr, createEmptyProjectWorkEntry()]);
  };

  // Remove a project work entry card (only allowed if >1 cards)
  const removeProjectEntry = (index: number) => {
    if (projectEntries.length <= 1) return;
    setActiveDatePickerIndex(null);
    setProjectEntries((curr) => curr.filter((_, i) => i !== index));
  };

  // Expected completion date picker handler
  const handleProjectDateChange = (event: { type: string }, selectedDate?: Date) => {
    const index = activeDatePickerIndex;
    setActiveDatePickerIndex(null);
    if (event.type !== 'set' || !selectedDate || index === null) return;
    const iso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    updateProjectEntry(index, 'expectedCompletionDate', iso);
  };

  const pickPhoto = async () => {
    if (pickingPhoto) return;
    setPickingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.4,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read this photo. Please choose another image.');
      if (asset.base64.length > 1_500_000) throw new Error('Please choose a smaller photo (under 1 MB).');
      setPhoto(`data:image/jpeg;base64,${asset.base64}`);
    } catch (e) {
      Alert.alert('Photo could not be added', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleSaveReport = async () => {
    if (isActionBusy) return;

    if (isProjectWorker) {
      // 1. Validate all project cards
      const validation = validateAllProjectWorkEntries(projectEntries);
      if (!validation.valid) {
        Alert.alert('Required Information Missing', validation.error);
        return;
      }

      // 2. Build payload with canonical fields & persistent client UUIDs
      const payload = {
        date: data?.date || new Date().toISOString().slice(0, 10),
        project_reports: projectEntries.map(buildProjectReportPayloadItem),
      };

      setSubmitting(true);
      try {
        await request('reports/', payload);
        await Promise.all([load(), refreshAccessibleProjects()]);

        // On success: reset form to 1 blank card with a fresh UUID
        setProjectEntries([createEmptyProjectWorkEntry()]);
        Alert.alert('Saved', 'Your project-wise work report has been saved.');
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // HTTP 409 Idempotency conflict: explain clearly, PRESERVE form data and UUIDs
          Alert.alert(
            'Idempotency Conflict',
            err.message ||
              'A work entry with this ID was already submitted with different details. Please review your entries.',
          );
        } else {
          Alert.alert(
            'Unable to Save Report',
            err instanceof Error ? err.message : 'Please check your connection and try again.',
          );
        }
        // NOTE: Form state, inputs, and client UUIDs are strictly preserved for retry
      } finally {
        setSubmitting(false);
      }
    } else {
      // Legacy daily report for other roles (CALLER, COUNSELOR, ACCOUNTANT, etc.)
      if (!notes.trim()) {
        Alert.alert('Work Notes Required', 'Please enter your work completed today.');
        return;
      }

      setSubmitting(true);
      try {
        await request('reports/', {
          date: data?.date || new Date().toISOString().slice(0, 10),
          notes: notes.trim(),
          work_links: links.map((link) => link.trim()).filter(Boolean),
          ...(photo ? { photo: photo.split(',')[1] } : {}),
        });
        await load();
        setNotes('');
        setLinks(['']);
        setPhoto(null);
        Alert.alert('Saved', 'Your daily report has been saved.');
      } catch (err) {
        Alert.alert(
          'Unable to Save Report',
          err instanceof Error ? err.message : 'Please check your connection and try again.',
        );
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleRefresh = async () => {
    await Promise.all([load(), refreshAccessibleProjects()]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareContainer
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
      >
        {/* ================= TOP HEADER WITH MANAGE PROJECTS QUICK LINK ================= */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text style={styles.title}>My work</Text>
          {isProjectWorker && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage Projects"
              onPress={() => router.push('/projects' as never)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.accentSoft,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                Manage Projects ›
              </Text>
            </Pressable>
          )}
        </View>

        {isProjectWorker ? (
          /* ================= IT & VIDEO EDITOR: PROJECT-WISE REPORT ================= */
          <View style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={styles.heading}>Project work report</Text>
              <Text style={styles.subtitle}>{data?.date}</Text>
              <Text style={[styles.subtitle, { color: colors.primary, fontWeight: '600' }]}>
                {userRole === 'IT' ? 'IT Department' : 'Video Production'}
              </Text>
            </View>

            {/* TODAY'S ALREADY SUBMITTED REPORT SUMMARY (if submitted earlier today) */}
            {todaySubmittedReport &&
              todaySubmittedReport.project_reports &&
              todaySubmittedReport.project_reports.length > 0 && (
                <View style={{ gap: 6 }}>
                  <DailyProjectSummaryCard
                    title="Today's Submitted Report"
                    date={todaySubmittedReport.date}
                    isSubmitted
                    entries={todaySubmittedReport.project_reports}
                  />
                </View>
              )}

            {/* 1. Project Work Entry Cards */}
            {projectEntries.map((project, index) => (
              <ProjectWorkEntryCard
                key={project.clientId}
                entry={project}
                index={index}
                totalEntries={projectEntries.length}
                accessibleProjects={combinedProjects}
                onUpdate={(field, value) => updateProjectEntry(index, field, value)}
                onRemove={() => removeProjectEntry(index)}
                onSelectProject={(projId, projName) =>
                  handleSelectProject(index, projId, projName)
                }
                onOpenDatePicker={() => setActiveDatePickerIndex(index)}
                disabled={isActionBusy}
              />
            ))}

            {/* 2. + Add Another Project Entry Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add another project work entry"
              disabled={isActionBusy}
              onPress={addProjectEntry}
              style={[
                projectStyles.addProjectBtn,
                { borderColor: colors.primary, backgroundColor: colors.accentSoft },
                isActionBusy && { opacity: 0.6 },
              ]}
            >
              <Text style={[projectStyles.addProjectText, { color: colors.primary }]}>
                + Add Another Project
              </Text>
            </Pressable>

            {/* 3. Daily Summary (Draft Aggregated Durations & Work) */}
            <DailyProjectSummaryCard
              title="Daily Summary"
              isDraft
              entries={projectEntries}
            />

            {/* 4. Full-width Submit Work Report button */}
            <View style={{ marginTop: 6, marginBottom: 16 }}>
              <ActionButton
                title={submitting ? 'Submitting report...' : 'Submit Work Report'}
                busy={isActionBusy}
                onPress={handleSaveReport}
              />
            </View>
          </View>
        ) : (
          /* ================= LEGACY DAILY REPORT FOR OTHER ROLES ================= */
          <View style={styles.card}>
            <Text style={styles.heading}>Daily work report - {data?.date}</Text>
            <FormInput
              label="Work completed"
              value={notes}
              onChangeText={setNotes}
              multiline
              withVoice
              placeholder="Describe work completed today (tap mic to speak)..."
            />
            {links.map((link, index) => (
              <View key={index} style={{ gap: 6 }}>
                <FormInput
                  label={`Work Link ${index + 1} (optional)`}
                  value={link}
                  onChangeText={(value) =>
                    setLinks((current) => current.map((item, i) => (i === index ? value : item)))
                  }
                />
                {links.length > 1 && (
                  <ActionButton
                    title={`Remove Link ${index + 1}`}
                    busy={isActionBusy}
                    onPress={() => setLinks((current) => current.filter((_, i) => i !== index))}
                  />
                )}
              </View>
            ))}
            {links.length < 30 && (
              <ActionButton
                title="+ Add Another Link"
                busy={isActionBusy}
                onPress={() => setLinks((current) => [...current, ''])}
              />
            )}
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Work photo (optional)</Text>
              {photo ? (
                <View style={photoStyles.previewRow}>
                  <Image source={{ uri: photo }} style={photoStyles.preview} />
                  <ActionButton
                    title="Remove photo"
                    busy={pickingPhoto || isActionBusy}
                    onPress={() => setPhoto(null)}
                  />
                </View>
              ) : (
                <ActionButton
                  title={pickingPhoto ? 'Opening…' : 'Add photo'}
                  busy={pickingPhoto || isActionBusy}
                  onPress={pickPhoto}
                />
              )}
            </View>
            <ActionButton
              title={submitting ? 'Submitting report...' : "Save today's report"}
              busy={isActionBusy}
              onPress={handleSaveReport}
            />
          </View>
        )}

        {/* Date picker modal for project expected completion date */}
        {activeDatePickerIndex !== null && (
          <DateTimePicker
            themeVariant={mode}
            value={
              projectEntries[activeDatePickerIndex]?.expectedCompletionDate
                ? new Date(
                    `${projectEntries[activeDatePickerIndex].expectedCompletionDate}T12:00:00`,
                  )
                : new Date()
            }
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            onChange={handleProjectDateChange}
          />
        )}

        {/* ================= HISTORICAL WORK REPORTS (WORKSPACE SNAPSHOT UP TO 30 RECENT) ================= */}
        <View style={{ marginTop: 16, gap: 4 }}>
          <Text style={styles.heading}>Previous reports</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Showing up to 30 most recent daily work reports available in your workspace snapshot.
          </Text>
        </View>

        {data?.reports && data.reports.length > 0 ? (
          data.reports.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={photoStyles.reportRow}>
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={styles.label}>{r.date}</Text>

                  {r.project_reports && r.project_reports.length > 0 ? (
                    <View style={{ gap: 10 }}>
                      {/* Authoritative Daily Summary Card for this report */}
                      <DailyProjectSummaryCard
                        title="Daily Summary"
                        date={r.date}
                        isSubmitted
                        entries={r.project_reports}
                      />

                      {/* Individual Project Entries Breakdown */}
                      {r.project_reports.map((p: ProjectReportItem, pIdx: number) => {
                        const durInfo = getEntryDurationInfo(p);
                        const statusColor =
                          p.status === 'Completed'
                            ? mode === 'dark'
                              ? colors.success
                              : '#047857'
                            : p.status === 'In Progress'
                            ? colors.primary
                            : colors.warning;
                        const statusBackground =
                          p.status === 'Completed'
                            ? colors.successSoft
                            : p.status === 'In Progress'
                            ? colors.accentSoft
                            : colors.warningSoft;

                        const isLinked = p.project_id !== undefined && p.project_id !== null;

                        return (
                          <View
                            key={pIdx}
                            style={{
                              backgroundColor: colors.surfaceMuted,
                              borderRadius: 12,
                              padding: 12,
                              gap: 6,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: 8,
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <Text
                                style={[
                                  styles.label,
                                  {
                                    fontWeight: '700',
                                    flexGrow: 1,
                                    flexShrink: 1,
                                    flexBasis: 120,
                                  },
                                ]}
                              >
                                {p.project_name}
                              </Text>

                              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                {/* Relationally Linked vs Unlinked Badge */}
                                {isLinked ? (
                                  <View
                                    style={{
                                      paddingHorizontal: 7,
                                      paddingVertical: 2,
                                      borderRadius: 6,
                                      backgroundColor: colors.accentSoft,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: '700',
                                        color: colors.primary,
                                      }}
                                    >
                                      🔗 Linked #{p.project_id}
                                    </Text>
                                  </View>
                                ) : (
                                  <View
                                    style={{
                                      paddingHorizontal: 7,
                                      paddingVertical: 2,
                                      borderRadius: 6,
                                      backgroundColor: colors.surface,
                                      borderWidth: 1,
                                      borderColor: colors.border,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        fontWeight: '600',
                                        color: colors.muted,
                                      }}
                                    >
                                      📄 Unlinked
                                    </Text>
                                  </View>
                                )}

                                {/* Status Chip */}
                                <View
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                    backgroundColor: statusBackground,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>
                                    {p.status}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {/* Duration Information */}
                            {durInfo.isIncomplete ? (
                              <Text style={[styles.subtitle, { color: colors.warning, fontWeight: '600' }]}>
                                ⚠️ Duration not recorded
                                {p.expected_completion_date ? ` | Due: ${p.expected_completion_date}` : ''}
                              </Text>
                            ) : (
                              <Text style={styles.subtitle}>
                                Duration: {durInfo.formatted}
                                {p.expected_completion_date ? ` | Due: ${p.expected_completion_date}` : ''}
                              </Text>
                            )}

                            {!!p.notes && (
                              <Text style={[styles.subtitle, { color: colors.text, marginTop: 2 }]}>
                                {p.notes}
                              </Text>
                            )}

                            {!!p.reference_link && (
                              <Pressable
                                accessibilityRole="link"
                                onPress={() => {
                                  if (/^https?:\/\//i.test(p.reference_link!)) {
                                    void Linking.openURL(p.reference_link!).catch(() =>
                                      Alert.alert('Could not open link', p.reference_link!),
                                    );
                                  }
                                }}
                              >
                                <Text selectable style={[styles.subtitle, { color: colors.primary }]}>
                                  {`🔗 Reference: ${p.reference_link}`}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.subtitle}>{r.notes}</Text>
                  )}

                  {(r.work_links?.length ? r.work_links : r.work_link ? [r.work_link] : []).map(
                    (link, index) => (
                      <Pressable
                        key={`${index}-${link}`}
                        accessibilityRole="link"
                        onPress={() => {
                          if (/^https?:\/\//i.test(link))
                            void Linking.openURL(link).catch(() =>
                              Alert.alert('Could not open link', link),
                            );
                        }}
                      >
                        <Text selectable style={[styles.subtitle, { color: colors.primary }]}>
                          {`Work Link ${index + 1}: ${link}`}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
                {r.has_photo && <ReportPhoto id={r.id} size={56} />}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.card}>
            <Text style={styles.subtitle}>No recent work reports available in this workspace snapshot.</Text>
          </View>
        )}
      </KeyboardAwareContainer>
    </SafeAreaView>
  );
}

const photoStyles = StyleSheet.create({
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 64, height: 64, borderRadius: 10 },
  reportRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
});

const projectStyles = StyleSheet.create({
  addProjectBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addProjectText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
