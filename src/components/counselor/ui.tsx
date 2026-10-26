import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppColors } from '@/context/AppThemeContext';
import {
  COUNSELOR_TEAL,
  COUNSELOR_TEAL_SOFT_DARK,
  COUNSELOR_TEAL_SOFT_LIGHT,
  formatContactTime,
  formatDuration,
  type CounselorLeadSummary,
  type CounselorCreatedLeadSummary,
} from '@/services/counselor';

export function relativeDate(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function CounselorLeadRow({ lead, styles, onPress }: {
  lead: CounselorLeadSummary;
  styles: ReturnType<typeof createCounselorStyles>;
  onPress: () => void;
}) {
  const isContacted = lead.counselor_contact_status === 'CONTACTED';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${lead.name}`} onPress={onPress}
      style={({ pressed }) => [styles.leadRow, pressed && styles.pressed]}>
      <View style={styles.leadAvatar}><Text style={styles.leadAvatarText}>{initialsOf(lead.name)}</Text></View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={[styles.leadName, { flex: 1 }]} numberOfLines={1}>{lead.name}</Text>
          <View style={isContacted ? styles.contactedPill : styles.pendingPill}>
            <Text style={isContacted ? styles.contactedPillText : styles.pendingPillText}>
              {isContacted ? 'CONTACTED' : 'PENDING'}
            </Text>
          </View>
        </View>
        <Text style={styles.leadMeta} numberOfLines={1}>
          {lead.course_label || 'Course not recorded'}{lead.expected_admission_year ? ` · ${lead.expected_admission_year}` : ''}
        </Text>
        {isContacted ? (
          <View style={{ gap: 1 }}>
            <Text style={styles.leadContactMeta} numberOfLines={1}>
              Last contacted: {formatContactTime(lead.last_contacted_at)}
            </Text>
            <Text style={styles.leadMeta} numberOfLines={1}>
              {lead.counselor_call_count} {lead.counselor_call_count === 1 ? 'call' : 'calls'}
              {lead.last_call_duration != null ? ` · ${formatDuration(lead.last_call_duration)}` : ''}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 1 }}>
            <Text style={styles.leadPendingMeta} numberOfLines={1}>Never contacted</Text>
            <Text style={styles.leadMeta} numberOfLines={1}>
              Forwarded {relativeDate(lead.forwarded_at)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function CounselorCreatedLeadRow({ lead, styles, onPress }: {
  lead: CounselorCreatedLeadSummary;
  styles: ReturnType<typeof createCounselorStyles>;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${lead.name}`} onPress={onPress}
      style={({ pressed }) => [styles.leadRow, pressed && styles.pressed]}>
      <View style={styles.leadAvatar}><Text style={styles.leadAvatarText}>{initialsOf(lead.name)}</Text></View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={[styles.leadName, { flex: 1 }]} numberOfLines={1}>{lead.name}</Text>
          <View style={styles.createdStatusPill}>
            <Text style={styles.createdStatusPillText}>{lead.status_display || lead.status}</Text>
          </View>
        </View>
        <Text style={styles.leadMeta} numberOfLines={1}>
          {lead.phone}{lead.course_label ? ` · ${lead.course_label}` : ''}{lead.location ? ` · ${lead.location}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
          <View style={styles.callerTag}>
            <Text style={styles.callerTagText} numberOfLines={1}>
              {lead.assigned_caller_name ? `Assigned: ${lead.assigned_caller_name}` : 'Unassigned'}
            </Text>
          </View>
          <Text style={styles.leadDateMeta}>{relativeDate(lead.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export const createCounselorStyles = (c: AppColors) => {
  const dark = c.background === '#070B14';
  const soft = dark ? COUNSELOR_TEAL_SOFT_DARK : COUNSELOR_TEAL_SOFT_LIGHT;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 20, paddingBottom: 40, gap: 16 },
    compactHeader: { gap: 2, paddingVertical: 4 },
    dashboardTitle: { color: c.text, fontSize: 24, fontWeight: '800' },
    dashboardSubtitle: { color: c.muted, fontSize: 13, fontWeight: '500' },
    hero: { backgroundColor: COUNSELOR_TEAL, borderRadius: 28, padding: 22, gap: 6 },
    heroEyebrow: { color: '#CCFBF1', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
    heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
    heroSubtitle: { color: '#D5F5EF', fontSize: 14, lineHeight: 20 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    statCard: { flexBasis: '47%', flexGrow: 1, backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 6,
      borderWidth: 1, borderColor: c.border },
    statCardPressed: { opacity: 0.8, borderColor: COUNSELOR_TEAL },
    statCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statCardArrow: { width: 22, height: 22, borderRadius: 11, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' },
    statValue: { color: COUNSELOR_TEAL, fontSize: 28, fontWeight: '800' },
    statLabel: { color: c.muted, fontSize: 13, fontWeight: '600' },
    sectionTitle: { color: c.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
    sectionHint: { color: c.muted, fontSize: 13 },
    card: { backgroundColor: c.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: c.border, gap: 8 },
    softCard: { backgroundColor: soft, borderRadius: 22, padding: 16, gap: 8 },
    leadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 20,
      padding: 14, borderWidth: 1, borderColor: c.border },
    leadAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' },
    leadAvatarText: { color: COUNSELOR_TEAL, fontWeight: '800', fontSize: 16 },
    leadName: { color: c.text, fontSize: 16, fontWeight: '700' },
    leadMeta: { color: c.muted, fontSize: 13 },
    leadContactMeta: { color: dark ? '#34D399' : '#047857', fontSize: 12, fontWeight: '600' },
    leadPendingMeta: { color: dark ? '#FBBF24' : '#B45309', fontSize: 12, fontWeight: '600' },
    pendingPill: {
      backgroundColor: dark ? '#451A03' : '#FEF3C7',
      borderColor: '#F59E0B',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    pendingPillText: {
      color: dark ? '#FBBF24' : '#B45309',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    contactedPill: {
      backgroundColor: dark ? '#064E3B' : '#D1FAE5',
      borderColor: '#10B981',
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    contactedPillText: {
      color: dark ? '#34D399' : '#047857',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    filterRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginVertical: 2 },
    filterPill: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterPillActive: {
      backgroundColor: COUNSELOR_TEAL,
      borderColor: COUNSELOR_TEAL,
    },
    filterPillPendingActive: {
      backgroundColor: dark ? '#78350F' : '#F59E0B',
      borderColor: '#F59E0B',
    },
    filterPillContactedActive: {
      backgroundColor: dark ? '#065F46' : '#10B981',
      borderColor: '#10B981',
    },
    filterPillText: { fontSize: 13, fontWeight: '700', color: c.muted },
    filterPillTextActive: { color: '#FFFFFF' },
    newPill: { color: '#FFFFFF', backgroundColor: COUNSELOR_TEAL, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
      fontSize: 11, fontWeight: '800', overflow: 'hidden' },
    activityRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    activityDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COUNSELOR_TEAL, marginTop: 5 },
    activityText: { color: c.text, fontSize: 14, fontWeight: '600' },
    activityTime: { color: c.muted, fontSize: 12 },
    empty: { color: c.muted, textAlign: 'center', paddingVertical: 24 },
    error: { color: c.danger },
    search: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16,
      paddingVertical: 12, color: c.text, fontSize: 15 },
    title: { color: c.text, fontSize: 26, fontWeight: '800' },
    subtitle: { color: c.muted, fontSize: 14 },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: 20, padding: 16,
      borderWidth: 1, borderColor: c.border },
    menuIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' },
    menuIconText: { fontSize: 18 },
    menuTitle: { color: c.text, fontWeight: '700', fontSize: 15 },
    pressed: { opacity: 0.8 },
    primaryButton: { backgroundColor: COUNSELOR_TEAL, borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    secondaryButton: { backgroundColor: soft, borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    secondaryButtonText: { color: COUNSELOR_TEAL, fontWeight: '800', fontSize: 15 },
    disabled: { opacity: 0.5 },
    label: { color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
    value: { color: c.text, fontSize: 15, fontWeight: '600' },
    body: { color: c.secondary, fontSize: 14, lineHeight: 20 },
    input: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 14, color: c.text,
      fontSize: 15, minHeight: 140, textAlignVertical: 'top' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.border },
    backIcon: { color: c.text, fontSize: 26, marginTop: -2 },
    readOnlyTag: { color: c.muted, fontSize: 11, fontWeight: '700' },
    row: { flexDirection: 'row', gap: 10 },
    createLeadBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
      borderWidth: 1.5,
      borderRadius: 22,
      padding: 16,
    },
    createLeadIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: COUNSELOR_TEAL,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createLeadPlus: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginTop: -2 },
    createLeadTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    createLeadSubtitle: { color: c.muted, fontSize: 12 },
    createLeadArrow: { color: COUNSELOR_TEAL, fontSize: 18, fontWeight: '800' },
    tabSelector: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 4,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
      marginBottom: 4,
    },
    tabButton: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
    },
    tabButtonActive: {
      backgroundColor: COUNSELOR_TEAL,
    },
    tabButtonText: {
      color: c.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    tabButtonTextActive: {
      color: '#FFFFFF',
      fontWeight: '800',
    },
    createdStatusPill: {
      backgroundColor: soft,
      borderColor: COUNSELOR_TEAL,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    createdStatusPillText: {
      color: COUNSELOR_TEAL,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    callerTag: {
      backgroundColor: dark ? '#1A2333' : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      flexShrink: 1,
    },
    callerTagText: {
      color: c.text,
      fontSize: 11,
      fontWeight: '600',
    },
    leadDateMeta: {
      color: c.muted,
      fontSize: 11,
    },
  });
};
