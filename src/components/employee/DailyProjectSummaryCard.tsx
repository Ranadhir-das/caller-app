import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/context/AppThemeContext';
import {
  calculateDailyProjectSummary,
  type RawProjectEntryInput,
} from '@/services/durationAccounting';

export interface DailyProjectSummaryCardProps {
  title?: string;
  date?: string;
  isDraft?: boolean;
  isSubmitted?: boolean;
  entries: RawProjectEntryInput[];
  style?: StyleProp<ViewStyle>;
}

export function DailyProjectSummaryCard({
  title = 'Work Summary',
  date,
  isDraft = false,
  isSubmitted = false,
  entries,
  style,
}: DailyProjectSummaryCardProps) {
  const { colors, mode } = useAppTheme();
  const summary = calculateDailyProjectSummary(entries);

  const statusBg = isSubmitted
    ? colors.successSoft
    : isDraft
    ? colors.accentSoft
    : colors.surface;
  const statusColor = isSubmitted
    ? mode === 'dark'
      ? colors.success
      : '#047857'
    : colors.primary;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isSubmitted ? colors.primary : colors.border,
        },
        style,
      ]}
    >
      {/* Header with Title, Date, and Status Badge */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {!!date && <Text style={[styles.dateText, { color: colors.muted }]}>{date}</Text>}
        </View>

        {(isSubmitted || isDraft) && (
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {isSubmitted ? '✓ Submitted' : 'Draft / Unsaved'}
            </Text>
          </View>
        )}
      </View>

      {/* Metrics Row: Total Time, Projects, Entries */}
      <View
        style={[
          styles.metricsContainer,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        {/* Metric 1: Total Duration */}
        <View style={styles.metricBox}>
          <Text style={[styles.metricLabel, { color: colors.muted }]}>Total Time</Text>
          <Text style={[styles.metricValue, { color: colors.primary }]}>
            {summary.formattedTotal}
          </Text>
          {summary.hasIncompleteDurations && (
            <Text style={[styles.incompleteWarning, { color: colors.warning }]}>
              ⚠️ {summary.incompleteEntriesCount} unrecorded
            </Text>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Metric 2: Projects Count */}
        <View style={styles.metricBox}>
          <Text style={[styles.metricLabel, { color: colors.muted }]}>Projects</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {summary.projectsCount}
          </Text>
          <Text style={[styles.metricSubtext, { color: colors.muted }]}>worked on</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Metric 3: Entries Count */}
        <View style={styles.metricBox}>
          <Text style={[styles.metricLabel, { color: colors.muted }]}>Entries</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {summary.entriesCount}
          </Text>
          <Text style={[styles.metricSubtext, { color: colors.muted }]}>sessions</Text>
        </View>
      </View>

      {/* Breakdown Pills: Linked vs Unlinked */}
      {(summary.linkedEntriesCount > 0 || summary.unlinkedEntriesCount > 0) && (
        <View style={styles.breakdownRow}>
          {summary.linkedEntriesCount > 0 && (
            <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.pillText, { color: colors.primary }]}>
                🔗 {summary.linkedEntriesCount} Linked
              </Text>
            </View>
          )}
          {summary.unlinkedEntriesCount > 0 && (
            <View
              style={[
                styles.pill,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.pillText, { color: colors.muted }]}>
                📄 {summary.unlinkedEntriesCount} Unlinked
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricsContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  metricSubtext: {
    fontSize: 10,
  },
  incompleteWarning: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  divider: {
    width: 1,
    height: '60%',
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
