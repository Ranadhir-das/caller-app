/**
 * Helper to convert hours and minutes inputs to total integer minutes.
 */
export function convertHoursMinutesToTotalMinutes(
  hours: number | string,
  minutes: number | string,
): number {
  const h = typeof hours === 'number' ? hours : parseInt(String(hours || '0').trim(), 10) || 0;
  const m = typeof minutes === 'number' ? minutes : parseInt(String(minutes || '0').trim(), 10) || 0;
  return Math.max(0, h * 60 + m);
}

/**
 * Formats integer minutes into a readable duration string, e.g. '2h 30m', '1h', or '45m'.
 */
export function formatMinutesToDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Parse string duration into integer minutes strictly, matching backend parse_duration_to_minutes.
 */
export function parseDurationToMinutes(durationStr?: string | number | null): number {
  if (durationStr === null || durationStr === undefined) return 0;
  if (typeof durationStr === 'number') {
    return durationStr > 0 ? Math.min(1440, Math.round(durationStr)) : 0;
  }
  const s = String(durationStr).trim().toLowerCase();
  if (!s) return 0;

  // If plain integer string
  if (/^\d+$/.test(s)) {
    return Math.min(1440, parseInt(s, 10));
  }

  const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)/);

  let total = 0;
  if (hourMatch) {
    total += parseFloat(hourMatch[1]) * 60;
  }
  if (minMatch) {
    total += parseFloat(minMatch[1]);
  }
  return Math.min(1440, Math.round(total));
}

export interface EntryDurationInfo {
  /** Canonical integer minutes, or null if duration is missing/invalid */
  minutes: number | null;
  /** Human-readable duration string, e.g. '2h 30m', or 'Duration not recorded' */
  formatted: string;
  /** True if duration is missing, zero, or invalid */
  isIncomplete: boolean;
}

export interface RawProjectEntryInput {
  entry_id?: string;
  client_entry_id?: string;
  project_id?: number | null;
  project_name?: string;
  duration_minutes?: number | null;
  duration?: string | null;
  hours?: string | number | null;
  minutes?: string | number | null;
  status?: string;
  notes?: string;
  reference_link?: string;
  expected_completion_date?: string;
}

export interface DailyProjectSummary {
  /** Sum of all valid entry durations in integer minutes */
  totalMinutes: number;
  /** Human-readable total duration string, e.g. '3h 45m' */
  formattedTotal: string;
  /** Total number of unique entries in this report */
  entriesCount: number;
  /** Number of distinct projects worked on */
  projectsCount: number;
  /** Number of entries with missing or invalid duration */
  incompleteEntriesCount: number;
  /** True if any entries have missing/invalid duration */
  hasIncompleteDurations: boolean;
  /** Number of relationally linked entries (project_id !== null) */
  linkedEntriesCount: number;
  /** Number of unlinked / legacy entries (project_id === null) */
  unlinkedEntriesCount: number;
  /** Distinct project details */
  distinctProjects: { id: number | null; name: string }[];
}

/**
 * Authoritatively resolves duration information for an individual entry.
 * Never silently invents missing duration; flags incomplete data.
 */
export function getEntryDurationInfo(entry: RawProjectEntryInput): EntryDurationInfo {
  // 1. Direct canonical integer duration_minutes (highest precedence)
  if (
    typeof entry.duration_minutes === 'number' &&
    Number.isInteger(entry.duration_minutes) &&
    entry.duration_minutes > 0
  ) {
    return {
      minutes: entry.duration_minutes,
      formatted: formatMinutesToDuration(entry.duration_minutes),
      isIncomplete: false,
    };
  }

  // 2. Structured form fields: hours & minutes
  if (entry.hours !== undefined && entry.hours !== null || entry.minutes !== undefined && entry.minutes !== null) {
    const total = convertHoursMinutesToTotalMinutes(entry.hours || 0, entry.minutes || 0);
    if (total > 0) {
      return {
        minutes: total,
        formatted: formatMinutesToDuration(total),
        isIncomplete: false,
      };
    }
  }

  // 3. String duration (e.g. legacy '2h 30m', '90 mins')
  if (entry.duration && typeof entry.duration === 'string' && entry.duration.trim()) {
    const parsed = parseDurationToMinutes(entry.duration);
    if (parsed > 0) {
      return {
        minutes: parsed,
        formatted: formatMinutesToDuration(parsed),
        isIncomplete: false,
      };
    }
  }

  // 4. Missing, zero, or malformed duration
  return {
    minutes: null,
    formatted: 'Duration not recorded',
    isIncomplete: true,
  };
}

/**
 * Calculates authoritative daily project summary without double-counting.
 * Uses a single authoritative representation, deduplicating by UUID if present.
 */
export function calculateDailyProjectSummary(
  entries?: RawProjectEntryInput[] | null,
): DailyProjectSummary {
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return {
      totalMinutes: 0,
      formattedTotal: '0m',
      entriesCount: 0,
      projectsCount: 0,
      incompleteEntriesCount: 0,
      hasIncompleteDurations: false,
      linkedEntriesCount: 0,
      unlinkedEntriesCount: 0,
      distinctProjects: [],
    };
  }

  // Deduplicate entries by client_entry_id / entry_id to prevent double counting
  const seenIds = new Set<string>();
  const uniqueEntries: RawProjectEntryInput[] = [];

  for (const entry of entries) {
    const id = (entry.client_entry_id || entry.entry_id || '').trim();
    if (id) {
      if (seenIds.has(id)) {
        continue; // Skip duplicate instance
      }
      seenIds.add(id);
    }
    uniqueEntries.push(entry);
  }

  let totalMinutes = 0;
  let incompleteCount = 0;
  let linkedCount = 0;
  let unlinkedCount = 0;

  const projectMap = new Map<string, { id: number | null; name: string }>();

  for (const entry of uniqueEntries) {
    const durInfo = getEntryDurationInfo(entry);
    if (durInfo.isIncomplete || durInfo.minutes === null) {
      incompleteCount++;
    } else {
      totalMinutes += durInfo.minutes;
    }

    const rawId = entry.project_id;
    const pId = rawId !== undefined && rawId !== null ? Number(rawId) : null;
    const pName = (entry.project_name || '').trim() || (pId !== null ? `Project #${pId}` : 'Untitled Project');

    if (pId !== null && !isNaN(pId)) {
      linkedCount++;
      projectMap.set(`id_${pId}`, { id: pId, name: pName });
    } else {
      unlinkedCount++;
      projectMap.set(`name_${pName.toLowerCase()}`, { id: null, name: pName });
    }
  }

  return {
    totalMinutes,
    formattedTotal: formatMinutesToDuration(totalMinutes),
    entriesCount: uniqueEntries.length,
    projectsCount: projectMap.size,
    incompleteEntriesCount: incompleteCount,
    hasIncompleteDurations: incompleteCount > 0,
    linkedEntriesCount: linkedCount,
    unlinkedEntriesCount: unlinkedCount,
    distinctProjects: Array.from(projectMap.values()),
  };
}
