import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { KeyboardAwareContainer } from '@/components/KeyboardAwareContainer';
import { NoteInputWithVoice } from '@/components/NoteInputWithVoice';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLeads } from '@/context/LeadContext';
import {
  createCounselling,
  getCallerCounsellings,
  getLeadCounsellings,
  type CounsellingRecord,
} from '@/services/counselling';

export default function CounsellingScreen() {
  const styles = useAppStyles(createStyles);
  const { colors } = useAppTheme();
  const { token } = useAuth();
  const { refresh: refreshLeads, leads } = useLeads();
  const { leadId: initialLeadId, leadName: initialLeadName, leadPhone: initialLeadPhone, college: initialCollege } = useLocalSearchParams<{
    leadId: string;
    leadName?: string;
    leadPhone?: string;
    college?: string;
  }>();

  const VISITOR_SOURCES = [
    'Walk-in / Direct',
    'Website',
    'Social Media',
    'Referral',
    'Phone Call',
    'Education Fair',
    'Other',
  ] as const;

  const [leadId, setLeadId] = useState(initialLeadId || '');
  const [newVisitor, setNewVisitor] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorSource, setVisitorSource] = useState('Walk-in / Direct');
  const [selectedSourceOption, setSelectedSourceOption] = useState<string>('Walk-in / Direct');
  const [customSource, setCustomSource] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'WALK_IN' | 'GOOGLE_MEET'>('WALK_IN');
  const selectedLead = leads.find(lead => lead.id === leadId);
  const leadName = selectedLead?.name || (leadId === initialLeadId ? initialLeadName : '');
  const leadPhone = selectedLead?.phone || (leadId === initialLeadId ? initialLeadPhone : '');
  const matchingLeads = search.trim()
    ? leads.filter(lead => `${lead.name} ${lead.phone}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 10)
    : [];

  const [collegeInput, setCollegeInput] = useState(initialCollege || '');
  const [courseInput, setCourseInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [conductedDate, setConductedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false);
  const historyRequest = useRef(0);

  // Prior history
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [counsellings, setCounsellings] = useState<CounsellingRecord[]>([]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    const request = ++historyRequest.current;
    setHistoryLoading(true);
    setHistoryError(false);
    setCounsellings([]);
    try {
      const data = leadId ? await getLeadCounsellings(token, leadId) : await getCallerCounsellings(token);
      if (request === historyRequest.current) setCounsellings(data.counsellings);
    } catch {
      if (request === historyRequest.current) setHistoryError(true);
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false);
    }
  }, [token, leadId]);

  useEffect(() => {
    void loadHistory();
    return () => { historyRequest.current += 1; };
  }, [loadHistory]);

  const handleSave = async () => {
    if (saving.current) return;
    if (!newVisitor && !leadId) {
      Alert.alert('Select a Student', 'Choose a student from your assigned leads.');
      return;
    }
    if (newVisitor && (!visitorName.trim() || !visitorPhone.trim())) {
      Alert.alert('Visitor Details', 'Enter the visitor name and phone number.');
      return;
    }
    const finalSource = newVisitor
      ? (selectedSourceOption === 'Other' ? customSource.trim() : visitorSource.trim())
      : '';
    if (newVisitor && !finalSource) {
      Alert.alert('Visitor Source', 'Please select or enter the visitor source.');
      return;
    }
    if (!token) {
      Alert.alert('Session Expired', 'Please log in again.');
      return;
    }

    saving.current = true;
    setSubmitting(true);
    try {
      await createCounselling(token, {
        ...(newVisitor
          ? {
              visitor_name: visitorName.trim(),
              visitor_phone: visitorPhone.trim(),
              visitor_email: visitorEmail.trim(),
              visitor_source: finalSource,
            }
          : { lead_id: Number(leadId) }),
        counselling_type: type,
        college: collegeInput.trim(),
        course: courseInput.trim(),
        notes: notesInput.trim(),
        conducted_at: conductedDate.toISOString(),
      });

      await refreshLeads();
      Alert.alert(
        'Counselling Recorded',
        `Counselling consultation for ${(newVisitor ? visitorName.trim() : leadName) || 'student'} has been saved successfully.`,
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
        error instanceof Error ? error.message : 'Could not save counselling.'
      );
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.keyboardView}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedBackButton />
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>Counselling</Text>
            <Text style={styles.headerSubtitle}>
              Record walk-in or Google Meet counselling
            </Text>
          </View>
        </View>

        <KeyboardAwareContainer
          contentContainerStyle={styles.content}
        >
          {/* Student Info Card */}
          {!initialLeadId && <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {([false, true] as const).map(value => <Pressable key={String(value)} accessibilityRole="radio"
              accessibilityState={{ checked: newVisitor === value }} disabled={submitting}
              onPress={() => { setNewVisitor(value); setLeadId(''); }}
              style={[styles.studentOption, { flex: 1 }, newVisitor === value && styles.selectedOption]}>
              <Text style={styles.studentName}>{value ? 'New visitor' : 'Existing lead'}</Text>
            </Pressable>)}
          </View>}
          {newVisitor && <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Visitor name *</Text>
            <TextInput style={styles.input} value={visitorName} onChangeText={setVisitorName} maxLength={200}
              placeholder="Full name" placeholderTextColor={colors.placeholder} />
            <Text style={styles.fieldLabel}>Phone number *</Text>
            <TextInput style={styles.input} value={visitorPhone} onChangeText={setVisitorPhone} maxLength={30}
              keyboardType="phone-pad" placeholder="Phone number" placeholderTextColor={colors.placeholder} />
            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput style={styles.input} value={visitorEmail} onChangeText={setVisitorEmail}
              keyboardType="email-address" autoCapitalize="none" placeholder="Email address" placeholderTextColor={colors.placeholder} />
            <Text style={styles.fieldLabel}>Source *</Text>
            <View style={styles.sourceChipsRow}>
              {VISITOR_SOURCES.map((source) => {
                const isSelected = selectedSourceOption === source;
                return (
                  <Pressable
                    key={source}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    disabled={submitting}
                    onPress={() => {
                      setSelectedSourceOption(source);
                      if (source !== 'Other') {
                        setVisitorSource(source);
                      } else {
                        setVisitorSource(customSource.trim());
                      }
                    }}
                    style={[
                      styles.sourceChip,
                      isSelected && styles.sourceChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sourceChipText,
                        isSelected && styles.sourceChipTextSelected,
                      ]}
                    >
                      {source}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedSourceOption === 'Other' && (
              <TextInput
                style={[styles.input, { marginTop: 4 }]}
                value={customSource}
                onChangeText={(text) => {
                  setCustomSource(text);
                  setVisitorSource(text);
                }}
                maxLength={100}
                placeholder="Enter custom visitor source *"
                placeholderTextColor={colors.placeholder}
              />
            )}
          </View>}
          {!initialLeadId && !newVisitor && <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Select student</Text>
            <TextInput style={styles.input} value={search} onChangeText={setSearch}
              placeholder="Search your leads by name or phone" placeholderTextColor={colors.placeholder} />
            {matchingLeads.map(lead => <Pressable key={lead.id} accessibilityRole="radio"
              accessibilityState={{ checked: lead.id === leadId }} disabled={submitting}
              onPress={() => { setLeadId(lead.id); setSearch(''); }}
              style={[styles.studentOption, lead.id === leadId && styles.selectedOption]}>
              <Text style={styles.studentName}>{lead.name}</Text><Text style={styles.studentPhone}>{lead.phone}</Text>
            </Pressable>)}
            {!!search.trim() && !matchingLeads.length && <Text style={styles.historyEmpty}>No matching assigned leads.</Text>}
          </View>}
          {!newVisitor && !!leadId && <View style={styles.studentCard}>
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
          </View>}

          {/* Form */}
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Counselling type</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['WALK_IN', 'GOOGLE_MEET'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
                accessibilityState={{ checked: type === value }} disabled={submitting} onPress={() => setType(value)}
                style={[styles.studentOption, { flex: 1 }, type === value && styles.selectedOption]}>
                <Text style={styles.studentName}>{value === 'WALK_IN' ? 'Walk-in' : 'Google Meet'}</Text>
              </Pressable>)}
            </View>
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
            <NoteInputWithVoice
              value={notesInput}
              onChangeText={setNotesInput}
              placeholder="Details of student interaction, document verification, queries answered, candidate interest level (tap mic to speak)…"
              multiline
              numberOfLines={4}
              editable={!submitting}
            />

            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Save Counselling 📋</Text>
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
            ) : historyError ? (
              <Pressable onPress={() => void loadHistory()}><Text style={styles.historyEmpty}>Could not load records. Tap to retry.</Text></Pressable>
            ) : counsellings.length > 0 ? (
              counsellings.map((c) => (
                <View key={c.id} style={styles.historyCard}>
                  {!leadId && <Text style={styles.studentName}>{c.lead_name}</Text>}
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
                  {(c.visitor_source || c.source) ? (
                    <Text style={styles.historySource}>
                      Source: {c.visitor_source || c.source}
                    </Text>
                  ) : null}
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
                No counselling sessions recorded yet.
              </Text>
            )}
          </View>
        </KeyboardAwareContainer>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    studentOption: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
    selectedOption: { backgroundColor: colors.accentSoft, borderColor: colors.primary },
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
    sourceChipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
      marginBottom: 8,
    },
    sourceChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    sourceChipSelected: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.primary,
    },
    sourceChipText: {
      fontSize: 12,
      color: colors.secondary,
      fontWeight: '500',
    },
    sourceChipTextSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    historySource: {
      fontSize: 12,
      color: colors.muted,
      marginBottom: 4,
      fontWeight: '500',
    },
  });
