import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, Linking, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme, useAppStyles } from '@/context/AppThemeContext';
import { useEmployeeWorkspace, ProjectReportItem } from '@/context/EmployeeWorkspaceContext';
import { API_BASE_URL } from '@/services/api';
import { ActionButton, DateField, FormInput, makeStyles } from '@/components/employee/shared';
import { KeyboardAwareContainer } from '@/components/KeyboardAwareContainer';

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

type ProjectEntry = {
  project_name: string;
  duration: string;
  status: 'Completed' | 'In Progress' | 'Pending';
  expected_completion_date: string;
  notes: string;
};

const createEmptyProject = (): ProjectEntry => ({
  project_name: '',
  duration: '',
  status: 'In Progress',
  expected_completion_date: '',
  notes: '',
});

const PROJECT_STATUSES: ('Completed' | 'In Progress' | 'Pending')[] = [
  'Completed',
  'In Progress',
  'Pending',
];

export default function MyWorkScreen() {
  const { colors, mode } = useAppTheme();
  const styles = useAppStyles(makeStyles);
  const { user } = useAuth();
  const { data, refreshing, busy, load, run, request } = useEmployeeWorkspace();

  const userRole = (user?.role || data?.role || '').toUpperCase();
  const isProjectWorker = userRole === 'IT' || userRole === 'VIDEO_EDITOR';

  // Legacy single daily report state (for non-IT/Video Editor roles)
  const [notes, setNotes] = useState('');

  // Project-wise state (for IT & Video Editor roles)
  const [projects, setProjects] = useState<ProjectEntry[]>([createEmptyProject()]);
  const [activeDatePickerIndex, setActiveDatePickerIndex] = useState<number | null>(null);

  // Common links and photo
  const [links, setLinks] = useState<string[]>(['']);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const updateProject = <K extends keyof ProjectEntry>(index: number, field: K, value: ProjectEntry[K]) => {
    setProjects(curr => curr.map((p, i) => i !== index ? p : {
      ...p, [field]: value,
      ...(field === 'status' && value === 'Completed' ? { expected_completion_date: '' } : {}),
    }));
    if (field === 'status' && value === 'Completed') setActiveDatePickerIndex(null);
  };

  const addProject = () => {
    setProjects(curr => [...curr, createEmptyProject()]);
  };

  const removeProject = (index: number) => {
    if (projects.length <= 1) return;
    setActiveDatePickerIndex(null);
    setProjects(curr => curr.filter((_, i) => i !== index));
  };

  const handleProjectDateChange = (event: { type: string }, selectedDate?: Date) => {
    const index = activeDatePickerIndex;
    setActiveDatePickerIndex(null);
    if (event.type !== 'set' || !selectedDate || index === null) return;
    const iso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    updateProject(index, 'expected_completion_date', iso);
  };

  const pickPhoto = async () => {
    if (pickingPhoto) return;
    setPickingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, base64: true, allowsEditing: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read this photo. Please choose another image.');
      if (asset.base64.length > 1_500_000) throw new Error('Please choose a smaller photo (under 1 MB).');
      setPhoto(`data:image/jpeg;base64,${asset.base64}`);
    } catch (e) {
      Alert.alert('Photo could not be added', e instanceof Error ? e.message : 'Please try again.');
    } finally { setPickingPhoto(false); }
  };

  const handleSaveReport = () => {
    if (isProjectWorker) {
      // Validate projects
      if (!projects.length) {
        Alert.alert('Required', 'Please add at least one project.');
        return;
      }
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        if (!p.project_name.trim()) {
          Alert.alert('Project Name Required', `Please enter Project Name for Project ${i + 1}.`);
          return;
        }
        if (!p.duration.trim()) {
          Alert.alert('Work Duration Required', `Please enter Work Duration for Project ${i + 1}.`);
          return;
        }
        if (p.status !== 'Completed' && !p.expected_completion_date.trim()) {
          Alert.alert('Completion Date Required', `Please select Expected Completion Date for Project ${i + 1}.`);
          return;
        }
      }

      run(async () => {
        const payload = {
          date: data?.date,
          project_reports: projects.map(p => ({
            project_name: p.project_name.trim(),
            duration: p.duration.trim(),
            status: p.status,
            expected_completion_date: p.status === 'Completed' ? '' : p.expected_completion_date.trim(),
            notes: p.notes.trim(),
          })),
          work_links: links.map(link => link.trim()).filter(Boolean),
          ...(photo ? { photo: photo.split(',')[1] } : {}),
        };
        await request('reports/', payload);
        setProjects([createEmptyProject()]);
        setLinks(['']);
        setPhoto(null);
        Alert.alert('Saved', 'Your project-wise work report has been saved.');
      });
    } else {
      if (!notes.trim()) {
        Alert.alert('Work Notes Required', 'Please enter your work completed today.');
        return;
      }
      run(async () => {
        await request('reports/', {
          date: data?.date,
          notes: notes.trim(),
          work_links: links.map(link => link.trim()).filter(Boolean),
          ...(photo ? { photo: photo.split(',')[1] } : {}),
        });
        setNotes('');
        setLinks(['']);
        setPhoto(null);
        Alert.alert('Saved', 'Your daily report has been saved.');
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareContainer
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>My work</Text>

        <Text style={styles.heading}>My assigned projects</Text>
        {data?.projects.map(p => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.label}>{p.title}</Text>
            <Text style={styles.subtitle}>{p.description}</Text>
            <Text style={styles.subtitle}>{p.status} | Due: {p.due_date || 'Not set'}</Text>
            <View style={styles.row}>
              {['STARTED', 'IN_PROGRESS', 'COMPLETED'].filter(s => s !== p.status).map(s => (
                <ActionButton key={s} title={s.replaceAll('_', ' ')} busy={busy} onPress={() => run(async () => { await request(`projects/${p.id}/`, { status: s }, 'PATCH'); })} />
              ))}
            </View>
          </View>
        ))}
        {!data?.projects.length && <Text style={styles.subtitle}>No projects assigned to you.</Text>}

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

            {projects.map((project, index) => (
              <View key={index} style={[styles.card, { padding: 14, gap: 12 }]}>
                {/* Project Card Header */}
                <View style={projectStyles.cardHeader}>
                  <View style={projectStyles.projectBadge}>
                    <View style={[projectStyles.badgeCircle, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[projectStyles.badgeText, { color: colors.primary }]}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.heading, { fontSize: 16 }]}>Project {index + 1}</Text>
                  </View>
                  {projects.length > 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove project ${index + 1}`}
                      disabled={busy}
                      onPress={() => removeProject(index)}
                      style={[projectStyles.removeBtn, { backgroundColor: colors.dangerSoft }]}
                    >
                      <Text style={[projectStyles.removeBtnText, { color: colors.danger }]}>✕ Remove</Text>
                    </Pressable>
                  )}
                </View>

                {/* 1. Project Name */}
                <FormInput
                  label="Project Name *"
                  value={project.project_name}
                  onChangeText={val => updateProject(index, 'project_name', val)}
                  placeholder="e.g. CRM Mobile Dialer, Video Reels Batch"
                />

                {/* 2. Work Duration */}
                <FormInput
                  label="Work Duration *"
                  value={project.duration}
                  onChangeText={val => updateProject(index, 'duration', val)}
                  placeholder="e.g. 3 hours, 2h 30m"
                />

                {/* 3. Project Status */}
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Project Status *</Text>
                  <View style={projectStyles.statusRow}>
                    {PROJECT_STATUSES.map(status => {
                      const isSelected = project.status === status;
                      return (
                        <Pressable
                          key={status}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => updateProject(index, 'status', status)}
                          style={[
                            projectStyles.statusChip,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.surface,
                              borderColor: isSelected ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              projectStyles.statusChipText,
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

                {/* 4. Expected Completion Date */}
                {project.status !== 'Completed' && <DateField
                  label="Expected Completion Date *"
                  value={project.expected_completion_date ? new Date(`${project.expected_completion_date}T12:00:00`) : null}
                  onPress={() => setActiveDatePickerIndex(index)}
                />}

                {/* 5. Work Note / Description (with voice input) */}
                <FormInput
                  label="Work Note / Description"
                  value={project.notes}
                  onChangeText={val => updateProject(index, 'notes', val)}
                  multiline
                  withVoice
                  placeholder="Describe work done on this project (tap mic to speak)..."
                />
              </View>
            ))}

            {/* + Add Project Button */}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={addProject}
              style={[
                projectStyles.addProjectBtn,
                { borderColor: colors.primary, backgroundColor: colors.accentSoft },
              ]}
            >
              <Text style={[projectStyles.addProjectText, { color: colors.primary }]}>
                + Add Project
              </Text>
            </Pressable>

            {/* Optional Links and Photo Container */}
            <View style={styles.card}>
              <Text style={styles.heading}>Work Attachments (optional)</Text>
              {links.map((link, index) => (
                <View key={index} style={{ gap: 6 }}>
                  <FormInput
                    label={`Work Link ${index + 1} (optional)`}
                    value={link}
                    onChangeText={value => setLinks(current => current.map((item, i) => (i === index ? value : item)))}
                    placeholder="https://..."
                  />
                  {links.length > 1 && (
                    <ActionButton title={`Remove Link ${index + 1}`} busy={busy} onPress={() => setLinks(current => current.filter((_, i) => i !== index))} />
                  )}
                </View>
              ))}
              {links.length < 30 && (
                <ActionButton title="+ Add Another Link" busy={busy} onPress={() => setLinks(current => [...current, ''])} />
              )}
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Work photo (optional)</Text>
                {photo ? (
                  <View style={photoStyles.previewRow}>
                    <Image source={{ uri: photo }} style={photoStyles.preview} />
                    <ActionButton title="Remove photo" busy={pickingPhoto} onPress={() => setPhoto(null)} />
                  </View>
                ) : (
                  <ActionButton title={pickingPhoto ? 'Opening…' : 'Add photo'} busy={pickingPhoto} onPress={pickPhoto} />
                )}
              </View>

              <ActionButton title="Save today's report" busy={busy} onPress={handleSaveReport} />
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
                  onChangeText={value => setLinks(current => current.map((item, i) => (i === index ? value : item)))}
                />
                {links.length > 1 && (
                  <ActionButton title={`Remove Link ${index + 1}`} busy={busy} onPress={() => setLinks(current => current.filter((_, i) => i !== index))} />
                )}
              </View>
            ))}
            {links.length < 30 && <ActionButton title="+ Add Another Link" busy={busy} onPress={() => setLinks(current => [...current, ''])} />}
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Work photo (optional)</Text>
              {photo ? (
                <View style={photoStyles.previewRow}>
                  <Image source={{ uri: photo }} style={photoStyles.preview} />
                  <ActionButton title="Remove photo" busy={pickingPhoto} onPress={() => setPhoto(null)} />
                </View>
              ) : (
                <ActionButton title={pickingPhoto ? 'Opening…' : 'Add photo'} busy={pickingPhoto} onPress={pickPhoto} />
              )}
            </View>
            <ActionButton title="Save today's report" busy={busy} onPress={handleSaveReport} />
          </View>
        )}

        {/* Date picker modal for project expected completion date */}
        {activeDatePickerIndex !== null && (
          <DateTimePicker
            themeVariant={mode}
            value={
              projects[activeDatePickerIndex]?.expected_completion_date
                ? new Date(`${projects[activeDatePickerIndex].expected_completion_date}T12:00:00`)
                : new Date()
            }
            mode="date"
            display={Platform.OS === 'android' ? 'default' : 'spinner'}
            onChange={handleProjectDateChange}
          />
        )}

        {/* ================= PAST WORK REPORTS ================= */}
        <Text style={[styles.heading, { marginTop: 12 }]}>Previous reports</Text>
        {data?.reports.map(r => (
          <View key={r.id} style={styles.card}>
            <View style={photoStyles.reportRow}>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.label}>{r.date}</Text>

                {r.project_reports && r.project_reports.length > 0 ? (
                  <View style={{ gap: 10 }}>
                    {r.project_reports.map((p: ProjectReportItem, pIdx: number) => {
                      const statusColor =
                        p.status === 'Completed'
                          ? (mode === 'dark' ? colors.success : '#047857')
                          : p.status === 'In Progress'
                          ? (mode === 'dark' ? colors.accent : colors.primary)
                          : colors.warning;
                      const statusBackground = p.status === 'Completed' ? colors.successSoft : p.status === 'In Progress' ? colors.accentSoft : colors.warningSoft;
                      return (
                        <View
                          key={pIdx}
                          style={{
                            backgroundColor: colors.background,
                            borderRadius: 12,
                            padding: 12,
                            gap: 4,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.label, { fontWeight: '700', flexGrow: 1, flexShrink: 1, flexBasis: 120 }]}>
                              {p.project_name}
                            </Text>
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
                          <Text style={styles.subtitle}>
                            Duration: {p.duration}{p.expected_completion_date ? ` | Due: ${p.expected_completion_date}` : ''}
                          </Text>
                          {!!p.notes && (
                            <Text style={[styles.subtitle, { color: colors.text, marginTop: 2 }]}>
                              {p.notes}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.subtitle}>{r.notes}</Text>
                )}

                {(r.work_links?.length ? r.work_links : r.work_link ? [r.work_link] : []).map((link, index) => (
                  <Pressable
                    key={`${index}-${link}`}
                    accessibilityRole="link"
                    onPress={() => {
                      if (/^https?:\/\//i.test(link)) void Linking.openURL(link).catch(() => Alert.alert('Could not open link', link));
                    }}
                  >
                    <Text selectable style={[styles.subtitle, { color: colors.primary }]}>
                      {`Work Link ${index + 1}: ${link}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {r.has_photo && <ReportPhoto id={r.id} size={56} />}
            </View>
          </View>
        ))}
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  projectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 13,
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  removeBtnText: {
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
  addProjectBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
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
