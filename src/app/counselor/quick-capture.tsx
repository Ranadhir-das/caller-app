import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
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
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import {
  COUNSELOR_TEAL,
  COUNSELOR_TEAL_SOFT_DARK,
  COUNSELOR_TEAL_SOFT_LIGHT,
  counselorApi,
  type DuplicateCheckItem,
  type EligibleCaller,
} from '@/services/counselor';
import {
  extractLeadCandidates,
  editPhoneCandidate,
  editCandidateName,
  formatPhoneDisplay,
  normalizeIndianMobile,
  type CandidatePhone,
} from '@/utils/quickCapture';
import {
  addShareIntentListener,
  clearShareIntent,
  getInitialShareIntent,
  isOcrAvailable,
  recognizeTextFromImage,
  recognizeTextDetailsFromImage,
  type OcrDetailsResult,
} from '../../../modules/quick-capture/src';

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

type Step = 'capture' | 'candidates' | 'review' | 'results';

interface SelectedLeadState {
  phone: string;
  name: string;
}

export default function QuickCaptureScreen() {
  const insets = useSafeAreaInsets();
  const { mode, colors } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const { token } = useAuth();

  // Screen step
  const [step, setStep] = useState<Step>('capture');

  // Image & OCR State
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Candidates & Selection
  const [candidates, setCandidates] = useState<CandidatePhone[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [manualInput, setManualInput] = useState('');
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editedPhoneInput, setEditedPhoneInput] = useState('');
  const [editingNamePhone, setEditingNamePhone] = useState<string | null>(null);
  const [editedNameInput, setEditedNameInput] = useState('');
  const [duplicateMap, setDuplicateMap] = useState<Record<string, DuplicateCheckItem>>({});
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Review Form
  const [leadsToCreate, setLeadsToCreate] = useState<SelectedLeadState[]>([]);
  const [preferredCourse, setPreferredCourse] = useState<string>('');
  const [customCourse, setCustomCourse] = useState('');
  const [assignNow, setAssignNow] = useState<boolean>(true);
  const [selectedCallerId, setSelectedCallerId] = useState<number | null>(null);
  const [callerSearch, setCallerSearch] = useState('');
  const [callers, setCallers] = useState<EligibleCaller[]>([]);
  const [loadingCallers, setLoadingCallers] = useState(false);

  // Submission & Results
  const [submitting, setSubmitting] = useState(false);
  const [submissionResults, setSubmissionResults] = useState<{
    total: number;
    createdCount: number;
    failedCount: number;
    details: { phone: string; success: boolean; error?: string; leadName?: string }[];
  } | null>(null);

  // 1. Load Callers
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
      console.warn('Could not load eligible callers for quick capture:', err);
    } finally {
      setLoadingCallers(false);
    }
  }, [token, selectedCallerId]);

  useFocusEffect(
    useCallback(() => {
      void loadCallers();
    }, [loadCallers])
  );

  // 2. OCR Execution Function
  const processImageUri = useCallback(
    async (uri: string) => {
      setEditingPhone(null);
      setEditingNamePhone(null);
      setImageUri(uri);
      setProcessingOcr(true);
      setOcrError(null);
      try {
        const available = await isOcrAvailable();
        let ocrData: OcrDetailsResult | string = '';

        if (available) {
          try {
            ocrData = await recognizeTextDetailsFromImage(uri);
          } catch {
            ocrData = await recognizeTextFromImage(uri);
          }
        } else {
          // If native module is not ready in development, inform user
          throw new Error('On-device OCR module is initializing. You can still enter numbers manually below.');
        }

        const result = extractLeadCandidates(ocrData);
        setCandidates(result.candidates);

        // Pre-select all detected numbers
        const initialSelected = new Set(result.candidates.map((c) => c.phone));
        setSelectedPhones(initialSelected);

        if (result.candidates.length > 0 && token) {
          // Perform backend duplicate check
          void checkDuplicatesForPhones(result.candidates.map((c) => c.phone));
        }

        setStep('candidates');
      } catch (err: any) {
        setOcrError(err?.message || 'Failed to process screenshot.');
        setStep('capture');
      } finally {
        setProcessingOcr(false);
      }
    },
    [token]
  );

  // 3. Android Share-to-Vaani handling
  useEffect(() => {
    let isMounted = true;

    // Check if app was launched via Share Intent
    getInitialShareIntent()
      .then((intent) => {
        if (isMounted && intent && intent.uri) {
          void processImageUri(intent.uri);
          void clearShareIntent();
        }
      })
      .catch((e) => console.warn('Could not check initial share intent:', e));

    // Listen for share intent while app is running
    const subscription = addShareIntentListener((event) => {
      if (isMounted && event && event.uri) {
        void processImageUri(event.uri);
        void clearShareIntent();
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [processImageUri]);

  // 4. Duplicate Check
  const checkDuplicatesForPhones = async (phones: string[]) => {
    if (!token || phones.length === 0) return;
    setCheckingDuplicates(true);
    try {
      const res = await counselorApi.checkDuplicates(token, phones);
      setDuplicateMap((prev) => ({ ...prev, ...(res.results || {}) }));
    } catch (e) {
      console.warn('Duplicate check failed:', e);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  // 5. Image Picker Action
  const handlePickImage = async () => {
    setOcrError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1.0,
      });

      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        await processImageUri(res.assets[0].uri);
      }
    } catch (e: any) {
      setOcrError(e?.message || 'Could not select image.');
    }
  };

  // 6. Manual Phone Add
  const handleAddManualNumber = () => {
    const normalized = normalizeIndianMobile(manualInput);
    if (!normalized) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (candidates.some((c) => c.phone === normalized)) {
      // Already in list, just ensure it is selected
      setSelectedPhones((prev) => new Set([...prev, normalized]));
      setManualInput('');
      return;
    }

    const newCandidate: CandidatePhone = {
      phone: normalized,
      original: manualInput.trim(),
      occurrences: 1,
      name: undefined,
      needsReview: false,
    };

    setCandidates((prev) => [newCandidate, ...prev]);
    setSelectedPhones((prev) => new Set([...prev, normalized]));
    setManualInput('');
    if (token) {
      void checkDuplicatesForPhones([normalized]);
    }
    if (step === 'capture') {
      setStep('candidates');
    }
  };

  // Toggle selection
  const applyPhoneEdit = () => {
    if (!editingPhone) return;
    try {
      const result = editPhoneCandidate(candidates, selectedPhones, editingPhone, editedPhoneInput);
      setCandidates(result.candidates);
      setSelectedPhones(result.selectedPhones);
      setDuplicateMap((previous) => {
        const next = { ...previous };
        delete next[editingPhone];
        delete next[result.phone];
        return next;
      });
      setEditingPhone(null);
      Keyboard.dismiss();
      void checkDuplicatesForPhones([result.phone]);
    } catch (error) {
      Alert.alert('Could Not Edit Number', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const applyNameEdit = () => {
    if (!editingNamePhone) return;
    setCandidates((prev) => editCandidateName(prev, editingNamePhone, editedNameInput));
    setEditingNamePhone(null);
    Keyboard.dismiss();
  };

  const toggleSelectPhone = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPhones(new Set(candidates.map((c) => c.phone)));
  };

  const deselectAll = () => {
    setSelectedPhones(new Set());
  };

  // 7. Transition to Review
  const handleProceedToReview = () => {
    if (editingPhone || editingNamePhone) return;
    if (selectedPhones.size === 0) {
      Alert.alert('No Numbers Selected', 'Please select at least one phone number to proceed.');
      return;
    }

    const leads: SelectedLeadState[] = Array.from(selectedPhones).map((phone) => {
      const cand = candidates.find((c) => c.phone === phone);
      const dup = duplicateMap[phone];
      const initialName = (cand?.name || (dup?.name && dup.name !== 'Student' ? dup.name : '')).trim();
      return {
        phone,
        name: initialName,
      };
    });

    setLeadsToCreate(leads);
    setStep('review');
  };

  // Update lead name in review
  const updateLeadName = (phone: string, name: string) => {
    setLeadsToCreate((prev) =>
      prev.map((item) => (item.phone === phone ? { ...item, name } : item))
    );
  };

  // Remove lead from review
  const removeLeadFromReview = (phone: string) => {
    setLeadsToCreate((prev) => prev.filter((item) => item.phone !== phone));
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      next.delete(phone);
      return next;
    });
  };

  // 8. Submit Leads
  const handleSaveLeads = async () => {
    if (leadsToCreate.length === 0) {
      Alert.alert('No Leads', 'Please select at least one lead to create.');
      return;
    }

    if (preferredCourse === 'OTHERS' && !customCourse.trim()) {
      Alert.alert('Required Course', 'Please enter the custom course name.');
      return;
    }

    if (assignNow && !selectedCallerId) {
      Alert.alert('Select Caller', 'Please select a caller to assign these leads to, or choose "Leave Unassigned".');
      return;
    }

    if (!token) {
      Alert.alert('Session Expired', 'Please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        leads: leadsToCreate.map((item) => ({
          phone: item.phone,
          name: item.name.trim() || undefined,
          preferred_course: preferredCourse || undefined,
          preferred_course_custom: preferredCourse === 'OTHERS' ? customCourse.trim() : undefined,
        })),
        assigned_caller_id: assignNow ? selectedCallerId : null,
        preferred_course: preferredCourse || undefined,
        preferred_course_custom: preferredCourse === 'OTHERS' ? customCourse.trim() : undefined,
        source: 'Quick Capture',
      };

      const res = await counselorApi.batchCreateLeads(token, payload);

      setSubmissionResults({
        total: res.total,
        createdCount: res.created_count,
        failedCount: res.failed_count,
        details: res.results.map((r) => ({
          phone: r.phone,
          success: r.success,
          error: r.error,
          leadName: r.lead?.name,
        })),
      });

      setStep('results');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create leads. Please try again.';
      Alert.alert('Creation Failed', String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetFlow = () => {
    setEditingPhone(null);
    setEditingNamePhone(null);
    setEditedNameInput('');
    setStep('capture');
    setImageUri(null);
    setCandidates([]);
    setSelectedPhones(new Set());
    setDuplicateMap({});
    setLeadsToCreate([]);
    setPreferredCourse('');
    setCustomCourse('');
    setManualInput('');
    setSubmissionResults(null);
  };

  const filteredCallers = useMemo(() => {
    if (!callerSearch.trim()) return callers;
    const q = callerSearch.toLowerCase().trim();
    return callers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
    );
  }, [callers, callerSearch]);

  const selectedCaller = useMemo(
    () => callers.find((c) => c.id === selectedCallerId),
    [callers, selectedCallerId]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top App Header */}
        <View style={styles.topNav}>
          <Pressable
            hitSlop={12}
            onPress={() => {
              if (step === 'candidates') setStep('capture');
              else if (step === 'review') setStep('candidates');
              else if (step === 'results') router.replace('/counselor' as never);
              else router.back();
            }}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </Pressable>
          <Text style={styles.topNavTitle}>Quick Capture</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView
          nestedScrollEnabled={true}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 90 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: CAPTURE ENTRY */}
          {step === 'capture' && (
            <View style={styles.stepContainer}>
              <View style={styles.header}>
                <Text style={styles.eyebrow}>SCREENSHOT TO LEADS</Text>
                <Text style={styles.title}>Capture Leads Instantly</Text>
                <Text style={styles.subtitle}>
                  Upload a caller screenshot, share directly from Android, or paste numbers to extract and create leads.
                </Text>
              </View>

              {ocrError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{ocrError}</Text>
                </View>
              ) : null}

              {processingOcr ? (
                <View style={styles.processingCard}>
                  <ActivityIndicator size="large" color={COUNSELOR_TEAL} />
                  <Text style={styles.processingTitle}>Scanning Screenshot...</Text>
                  <Text style={styles.processingSubtitle}>
                    Extracting and validating Indian mobile numbers entirely on your device.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Upload Card */}
                  <Pressable
                    style={({ pressed }) => [styles.actionCard, pressed && styles.cardPressed]}
                    onPress={handlePickImage}
                  >
                    <View style={styles.actionIconBox}>
                      <Text style={styles.actionEmoji}>📷</Text>
                    </View>
                    <View style={styles.actionTextBox}>
                      <Text style={styles.actionTitle}>Upload Screenshot</Text>
                      <Text style={styles.actionDesc}>Select from Gallery or Files to run on-device OCR.</Text>
                    </View>
                    <Text style={styles.chevron}>→</Text>
                  </Pressable>

                  {/* Share Target Info Card */}
                  <View style={styles.infoCard}>
                    <View style={styles.infoIconBox}>
                      <Text style={styles.infoEmoji}>📲</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoTitle}>Android Share-to-Vaani</Text>
                      <Text style={styles.infoText}>
                        You can also share any caller screenshot directly from Google Photos, Gallery, or Files. Just tap{' '}
                        <Text style={{ fontWeight: '700' }}>Share → Vaani</Text>.
                      </Text>
                    </View>
                  </View>

                  {/* Manual Entry Fallback */}
                  <View style={styles.card}>
                    <Text style={styles.cardHeader}>ENTER NUMBER MANUALLY</Text>
                    <Text style={styles.cardMuted}>
                      Type or paste an Indian mobile number (+91 or 10 digits).
                    </Text>
                    <View style={styles.manualInputRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="e.g. 9876543210"
                        placeholderTextColor={colors.muted}
                        keyboardType="phone-pad"
                        value={manualInput}
                        onChangeText={setManualInput}
                      />
                      <Pressable
                        style={[styles.addButton, !manualInput.trim() && styles.buttonDisabled]}
                        disabled={!manualInput.trim()}
                        onPress={handleAddManualNumber}
                      >
                        <Text style={styles.addButtonText}>Add</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* STEP 2: CANDIDATES LIST */}
          {step === 'candidates' && (
            <View style={styles.stepContainer}>
              <View style={styles.header}>
                <Text style={styles.eyebrow}>STEP 1 OF 2 · REVIEW DETECTED NUMBERS</Text>
                <Text style={styles.title}>
                  Detected Numbers ({candidates.length})
                </Text>
                <Text style={styles.subtitle}>
                  Select the numbers you want to import into CRM as student leads.
                </Text>
              </View>

              {imageUri ? (
                <View style={styles.imagePreviewRow}>
                  <Image source={{ uri: imageUri }} style={styles.imageThumbnail} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.imageLoadedText}>Screenshot Scanned</Text>
                    <Pressable onPress={handlePickImage} hitSlop={8}>
                      <Text style={styles.changeImageLink}>Choose different image ↗</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {candidates.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyTitle}>No Valid Phone Numbers Found</Text>
                  <Text style={styles.emptySubtitle}>
                    We could not detect any 10-digit Indian mobile numbers in this screenshot. You can add one manually or try another screenshot.
                  </Text>
                  <Pressable style={styles.retryButton} onPress={handlePickImage}>
                    <Text style={styles.retryButtonText}>Upload Another Screenshot</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.selectionBar}>
                    <Text style={styles.selectedCountText}>
                      {selectedPhones.size} of {candidates.length} selected
                    </Text>
                    <View style={styles.selectionActions}>
                      <Pressable onPress={selectAll} hitSlop={8}>
                        <Text style={styles.selectActionText}>Select all</Text>
                      </Pressable>
                      <Text style={styles.selectionDivider}>·</Text>
                      <Pressable onPress={deselectAll} hitSlop={8}>
                        <Text style={styles.selectActionText}>Clear</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* List of candidates */}
                  {candidates.map((cand) => {
                    const isSelected = selectedPhones.has(cand.phone);
                    const dup = duplicateMap[cand.phone];

                    return (
                      <Pressable
                        key={cand.phone}
                        style={[
                          styles.candidateCard,
                          isSelected && styles.candidateCardSelected,
                        ]}
                        onPress={() => { if (!editingPhone && !editingNamePhone) toggleSelectPhone(cand.phone); }}
                      >
                        <View style={styles.checkbox}>
                          {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.candidatePhone}>
                              {formatPhoneDisplay(cand.phone)}
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit phone number ${cand.phone}`}
                              hitSlop={8}
                              onPress={(event) => {
                                event.stopPropagation();
                                setEditingPhone(cand.phone);
                                setEditedPhoneInput(cand.phone);
                              }}
                            >
                              <Text style={styles.viewLeadLink}>Edit</Text>
                            </Pressable>
                            {cand.occurrences > 1 ? (
                              <View style={styles.badgeOccurrences}>
                                <Text style={styles.badgeOccurrencesText}>{cand.occurrences}x seen</Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Student Name Row */}
                          <View style={styles.candidateNameRow}>
                            <Text style={{ fontSize: 13, color: colors.muted }}>👤 Name:</Text>
                            {cand.name ? (
                              <Text style={styles.candidateNameText}>{cand.name}</Text>
                            ) : (
                              <Text style={styles.candidateNoNameText}>Not detected</Text>
                            )}
                            {cand.needsReview ? (
                              <View style={styles.badgeReviewWarning}>
                                <Text style={styles.badgeReviewWarningText}>⚠️ Review name</Text>
                              </View>
                            ) : null}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit name for ${cand.phone}`}
                              hitSlop={8}
                              onPress={(event) => {
                                event.stopPropagation();
                                setEditingNamePhone(cand.phone);
                                setEditedNameInput(cand.name || '');
                              }}
                            >
                              <Text style={styles.viewLeadLink}>{cand.name ? 'Edit' : '+ Add'}</Text>
                            </Pressable>
                          </View>

                          {editingNamePhone === cand.phone && (
                            <View style={{ gap: 10, marginVertical: 8 }}>
                              <TextInput
                                accessibilityLabel="Edit student name"
                                style={styles.input}
                                placeholder="Student name (optional)"
                                placeholderTextColor={colors.muted}
                                value={editedNameInput}
                                onChangeText={setEditedNameInput}
                                autoFocus
                              />
                              <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
                                <Pressable
                                  style={styles.addButton}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    applyNameEdit();
                                  }}
                                >
                                  <Text style={styles.addButtonText}>Save</Text>
                                </Pressable>
                                <Pressable
                                  hitSlop={8}
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    setEditingNamePhone(null);
                                    Keyboard.dismiss();
                                  }}
                                >
                                  <Text style={styles.viewLeadLink}>Cancel</Text>
                                </Pressable>
                              </View>
                            </View>
                          )}

                          {editingPhone === cand.phone && (
                            <View style={{ gap: 10, marginVertical: 10 }}>
                              <TextInput
                                accessibilityLabel="Correct phone number"
                                style={styles.input}
                                keyboardType="phone-pad"
                                value={editedPhoneInput}
                                onChangeText={setEditedPhoneInput}
                                autoFocus
                              />
                              <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
                                <Pressable style={styles.addButton} onPress={(event) => {
                                  event.stopPropagation();
                                  applyPhoneEdit();
                                }}>
                                  <Text style={styles.addButtonText}>Apply</Text>
                                </Pressable>
                                <Pressable hitSlop={8} onPress={(event) => {
                                  event.stopPropagation();
                                  setEditingPhone(null);
                                  Keyboard.dismiss();
                                }}>
                                  <Text style={styles.viewLeadLink}>Cancel</Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                          {dup?.exists ? (
                            <View style={styles.duplicateWarning}>
                              <Text style={styles.duplicateWarningText}>
                                ⚠️ Exists in CRM: {dup.name || 'Lead'}
                                {dup.assigned_caller_name ? ` (${dup.assigned_caller_name})` : ' (Unassigned)'}
                              </Text>
                              {dup.can_view && dup.lead_id ? (
                                <Pressable
                                  hitSlop={6}
                                  onPress={() =>
                                    router.push({
                                      pathname: '/counselor-created-lead',
                                      params: { id: dup.lead_id },
                                    } as never)
                                  }
                                >
                                  <Text style={styles.viewLeadLink}>View lead ↗</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ) : (
                            <Text style={styles.candidateOriginal}>
                              {normalizeIndianMobile(cand.original) === cand.phone ? 'Extracted' : 'Corrected from'}: "{cand.original}"
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}

              {/* Add extra number manually */}
              <View style={[styles.card, { marginTop: 16 }]}>
                <Text style={styles.cardHeader}>ADD ANOTHER NUMBER</Text>
                <View style={styles.manualInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Enter phone number"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    value={manualInput}
                    onChangeText={setManualInput}
                  />
                  <Pressable
                    style={[styles.addButton, !manualInput.trim() && styles.buttonDisabled]}
                    disabled={!manualInput.trim()}
                    onPress={handleAddManualNumber}
                  >
                    <Text style={styles.addButtonText}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* STEP 3: REVIEW & ASSIGN */}
          {step === 'review' && (
            <View style={styles.stepContainer}>
              <View style={styles.header}>
                <Text style={styles.eyebrow}>STEP 2 OF 2 · DETAILS & ASSIGNMENT</Text>
                <Text style={styles.title}>Review & Save Leads</Text>
                <Text style={styles.subtitle}>
                  Optionally specify a course and caller assignment for your {leadsToCreate.length} selected lead{leadsToCreate.length > 1 ? 's' : ''}.
                </Text>
              </View>

              {/* Common Course Selector */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>PREFERRED COURSE (OPTIONAL)</Text>
                <Text style={styles.cardMuted}>Applies to all leads created in this quick capture.</Text>
                <View style={styles.courseChipsGrid}>
                  {COURSES.map((c) => {
                    const active = preferredCourse === c.code;
                    return (
                      <Pressable
                        key={c.code}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setPreferredCourse(active ? '' : c.code)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {preferredCourse === 'OTHERS' && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.label}>Custom Course Name *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. B.Sc Agriculture"
                      placeholderTextColor={colors.muted}
                      value={customCourse}
                      onChangeText={setCustomCourse}
                    />
                  </View>
                )}
              </View>

              {/* Caller Assignment Options */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>ASSIGNMENT</Text>

                <View style={styles.radioRow}>
                  <Pressable
                    style={[styles.radioOption, assignNow && styles.radioOptionActive]}
                    onPress={() => {
                      setAssignNow(true);
                      if (!selectedCallerId && callers.length > 0) {
                        setSelectedCallerId(callers[0].id);
                      }
                    }}
                  >
                    <View style={styles.radioCircle}>
                      {assignNow && <View style={styles.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radioTitle}>Assign to an active caller</Text>
                      <Text style={styles.radioSubtitle}>Leads will immediately appear on caller dashboard</Text>
                    </View>
                  </Pressable>

                  <Pressable
                    style={[styles.radioOption, !assignNow && styles.radioOptionActive]}
                    onPress={() => {
                      setAssignNow(false);
                      setSelectedCallerId(null);
                    }}
                  >
                    <View style={styles.radioCircle}>
                      {!assignNow && <View style={styles.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radioTitle}>Leave unassigned</Text>
                      <Text style={styles.radioSubtitle}>Save leads now and assign callers later from My Leads</Text>
                    </View>
                  </Pressable>
                </View>

                {assignNow && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.label}>Choose Caller *</Text>
                    {loadingCallers ? (
                      <ActivityIndicator size="small" color={COUNSELOR_TEAL} />
                    ) : (
                      <>
                        <TextInput
                          style={styles.callerSearchInput}
                          placeholder="Search caller by name or username..."
                          placeholderTextColor={colors.muted}
                          value={callerSearch}
                          onChangeText={setCallerSearch}
                        />
                        <View style={styles.callerListContainer}>
                          <FlatList
                            data={filteredCallers}
                            keyExtractor={(item) => String(item.id)}
                            nestedScrollEnabled={true}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={true}
                            style={styles.callerList}
                            contentContainerStyle={filteredCallers.length === 0 ? styles.callerListEmptyContent : undefined}
                            ListEmptyComponent={
                              <View style={styles.callerEmptyBox}>
                                <Text style={styles.callerEmptyText}>
                                  {callers.length === 0
                                    ? 'No active callers available for assignment.'
                                    : `No callers found matching "${callerSearch}".`}
                                </Text>
                              </View>
                            }
                            renderItem={({ item: caller }) => {
                              const isSelected = selectedCallerId === caller.id;
                              return (
                                <Pressable
                                  key={caller.id}
                                  style={[styles.callerItem, isSelected && styles.callerItemActive]}
                                  onPress={() => setSelectedCallerId(caller.id)}
                                >
                                  <View style={styles.callerAvatar}>
                                    <Text style={styles.callerAvatarText}>
                                      {caller.name.slice(0, 1).toUpperCase()}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.callerName, isSelected && styles.callerNameActive]}>
                                      {caller.name}
                                    </Text>
                                    <Text style={styles.callerMeta}>
                                      @{caller.username} · {caller.phone || 'No phone'}
                                    </Text>
                                  </View>
                                  {isSelected ? <Text style={styles.callerCheck}>✓</Text> : null}
                                </Pressable>
                              );
                            }}
                          />
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>

              {/* Leads List with Optional Names */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>SELECTED LEADS ({leadsToCreate.length})</Text>
                <Text style={styles.cardMuted}>Add optional student names below:</Text>

                {leadsToCreate.map((lead, idx) => {
                  const cand = candidates.find((c) => c.phone === lead.phone);
                  return (
                    <View key={lead.phone} style={styles.leadReviewItem}>
                      <View style={styles.leadReviewTop}>
                        <Text style={styles.leadReviewIndex}>#{idx + 1}</Text>
                        <Text style={styles.leadReviewPhone}>{formatPhoneDisplay(lead.phone)}</Text>
                        {cand?.needsReview ? (
                          <View style={styles.badgeReviewWarning}>
                            <Text style={styles.badgeReviewWarningText}>⚠️ Review name</Text>
                          </View>
                        ) : null}
                        <Pressable
                          onPress={() => removeLeadFromReview(lead.phone)}
                          hitSlop={8}
                          style={styles.removeLeadButton}
                        >
                          <Text style={styles.removeLeadText}>Remove</Text>
                        </Pressable>
                      </View>
                      <TextInput
                        style={styles.leadReviewNameInput}
                        placeholder="Student name (optional)"
                        placeholderTextColor={colors.muted}
                        value={lead.name}
                        onChangeText={(val) => updateLeadName(lead.phone, val)}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 4: RESULTS */}
          {step === 'results' && submissionResults && (
            <View style={styles.stepContainer}>
              <View style={styles.resultsSummaryCard}>
                <Text style={styles.resultsEmoji}>
                  {submissionResults.failedCount === 0 ? '🎉' : '⚠️'}
                </Text>
                <Text style={styles.resultsTitle}>
                  {submissionResults.createdCount} Lead{submissionResults.createdCount === 1 ? '' : 's'} Created!
                </Text>
                <Text style={styles.resultsSubtitle}>
                  {assignNow && selectedCaller
                    ? `Assigned to ${selectedCaller.name} for immediate follow-up.`
                    : 'Saved as unassigned leads in your counselor workspace.'}
                </Text>

                {submissionResults.failedCount > 0 ? (
                  <Text style={styles.resultsWarningText}>
                    {submissionResults.failedCount} entry was skipped due to duplication or validation error.
                  </Text>
                ) : null}
              </View>

              {/* Result Details */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>CREATION DETAILS</Text>
                {submissionResults.details.map((item) => (
                  <View key={item.phone} style={styles.resultItemRow}>
                    <Text style={item.success ? styles.resultSuccessIcon : styles.resultFailedIcon}>
                      {item.success ? '✓' : '✗'}
                    </Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.resultPhone}>{formatPhoneDisplay(item.phone)}</Text>
                      {item.success ? (
                        <Text style={styles.resultCreatedNote}>
                          Created as "{item.leadName || 'Student'}"
                        </Text>
                      ) : (
                        <Text style={styles.resultErrorNote}>{item.error || 'Failed'}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.resultsActionGroup}>
                <Pressable
                  style={styles.primaryActionButton}
                  onPress={() => router.push('/counselor/leads' as never)}
                >
                  <Text style={styles.primaryActionButtonText}>View My Created Leads ↗</Text>
                </Pressable>

                <Pressable
                  style={styles.secondaryActionButton}
                  onPress={handleResetFlow}
                >
                  <Text style={styles.secondaryActionButtonText}>Capture Another Screenshot</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>

        {/* BOTTOM FIXED CTA BAR */}
        {step === 'candidates' && candidates.length > 0 && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={[
                styles.bottomCtaButton,
                (selectedPhones.size === 0 || !!editingPhone || !!editingNamePhone) && styles.buttonDisabled,
              ]}
              disabled={selectedPhones.size === 0 || !!editingPhone || !!editingNamePhone}
              onPress={handleProceedToReview}
            >
              <Text style={styles.bottomCtaText}>
                Review & Assign ({selectedPhones.size}) ↗
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'review' && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              style={[
                styles.bottomCtaButton,
                (submitting || leadsToCreate.length === 0) && styles.buttonDisabled,
              ]}
              disabled={submitting || leadsToCreate.length === 0}
              onPress={handleSaveLeads}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.bottomCtaText}>
                  Save {leadsToCreate.length} Lead{leadsToCreate.length > 1 ? 's' : ''} {assignNow && selectedCaller ? `& Assign` : ''} ↗
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: AppColors) {
  const dark = colors.background === '#070B14';
  const softTeal = dark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    backButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    backButtonText: {
      fontSize: 15,
      color: COUNSELOR_TEAL,
      fontWeight: '600',
    },
    topNavTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    scrollContent: {
      padding: 16,
    },
    stepContainer: {
      gap: 16,
    },
    header: {
      marginBottom: 8,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: COUNSELOR_TEAL,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      color: colors.muted,
      marginTop: 4,
      lineHeight: 20,
    },
    errorBox: {
      backgroundColor: dark ? '#450a0a' : '#fef2f2',
      borderWidth: 1,
      borderColor: dark ? '#991b1b' : '#fca5a5',
      padding: 12,
      borderRadius: 10,
    },
    errorText: {
      color: dark ? '#fca5a5' : '#b91c1c',
      fontSize: 13,
      fontWeight: '500',
    },
    processingCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    processingTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    processingSubtitle: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
    actionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 14,
    },
    cardPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    actionIconBox: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: softTeal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionEmoji: {
      fontSize: 24,
    },
    actionTextBox: {
      flex: 1,
    },
    actionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    actionDesc: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
    },
    chevron: {
      fontSize: 18,
      fontWeight: '700',
      color: COUNSELOR_TEAL,
    },
    infoCard: {
      flexDirection: 'row',
      backgroundColor: softTeal,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: COUNSELOR_TEAL + '33',
      padding: 14,
      gap: 12,
      alignItems: 'center',
    },
    infoIconBox: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: COUNSELOR_TEAL + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoEmoji: {
      fontSize: 18,
    },
    infoTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: COUNSELOR_TEAL,
    },
    infoText: {
      fontSize: 12,
      color: colors.text,
      marginTop: 2,
      lineHeight: 17,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    cardHeader: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.muted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    cardMuted: {
      fontSize: 13,
      color: colors.muted,
      marginBottom: 12,
    },
    manualInputRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    addButton: {
      backgroundColor: COUNSELOR_TEAL,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    imagePreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    imageThumbnail: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: colors.border,
    },
    imageLoadedText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    changeImageLink: {
      fontSize: 12,
      fontWeight: '600',
      color: COUNSELOR_TEAL,
      marginTop: 2,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    emptyEmoji: {
      fontSize: 32,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
    retryButton: {
      marginTop: 8,
      backgroundColor: COUNSELOR_TEAL,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    retryButtonText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 13,
    },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    selectedCountText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    selectionActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    selectActionText: {
      fontSize: 13,
      fontWeight: '600',
      color: COUNSELOR_TEAL,
    },
    selectionDivider: {
      color: colors.muted,
    },
    candidateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 14,
    },
    candidateCardSelected: {
      borderColor: COUNSELOR_TEAL,
      backgroundColor: softTeal,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: COUNSELOR_TEAL,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkmark: {
      color: COUNSELOR_TEAL,
      fontSize: 14,
      fontWeight: '800',
    },
    candidatePhone: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    badgeOccurrences: {
      backgroundColor: colors.border,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeOccurrencesText: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.muted,
    },
    candidateNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    candidateNameText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    candidateNoNameText: {
      fontSize: 13,
      fontStyle: 'italic',
      color: colors.muted,
    },
    badgeReviewWarning: {
      backgroundColor: dark ? '#78350f' : '#fef3c7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: dark ? '#b45309' : '#fde68a',
    },
    badgeReviewWarningText: {
      fontSize: 10,
      fontWeight: '700',
      color: dark ? '#fde68a' : '#b45309',
    },
    duplicateWarning: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    duplicateWarningText: {
      fontSize: 12,
      color: '#ea580c',
      fontWeight: '600',
    },
    viewLeadLink: {
      fontSize: 12,
      color: COUNSELOR_TEAL,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    candidateOriginal: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    courseChipsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    chipActive: {
      borderColor: COUNSELOR_TEAL,
      backgroundColor: COUNSELOR_TEAL,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    chipTextActive: {
      color: '#fff',
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    radioRow: {
      gap: 10,
      marginTop: 8,
    },
    radioOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: 12,
    },
    radioOptionActive: {
      borderColor: COUNSELOR_TEAL,
      backgroundColor: softTeal,
    },
    radioCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: COUNSELOR_TEAL,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: COUNSELOR_TEAL,
    },
    radioTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    radioSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    callerSearchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.text,
      marginBottom: 8,
    },
    callerListContainer: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: 'hidden',
    },
    callerList: {
      maxHeight: 220,
    },
    callerListEmptyContent: {
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callerEmptyBox: {
      padding: 16,
      alignItems: 'center',
    },
    callerEmptyText: {
      fontSize: 13,
      color: colors.muted,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    callerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 10,
    },
    callerItemActive: {
      backgroundColor: softTeal,
    },
    callerAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: COUNSELOR_TEAL + '25',
      alignItems: 'center',
      justifyContent: 'center',
    },
    callerAvatarText: {
      fontSize: 13,
      fontWeight: '700',
      color: COUNSELOR_TEAL,
    },
    callerName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    callerNameActive: {
      color: COUNSELOR_TEAL,
      fontWeight: '700',
    },
    callerMeta: {
      fontSize: 11,
      color: colors.muted,
    },
    callerCheck: {
      fontSize: 15,
      fontWeight: '700',
      color: COUNSELOR_TEAL,
    },
    leadReviewItem: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 6,
    },
    leadReviewTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    leadReviewIndex: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.muted,
      width: 26,
    },
    leadReviewPhone: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      flex: 1,
    },
    removeLeadButton: {
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    removeLeadText: {
      fontSize: 12,
      color: '#ef4444',
      fontWeight: '600',
    },
    leadReviewNameInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 13,
      color: colors.text,
      backgroundColor: colors.background,
    },
    resultsSummaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    resultsEmoji: {
      fontSize: 40,
    },
    resultsTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    resultsSubtitle: {
      fontSize: 13,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
    resultsWarningText: {
      fontSize: 12,
      color: '#ea580c',
      fontWeight: '600',
      marginTop: 4,
    },
    resultItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    resultSuccessIcon: {
      fontSize: 16,
      fontWeight: '800',
      color: '#10b981',
    },
    resultFailedIcon: {
      fontSize: 16,
      fontWeight: '800',
      color: '#ef4444',
    },
    resultPhone: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    resultCreatedNote: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 1,
    },
    resultErrorNote: {
      fontSize: 12,
      color: '#ef4444',
      marginTop: 1,
    },
    resultsActionGroup: {
      gap: 10,
      marginTop: 8,
    },
    primaryActionButton: {
      backgroundColor: COUNSELOR_TEAL,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryActionButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryActionButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryActionButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    bottomCtaButton: {
      backgroundColor: COUNSELOR_TEAL,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bottomCtaText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
