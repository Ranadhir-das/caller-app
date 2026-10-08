import { useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { NoteInputWithVoice } from '@/components/NoteInputWithVoice';
import { AnimatedBackButton } from '@/components/AnimatedBackButton';
import {
  buildCounselorNotePayload,
  COUNSELOR_TEAL,
  counselorApi,
  formatDuration,
  type CounselorCallTiming,
} from '@/services/counselor';

/**
 * Notes-only outcome screen for counselors.
 * Never displays or accepts caller outcomes, course, year or follow-up inputs.
 */
export default function CounselorNoteScreen() {
  const { colors } = useAppTheme();
  const styles = useAppStyles(createStyles);
  const { token } = useAuth();

  const params = useLocalSearchParams<{
    leadId: string;
    leadName?: string;
    phone?: string;
    started_at?: string;
    ended_at?: string;
    duration_seconds?: string;
  }>();

  const leadId = params.leadId;
  const leadName = params.leadName || 'Student';
  const phone = params.phone || '';
  const durationSeconds = params.duration_seconds ? parseInt(params.duration_seconds, 10) : 0;
  const hasCall = Boolean(params.started_at && durationSeconds > 0);

  const callTiming = useMemo<CounselorCallTiming | null>(() => {
    if (!params.started_at) return null;
    return {
      started_at: params.started_at,
      ended_at: params.ended_at || new Date().toISOString(),
      duration_seconds: durationSeconds,
    };
  }, [params.started_at, params.ended_at, durationSeconds]);

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const clientEventIdRef = useRef<string>(generateUuid());

  const canSave = notes.trim().length > 0 && !saving && !saved;

  const handleSave = async () => {
    if (!token || !leadId || !canSave) return;
    setSaving(true);
    try {
      const payload = buildCounselorNotePayload(notes, clientEventIdRef.current, callTiming);
      const res = await counselorApi.addNote(token, leadId, payload);
      setSaved(true);
      Alert.alert(
        'Note Saved',
        hasCall
          ? `Call of ${formatDuration(durationSeconds)} logged with your consultation notes.`
          : 'Your consultation note has been saved.',
        [
          {
            text: 'Done',
            onPress: () => {
              router.replace({
                pathname: '/counselor-lead' as never,
                params: { id: leadId },
              } as never);
            },
          },
        ],
        { cancelable: false }
      );
    } catch (err) {
      Alert.alert('Could Not Save Note', err instanceof Error ? err.message : 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <AnimatedBackButton
              style={styles.backCircle}
              onPress={() => router.back()}
            >
              <Text style={styles.backIcon}>‹</Text>
            </AnimatedBackButton>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {hasCall ? 'Call Consultation' : 'Add Counselling Note'}
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {leadName} {phone ? `• ${phone}` : ''}
              </Text>
            </View>
          </View>

          {hasCall ? (
            <View style={styles.callCard}>
              <Text style={styles.callIcon}>📞</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.callTitle}>Call Completed</Text>
                <Text style={styles.callDuration}>Duration: {formatDuration(durationSeconds)}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Consultation Notes</Text>
            <Text style={styles.sectionHint}>
              Private notes visible only to you and management.
            </Text>
          </View>

          <NoteInputWithVoice
            value={notes}
            onChangeText={setNotes}
            placeholder="Document what was discussed with the student, courses explored, concerns, next steps..."
            placeholderTextColor={colors.placeholder}
            numberOfLines={8}
            editable={!saving && !saved}
          />

          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>🔒</Text>
            <Text style={styles.infoText}>
              These notes are private to you and CRM administrators. Callers and other counselors cannot see them.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save Consultation Note"
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            disabled={!canSave}
            onPress={handleSave}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Consultation Note'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function generateUuid(): string {
  // RFC4122 v4 compliant pseudo-UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const createStyles = (c: AppColors) => {
  const isDark = c.background === '#070B14';
  const softTeal = isDark ? '#0B2A27' : '#E6F4F1';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 40, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    backCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    backIcon: { color: c.text, fontSize: 28, marginTop: -3 },
    headerTitle: { color: c.text, fontSize: 20, fontWeight: '800' },
    headerSubtitle: { color: c.muted, fontSize: 13, marginTop: 2 },
    callCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: softTeal,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: COUNSELOR_TEAL,
    },
    callIcon: { fontSize: 26 },
    callTitle: { color: COUNSELOR_TEAL, fontSize: 15, fontWeight: '800' },
    callDuration: { color: c.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
    sectionHeader: { gap: 4 },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    sectionHint: { color: c.muted, fontSize: 13 },
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
    },
    infoIcon: { fontSize: 16 },
    infoText: { color: c.muted, fontSize: 12, flex: 1, lineHeight: 18 },
    saveButton: {
      backgroundColor: COUNSELOR_TEAL,
      borderRadius: 16,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveButtonDisabled: { opacity: 0.5 },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  });
};
