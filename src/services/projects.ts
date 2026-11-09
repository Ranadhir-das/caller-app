import { apiRequest } from './api';
import {
  convertHoursMinutesToTotalMinutes,
  formatMinutesToDuration,
} from './durationAccounting';

export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type ProjectStatus =
  | 'ASSIGNED'
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'PENDING_REVIEW'
  | 'NEEDS_CHANGES'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED';

export type ProjectWorkReportSummary = {
  id: number;
  client_entry_id: string | null;
  work_date: string;
  duration_minutes: number;
  duration_formatted: string;
  description: string;
  status: string;
  reference_link: string;
  employee__username: string;
};

export type Project = {
  id: number;
  title: string;
  description: string;
  status: ProjectStatus;
  status_display: string;
  priority: ProjectPriority;
  priority_display: string;
  due_date: string | null;
  self_created: boolean;
  created_at: string;
  can_request_completion: boolean;
  is_overdue: boolean;
  review_comments: string;
  completion_requested_at: string | null;
};

export type ProjectDetail = Project & {
  work_reports: ProjectWorkReportSummary[];
};

export type CreateProjectPayload = {
  title: string;
  description?: string;
  due_date?: string | null;
  priority?: ProjectPriority;
};

export type UpdateProjectStatusPayload = {
  status: ProjectStatus;
  reopen_reason?: string;
};

/**
 * Fetch list of accessible projects for the authenticated employee.
 * Filterable by optional project status.
 */
export async function getProjects(
  token: string,
  statusFilter?: string,
  signal?: AbortSignal,
): Promise<{ projects: Project[] }> {
  const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return apiRequest<{ projects: Project[] }>(`/mobile/employee/projects/${query}`, {
    token,
    signal,
  });
}

/**
 * Create a new self-created project assigned to the current employee.
 */
export async function createProject(
  token: string,
  payload: CreateProjectPayload,
): Promise<Project> {
  return apiRequest<Project>('/mobile/employee/projects/', {
    token,
    method: 'POST',
    body: payload,
  });
}

/**
 * Fetch detailed project data, including recent relational work sessions.
 */
export async function getProjectDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<ProjectDetail> {
  return apiRequest<ProjectDetail>(`/mobile/employee/projects/${id}/`, {
    token,
    signal,
  });
}

/**
 * Update project lifecycle status (e.g. STARTED -> IN_PROGRESS).
 */
export async function updateProjectStatus(
  token: string,
  id: number,
  payload: UpdateProjectStatusPayload,
): Promise<{ status: ProjectStatus; detail?: string }> {
  return apiRequest<{ status: ProjectStatus; detail?: string }>(
    `/mobile/employee/projects/${id}/`,
    {
      token,
      method: 'PATCH',
      body: payload,
    },
  );
}

/**
 * Explicitly request management completion review for an active project.
 * Transitions project to PENDING_REVIEW and logs an audit trail on the backend.
 */
export async function requestProjectCompletion(
  token: string,
  id: number,
): Promise<{ id: number; status: ProjectStatus; detail: string }> {
  return apiRequest<{ id: number; status: ProjectStatus; detail: string }>(
    `/mobile/employee/projects/${id}/request-completion/`,
    {
      token,
      method: 'POST',
    },
  );
}

// ---------------------------------------------------------------------------
// Presentation Helpers
// ---------------------------------------------------------------------------

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ASSIGNED: 'Assigned',
  STARTED: 'Started',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  NEEDS_CHANGES: 'Needs Changes',
  COMPLETED: 'Completed',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled',
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export function formatProjectDate(isoDateStr?: string | null): string {
  if (!isoDateStr) return 'Not set';
  try {
    const d = new Date(isoDateStr.includes('T') ? isoDateStr : `${isoDateStr}T00:00:00`);
    if (isNaN(d.getTime())) return isoDateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoDateStr;
  }
}

export function formatProjectDateTime(isoDateTimeStr?: string | null): string {
  if (!isoDateTimeStr) return '-';
  try {
    const d = new Date(isoDateTimeStr);
    if (isNaN(d.getTime())) return isoDateTimeStr;
    const datePart = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  } catch {
    return isoDateTimeStr;
  }
}

// ---------------------------------------------------------------------------
// Work Report & Idempotency Helpers (Phase 2C)
// ---------------------------------------------------------------------------

export type ProjectWorkReportStatus = 'In Progress' | 'Completed' | 'Pending';

export const PROJECT_WORK_STATUSES: ProjectWorkReportStatus[] = [
  'In Progress',
  'Completed',
  'Pending',
];

export type ProjectWorkEntryForm = {
  clientId: string; // client_entry_id UUID (strictly preserved on edit and retry)
  projectId: number | null;
  projectName: string;
  hours: string;
  minutes: string;
  status: ProjectWorkReportStatus;
  expectedCompletionDate: string;
  notes: string;
  referenceLink: string;
  photo?: string | null;
  photoName?: string | null;
};

export type ProjectReportPayloadItem = {
  entry_id: string;
  client_entry_id: string;
  project_id: number | null;
  project_name: string;
  duration_minutes: number;
  duration: string;
  status: ProjectWorkReportStatus;
  expected_completion_date: string;
  notes: string;
  reference_link?: string;
  photo?: string;
};

/**
 * Generate RFC4122 v4 UUID for client-side entry idempotency.
 * Fallback to robust random generator if crypto.randomUUID is unsupported in JS engine.
 */
export function generateClientEntryId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a fresh project work entry state initialized with a unique client UUID.
 */
export function createEmptyProjectWorkEntry(
  initialProjectId: number | null = null,
  initialProjectName: string = '',
): ProjectWorkEntryForm {
  return {
    clientId: generateClientEntryId(),
    projectId: initialProjectId,
    projectName: initialProjectName,
    hours: '',
    minutes: '',
    status: 'In Progress',
    expectedCompletionDate: '',
    notes: '',
    referenceLink: '',
    photo: null,
    photoName: null,
  };
}

/**
 * Validates a single project work entry card.
 */
export function validateProjectWorkEntry(
  entry: ProjectWorkEntryForm,
  index: number = 0,
): { valid: boolean; error?: string } {
  const cardLabel = `Project ${index + 1}: `;
  if (!entry.projectName.trim()) {
    return { valid: false, error: `${cardLabel}Please enter or select a project name.` };
  }
  const totalMinutes = convertHoursMinutesToTotalMinutes(entry.hours, entry.minutes);
  if (totalMinutes <= 0) {
    return { valid: false, error: `${cardLabel}Please specify work duration (at least 1 minute).` };
  }
  if (totalMinutes > 1440) {
    return { valid: false, error: `${cardLabel}Work duration cannot exceed 24 hours (1440 minutes).` };
  }
  if (entry.status !== 'Completed' && !entry.expectedCompletionDate.trim()) {
    return { valid: false, error: `${cardLabel}Please select an expected completion date.` };
  }
  if (entry.referenceLink.trim()) {
    const link = entry.referenceLink.trim();
    if (!/^https?:\/\//i.test(link)) {
      return { valid: false, error: `${cardLabel}Reference link must start with http:// or https://.` };
    }
  }
  return { valid: true };
}

/**
 * Validates all project work entries in the report form.
 */
export function validateAllProjectWorkEntries(
  entries: ProjectWorkEntryForm[],
): { valid: boolean; error?: string } {
  if (!entries || entries.length === 0) {
    return { valid: false, error: 'Please add at least one project work entry.' };
  }
  for (let i = 0; i < entries.length; i++) {
    const res = validateProjectWorkEntry(entries[i], i);
    if (!res.valid) return res;
  }
  return { valid: true };
}

/**
 * Builds the canonical project_reports payload item for submission to the API.
 */
export function buildProjectReportPayloadItem(
  entry: ProjectWorkEntryForm,
): ProjectReportPayloadItem {
  const totalMinutes = convertHoursMinutesToTotalMinutes(entry.hours, entry.minutes);
  const isCompleted = entry.status === 'Completed';

  let cleanPhoto: string | undefined = undefined;
  if (entry.photo && typeof entry.photo === 'string') {
    const trimmed = entry.photo.trim();
    if (trimmed.length > 0) {
      cleanPhoto = trimmed.includes(',') ? trimmed.split(',')[1] : trimmed;
    }
  }

  return {
    entry_id: entry.clientId,
    client_entry_id: entry.clientId,
    project_id: entry.projectId,
    project_name: entry.projectName.trim(),
    duration_minutes: totalMinutes,
    duration: formatMinutesToDuration(totalMinutes),
    status: entry.status,
    expected_completion_date: isCompleted ? '' : entry.expectedCompletionDate.trim(),
    notes: entry.notes.trim(),
    ...(entry.referenceLink.trim() ? { reference_link: entry.referenceLink.trim() } : {}),
    ...(cleanPhoto ? { photo: cleanPhoto } : {}),
  };
}

export {
  convertHoursMinutesToTotalMinutes,
  formatMinutesToDuration,
  parseDurationToMinutes,
  getEntryDurationInfo,
  calculateDailyProjectSummary,
  type EntryDurationInfo,
  type RawProjectEntryInput,
  type DailyProjectSummary,
} from './durationAccounting';
