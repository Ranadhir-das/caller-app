import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { VectorIcon } from '@/components/VectorIcon';
import {
  COUNSELOR_TEAL,
  COUNSELOR_TEAL_SOFT_DARK,
  COUNSELOR_TEAL_SOFT_LIGHT,
  counselorApi,
  type EligibleCaller,
} from '@/services/counselor';

const COURSES: { code: string; label: string }[] = [
  { code: 'MBBS', label: 'MBBS' },
  { code: 'BDS', label: 'BDS' },
  { code: 'BTECH', label: 'B.Tech' },
  { code: 'GNM_NURSING', label: 'GNM Nursing' },
  { code: 'BSC_NURSING', label: 'B.Sc Nursing' },
  { code: 'PHARMACY', label: 'Pharmacy' },
  { code: 'MBA', label: 'MBA' },
  { code: 'MD_MS', label: 'MD / MS' },
  { code: 'OTHERS', label: 'Others' },
];

const NEET_OPTIONS = ['Qualified', 'Not Qualified', 'Appearing', 'Not Attempted'];

export default function CounselorAddLeadScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isDark = colors.background === '#070B14';
  const styles = useAppStyles(createStyles);
  const { token, user } = useAuth();

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showOtherDetails, setShowOtherDetails] = useState(false);

  // Optional "Other Details"
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [college, setCollege] = useState('');
  const [preferredCourse, setPreferredCourse] = useState<string>('');
  const [customCourse, setCustomCourse] = useState('');
  const [neetStatus, setNeetStatus] = useState('');
  const [pcbPercentage, setPcbPercentage] = useState('');
  const [preferredIntake, setPreferredIntake] = useState('');
  const [source, setSource] = useState('Counselor App');
  const [notes, setNotes] = useState('');

  // Callers
  const [callers, setCallers] = useState<EligibleCaller[]>([]);
  const [selectedCallerId, setSelectedCallerId] = useState<number | null>(null);
  const [callerSearch, setCallerSearch] = useState('');
  const [loadingCallers, setLoadingCallers] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCallers = useCallback(async () => {
    if (!token) return;
    setLoadingCallers(true);
    try {
      const res = await counselorApi.callers(token);
      setCallers(res.callers || []);
      if (!selectedCallerId && res.callers.length > 0) {
        setSelectedCallerId(res.callers[0].id);
      }
    } catch (err) {
      console.warn('Could not load eligible callers:', err);
    } finally {
      setLoadingCallers(false);
    }
  }, [token, selectedCallerId]);

  useFocusEffect(
    useCallback(() => {
      void loadCallers();
    }, [loadCallers])
  );

  const filteredCallers = useMemo(() => {
    if (!callerSearch.trim()) return callers;
    const q = callerSearch.toLowerCase().trim();
    return callers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [callers, callerSearch]);

  const selectedCaller = useMemo(
    () => callers.find((c) => c.id === selectedCallerId),
    [callers, selectedCallerId]
  );

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setLocation('');
    setCollege('');
    setPreferredCourse('');
    setCustomCourse('');
    setNeetStatus('');
    setPcbPercentage('');
    setPreferredIntake('');
    setNotes('');
    setErrorMessage('');
    setShowOtherDetails(false);
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid phone number with at least 10 digits.');
      return;
    }

    if (!selectedCallerId) {
      setErrorMessage('Please select a caller to assign this lead to.');
      return;
    }

    if (preferredCourse === 'OTHERS' && !customCourse.trim()) {
      setErrorMessage('Please specify the custom course name.');
      return;
    }

    if (!token) {
      setErrorMessage('Session expired. Please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await counselorApi.createLead(token, {
        name: name.trim() || undefined,
        phone: cleanPhone,
        assigned_caller_id: selectedCallerId,
        email: email.trim() || undefined,
        location: location.trim() || undefined,
        college: college.trim() || undefined,
        preferred_course: preferredCourse || undefined,
        preferred_course_custom: preferredCourse === 'OTHERS' ? customCourse.trim() : undefined,
        neet_status: neetStatus || undefined,
        pcb_percentage: pcbPercentage.trim() || undefined,
        preferred_intake: preferredIntake.trim() || undefined,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      const callerName =
        callers.find((c) => c.id === selectedCallerId)?.name || 'Caller';

      Alert.alert(
        'Lead Created & Assigned!',
        `Student "${res.lead.name}" (${res.lead.phone}) has been assigned to ${callerName}.`,
        [
          {
            text: 'Add Another Lead',
            style: 'default',
            onPress: () => resetForm(),
          },
          {
            text: 'Go to Dashboard',
            style: 'default',
            onPress: () => {
              resetForm();
              router.replace('/counselor' as never);
            },
          },
        ]
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.phone?.[0] ||
        err?.response?.data?.phone ||
        err?.response?.data?.assigned_caller_id?.[0] ||
        err?.response?.data?.assigned_caller_id ||
        err?.message ||
        'Failed to create lead. Please check your inputs and try again.';
      setErrorMessage(String(message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 88 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.eyebrow}>NEW LEAD INTAKE</Text>
            <Text style={styles.title}>Add Lead & Assign Caller</Text>
            <Text style={styles.subtitle}>
              Quickly create a student lead and immediately assign them to an active caller for follow-up.
            </Text>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Method Selection: Two distinct, clear intake options */}
          <View style={styles.methodSelectorRow}>
            <View style={[styles.methodCard, styles.methodCardActive]}>
              <View style={[styles.methodIconBox, { backgroundColor: COUNSELOR_TEAL }]}>
                <VectorIcon name="phone" color="#FFFFFF" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.methodTitleActive}>Add Lead by Number</Text>
                  <View style={styles.activeDot} />
                </View>
                <Text style={styles.methodSubtitle}>Type student phone & details directly</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to Quick Capture screenshot intake"
              style={({ pressed }) => [styles.methodCard, pressed && { opacity: 0.8 }]}
              onPress={() => router.push('/counselor/quick-capture' as never)}
            >
              <View style={[styles.methodIconBox, { backgroundColor: isDark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT }]}>
                <VectorIcon name="camera" color={COUNSELOR_TEAL} size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodTitle}>Quick Capture</Text>
                <Text style={styles.methodSubtitle}>Scan screenshots to extract numbers</Text>
              </View>
              <VectorIcon name="chevron-right" color={colors.muted} size={16} />
            </Pressable>
          </View>

          {/* Primary Required Info Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>STUDENT CONTACT DETAILS</Text>

            <View style={styles.field}>
              <Text style={styles.label}>
                Phone Number <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 9876543210 (required)"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(val) => {
                  setPhone(val);
                  if (errorMessage) setErrorMessage('');
                }}
                maxLength={15}
                accessibilityLabel="Student phone number"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Student Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Rahul Sharma (defaults to 'Student' if blank)"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                maxLength={100}
                accessibilityLabel="Student full name"
              />
            </View>
          </View>

          {/* Collapsible Section: Fill Other Details */}
          <View style={styles.card}>
            <Pressable
              style={styles.accordionHeader}
              onPress={() => setShowOtherDetails((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel="Toggle other details section"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.accordionTitle}>Fill other details</Text>
                <Text style={styles.accordionSubtitle}>
                  {showOtherDetails
                    ? 'Hide optional CRM fields'
                    : 'Add course, location, college, email, NEET score, and notes'}
                </Text>
              </View>
              <Text style={styles.accordionChevron}>{showOtherDetails ? '▲' : '▼'}</Text>
            </Pressable>

            {showOtherDetails && (
              <View style={styles.accordionBody}>
                {/* Course Selection */}
                <View style={styles.field}>
                  <Text style={styles.label}>Preferred Course</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {COURSES.map((item) => {
                      const selected = preferredCourse === item.code;
                      return (
                        <Pressable
                          key={item.code}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() =>
                            setPreferredCourse(selected ? '' : item.code)
                          }
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selected && styles.chipTextSelected,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {preferredCourse === 'OTHERS' && (
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      Custom Course Name <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter course name"
                      placeholderTextColor={colors.muted}
                      value={customCourse}
                      onChangeText={setCustomCourse}
                      maxLength={150}
                    />
                  </View>
                )}

                {/* Email & Location */}
                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="student@example.com"
                      placeholderTextColor={colors.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={email}
                      onChangeText={setEmail}
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Location / City</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Pune, Delhi"
                      placeholderTextColor={colors.muted}
                      value={location}
                      onChangeText={setLocation}
                    />
                  </View>
                </View>

                {/* College / School */}
                <View style={styles.field}>
                  <Text style={styles.label}>Current College / School</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. St. Xavier College"
                    placeholderTextColor={colors.muted}
                    value={college}
                    onChangeText={setCollege}
                  />
                </View>

                {/* NEET & PCB */}
                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>PCB Percentage (%)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 78.50"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      value={pcbPercentage}
                      onChangeText={setPcbPercentage}
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Preferred Intake</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 2026 / 2027"
                      placeholderTextColor={colors.muted}
                      value={preferredIntake}
                      onChangeText={setPreferredIntake}
                    />
                  </View>
                </View>

                {/* NEET Status */}
                <View style={styles.field}>
                  <Text style={styles.label}>NEET Status</Text>
                  <View style={styles.chipRow}>
                    {NEET_OPTIONS.map((opt) => {
                      const selected = neetStatus === opt;
                      return (
                        <Pressable
                          key={opt}
                          style={[styles.chip, selected && styles.chipSelected]}
                          onPress={() => setNeetStatus(selected ? '' : opt)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selected && styles.chipTextSelected,
                            ]}
                          >
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Lead Source */}
                <View style={styles.field}>
                  <Text style={styles.label}>Lead Source</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Counselor App, Direct Walk-in, Referral"
                    placeholderTextColor={colors.muted}
                    value={source}
                    onChangeText={setSource}
                  />
                </View>

                {/* Counselor Notes */}
                <View style={styles.field}>
                  <Text style={styles.label}>Notes & Remarks</Text>
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    placeholder="Enter any notes, background, or student preferences for the caller..."
                    placeholderTextColor={colors.muted}
                    multiline
                    numberOfLines={3}
                    value={notes}
                    onChangeText={setNotes}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Caller Assignment Section */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardHeader}>
                ASSIGN TO CALLER <Text style={styles.required}>*</Text>
              </Text>
              {loadingCallers && <ActivityIndicator size="small" color={COUNSELOR_TEAL} />}
            </View>

            {callers.length > 5 && (
              <TextInput
                style={[styles.input, styles.searchInput]}
                placeholder="Search callers by name..."
                placeholderTextColor={colors.muted}
                value={callerSearch}
                onChangeText={setCallerSearch}
              />
            )}

            {filteredCallers.length === 0 ? (
              <Text style={styles.emptyCallers}>
                {loadingCallers
                  ? 'Loading active callers...'
                  : 'No active callers available for assignment.'}
              </Text>
            ) : (
              <View style={styles.callerList}>
                {filteredCallers.map((caller) => {
                  const selected = selectedCallerId === caller.id;
                  return (
                    <Pressable
                      key={caller.id}
                      style={[styles.callerRow, selected && styles.callerRowSelected]}
                      onPress={() => setSelectedCallerId(caller.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Assign to ${caller.name}`}
                    >
                      <View
                        style={[
                          styles.radioCircle,
                          selected && styles.radioCircleSelected,
                        ]}
                      >
                        {selected && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[
                            styles.callerName,
                            selected && styles.callerNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {caller.name}
                        </Text>
                        <Text style={styles.callerUsername} numberOfLines={1}>
                          @{caller.username}
                          {caller.phone ? ` · ${caller.phone}` : ''}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.callerBadge,
                          selected && styles.callerBadgeSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.callerBadgeText,
                            selected && styles.callerBadgeTextSelected,
                          ]}
                        >
                          {caller.designation || 'Caller'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Fixed / Sticky Bottom Bar */}
        <View
          style={[
            styles.stickyBottomBar,
            { paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              (!phone.trim() || !selectedCallerId || submitting) && styles.submitButtonDisabled,
              pressed && styles.pressed,
            ]}
            onPress={handleSubmit}
            disabled={!phone.trim() || !selectedCallerId || submitting}
            accessibilityRole="button"
            accessibilityLabel="Create and assign lead"
          >
            {submitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.submitButtonText}>Creating & Assigning...</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>
                {selectedCaller
                  ? `Create & Assign to ${selectedCaller.name}`
                  : 'Create & Assign Lead'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: AppColors) => {
  const dark = c.background === '#070B14';
  const soft = dark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT;

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 18, paddingBottom: 48, gap: 16 },

    header: { gap: 6, marginBottom: 4 },
    eyebrow: { color: COUNSELOR_TEAL, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
    title: { color: c.text, fontSize: 24, fontWeight: '800' },
    subtitle: { color: c.muted, fontSize: 14, lineHeight: 20 },

    errorBox: {
      backgroundColor: dark ? '#451A1A' : '#FEE2E2',
      borderColor: '#EF4444',
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
    },
    errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600', lineHeight: 18 },

    card: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    cardHeader: {
      color: COUNSELOR_TEAL,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    field: { gap: 6 },
    label: { color: c.text, fontSize: 13, fontWeight: '600' },
    required: { color: '#EF4444' },

    input: {
      backgroundColor: dark ? '#131A29' : '#F8FAFC',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
    },
    multilineInput: { minHeight: 76, textAlignVertical: 'top' },
    searchInput: { marginBottom: 6, paddingVertical: 9, fontSize: 14 },

    row: { flexDirection: 'row', gap: 10 },

    // Accordion
    accordionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    accordionTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
    accordionSubtitle: { color: c.muted, fontSize: 12, marginTop: 2 },
    accordionChevron: { color: COUNSELOR_TEAL, fontSize: 14, fontWeight: '700' },
    accordionBody: { gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },

    // Chips
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: dark ? '#1A2333' : '#F1F5F9',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipSelected: {
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
    },
    chipText: { color: c.muted, fontSize: 13, fontWeight: '600' },
    chipTextSelected: { color: COUNSELOR_TEAL, fontWeight: '700' },

    // Caller List
    callerList: { gap: 8 },
    callerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 14,
      backgroundColor: dark ? '#131A29' : '#F8FAFC',
      borderWidth: 1,
      borderColor: c.border,
    },
    callerRowSelected: {
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
    },
    radioCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioCircleSelected: { borderColor: COUNSELOR_TEAL },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COUNSELOR_TEAL,
    },
    callerName: { color: c.text, fontSize: 15, fontWeight: '700' },
    callerNameSelected: { color: COUNSELOR_TEAL },
    callerUsername: { color: c.muted, fontSize: 12 },
    callerBadge: {
      backgroundColor: dark ? '#1A2333' : '#E2E8F0',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    callerBadgeSelected: {
      backgroundColor: COUNSELOR_TEAL,
    },
    callerBadgeText: { color: c.muted, fontSize: 11, fontWeight: '700' },
    callerBadgeTextSelected: { color: '#FFFFFF' },
    emptyCallers: { color: c.muted, fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },

    // Sticky Bottom Bar & Submit Button
    stickyBottomBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: 16,
      paddingTop: 12,
      elevation: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.08,
      shadowRadius: 5,
    },
    submitButton: {
      backgroundColor: COUNSELOR_TEAL,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    submittingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    pressed: { opacity: 0.8 },
    methodSelectorRow: {
      gap: 10,
      marginBottom: 10,
    },
    methodCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    methodCardActive: {
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
      borderWidth: 1.5,
    },
    methodIconBox: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    methodTitle: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
    },
    methodTitleActive: {
      color: COUNSELOR_TEAL,
      fontSize: 15,
      fontWeight: '800',
    },
    methodSubtitle: {
      color: c.muted,
      fontSize: 12,
      marginTop: 2,
    },
    activeDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: COUNSELOR_TEAL,
    },
  });
};

