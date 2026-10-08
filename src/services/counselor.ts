import { apiRequest } from './api';

/** Counselor workflow API + pure helpers. Counselors never touch caller outcomes, course or year. */

export type CounselorAvailability = 'ONLINE' | 'CHECKED_IN' | 'ON_LEAVE' | 'OFFLINE';

export type CounselorOption = {
  id: number;
  name: string;
  initials: string;
  designation?: string;
  availability: CounselorAvailability;
  availability_label: string;
  active_leads: number;
};

export type CounselorAssignment = {
  id: number;
  counselor_id: number;
  counselor_name: string;
  counselor_initials: string;
  forwarded_at: string;
  forwarded_by_name: string;
};

export type LeadCounselorState = {
  lead_id: number;
  assignment: CounselorAssignment | null;
  can_forward: boolean;
  reason: string;
};

export type CounselorContactStatus = 'PENDING' | 'CONTACTED';

export type CounselorLeadSummary = {
  id: number;
  name: string;
  phone: string;
  status: string;
  status_display: string;
  source: string;
  location: string;
  course_label: string;
  expected_admission_year: number | null;
  caller_name: string;
  forwarded_at: string;
  counselled: boolean | null;
  counselor_contact_status: CounselorContactStatus;
  last_contacted_at: string | null;
  last_call_duration: number | null;
  counselor_call_count: number;
};

export type CounselorActivity = { type: string; lead_id: number; lead_name: string; text: string; at: string };

export type CounselorDashboard = {
  counselor: { id: number; name: string; initials: string };
  stats: {
    forwarded_leads: number;
    assigned_leads?: number;
    pending_leads?: number;
    contacted_leads?: number;
    today_contacted: number;
    pending_counselling: number;
    admission_requests: number;
  };
  recent_leads: CounselorLeadSummary[];
  activity: CounselorActivity[];
};

export type CounselorNote = {
  id: number;
  kind: 'CALL' | 'NOTE';
  kind_display: string;
  body: string;
  counselor_name: string;
  duration_seconds: number;
  call_started_at: string | null;
  created_at: string;
};

export type AdmissionRequestItem = {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  status_display: string;
  message: string;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
};

export type CounselorLeadDetail = {
  lead: {
    id: number; name: string; phone: string; email: string; location: string; college: string; source: string;
    campaign: string; service: string; preferred_intake: string; status: string; status_display: string;
    notes: string; created_at: string;
    counselor_contact_status?: CounselorContactStatus;
    last_contacted_at?: string | null;
    last_call_duration?: number | null;
    counselor_call_count?: number;
  };
  counselor_contact_status: CounselorContactStatus;
  last_contacted_at: string | null;
  last_call_duration: number | null;
  counselor_call_count: number;
  interested: {
    call_id: number; course_label: string; expected_admission_year: number | null; recorded_at: string;
  } | null;
  caller: { id: number | null; name: string; forwarded_by_name: string };
  assignment: CounselorAssignment;
  calls: {
    id: number; outcome: string; outcome_display: string; notes: string; caller_name: string;
    started_at: string; duration_seconds: number; course_label: string; expected_admission_year: number | null;
  }[];
  counsellings: { id: number; type_display: string; notes: string; course: string; college: string; caller_name: string; conducted_at: string }[];
  counselor_notes: CounselorNote[];
  admission_requests: AdmissionRequestItem[];
  has_pending_admission_request: boolean;
  permissions: { can_edit_lead: false; can_forward: false };
};

export type CounselorCallTiming = { started_at: string; ended_at: string; duration_seconds: number };

export function isCounselor(user?: { role?: string | null } | null): boolean {
  return (user?.role || '').toUpperCase() === 'COUNSELOR';
}

/** Counselors land in their own workspace; everyone else keeps the existing '/employee' landing. */
export function homeRouteFor(user?: { role?: string | null; needs_onboarding?: boolean } | null): '/counselor' | '/employee' {
  return isCounselor(user) && !user?.needs_onboarding ? '/counselor' : '/employee';
}

/** Routes a counselor may open: their workspace plus shared employee/account screens. */
export const COUNSELOR_ROUTES = ['/counselor', '/counselor/index', '/counselor/leads', '/counselor/more',
  '/counselor-lead', '/counselor-note'];

/** Mirrors the backend rule; the server remains the authority. */
export function canOfferForward(user: { role?: string | null } | null | undefined, outcome: string, leadId: number | null | undefined): boolean {
  return (user?.role || '').toUpperCase() === 'CALLER' && outcome.toUpperCase() === 'INTERESTED' && leadId != null;
}

export function availabilityTone(availability: CounselorAvailability): 'success' | 'warning' | 'danger' | 'muted' {
  if (availability === 'ONLINE') return 'success';
  if (availability === 'CHECKED_IN') return 'warning';
  if (availability === 'ON_LEAVE') return 'danger';
  return 'muted';
}

export function contactStatusTone(status?: CounselorContactStatus | string | null): 'warning' | 'success' {
  return (status || '').toUpperCase() === 'CONTACTED' ? 'success' : 'warning';
}

export function formatContactTime(iso?: string | null): string {
  if (!iso) return 'Never contacted';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Never contacted';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return `${date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}, ${timeStr}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}m ${total % 60}s` : `${total}s`;
}

/** Notes-only payload: never includes outcome, course, year or follow-up fields. */
export function buildCounselorNotePayload(notes: string, clientEventId: string, call?: CounselorCallTiming | null) {
  const body: { notes: string; client_event_id: string; call?: CounselorCallTiming } = {
    notes: notes.trim(), client_event_id: clientEventId,
  };
  if (call) body.call = { ...call, duration_seconds: Math.max(0, Math.floor(call.duration_seconds || 0)) };
  return body;
}

export const counselorApi = {
  directory: (token: string) => apiRequest<{ counselors: CounselorOption[] }>('/mobile/counselors/', { token }),
  leadState: (token: string, leadId: number | string) =>
    apiRequest<LeadCounselorState>(`/mobile/leads/${encodeURIComponent(String(leadId))}/counselor/`, { token }),
  forward: (token: string, leadId: number | string, counselorId: number) =>
    apiRequest<{ success: boolean; changed: boolean; message: string; assignment: CounselorAssignment }>(
      `/mobile/leads/${encodeURIComponent(String(leadId))}/forward-counselor/`,
      { token, method: 'POST', body: { counselor_id: counselorId } }),
  dashboard: (token: string) => apiRequest<CounselorDashboard>('/mobile/counselor/dashboard/', { token }),
  leads: (token: string, search = '') =>
    apiRequest<{ total: number; leads: CounselorLeadSummary[] }>(
      `/mobile/counselor/leads/${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`, { token }),
  lead: (token: string, leadId: number | string) =>
    apiRequest<CounselorLeadDetail>(`/mobile/counselor/leads/${encodeURIComponent(String(leadId))}/`, { token }),
  addNote: (token: string, leadId: number | string, body: ReturnType<typeof buildCounselorNotePayload>) =>
    apiRequest<{ success: boolean; created: boolean; note: CounselorNote }>(
      `/mobile/counselor/leads/${encodeURIComponent(String(leadId))}/notes/`, { token, method: 'POST', body }),
  requestAdmission: (token: string, leadId: number | string, message: string) =>
    apiRequest<{ success: boolean; message: string; admission_request: AdmissionRequestItem }>(
      `/mobile/counselor/leads/${encodeURIComponent(String(leadId))}/admission-request/`,
      { token, method: 'POST', body: { message: message.trim() } }),
};

/** Calm teal palette that visually separates the counselor workspace from the blue caller app. */
export const COUNSELOR_TEAL = '#0F766E';
export const COUNSELOR_TEAL_SOFT_LIGHT = '#E6F4F1';
export const COUNSELOR_TEAL_SOFT_DARK = '#0B2A27';
