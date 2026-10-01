import { apiRequest } from './api';

export type CandidateType = 'LEAD' | 'WALK_IN';

export type AdmissionRecord = {
  id: number;
  candidate_type: CandidateType;
  candidate_type_display?: string;
  country?: string;
  lead_id: number;
  lead_name: string;
  lead_phone: string;
  lead_email?: string;
  walk_in_name?: string;
  walk_in_phone?: string;
  walk_in_email?: string;
  batch_id?: number | null;
  batch_name: string;
  college: string;
  course: string;
  admission_date: string;
  fees?: string | null;
  notes?: string;
  created_by_name: string;
  created_from: 'APP' | 'CRM';
  created_at: string;
  updated_at: string;
};

export type AdmissionsSummary = {
  total: number;
  today: number;
  this_week: number;
  this_month: number;
  leads_count?: number;
  walkins_count?: number;
};

export type AdmissionsResponse = {
  summary: AdmissionsSummary;
  admissions: AdmissionRecord[];
};

export type CreateAdmissionPayload = {
  candidate_type?: CandidateType;
  lead_id?: number | null;
  name?: string;
  phone?: string;
  email?: string;
  country?: string;
  college?: string;
  course?: string;
  admission_date?: string;
  fees?: number | string | null;
  notes?: string;
};

export type SearchLeadResult = {
  id: number;
  name: string;
  phone: string;
  college?: string;
  location?: string;
  preferred_intake?: string;
  status: string;
  status_display: string;
};

export async function getCallerAdmissions(
  token: string,
  params?: {
    period?: 'all' | 'today' | 'week' | 'month';
    candidate_type?: 'all' | 'LEAD' | 'WALK_IN';
    search?: string;
  }
): Promise<AdmissionsResponse> {
  const queryParts: string[] = [];
  if (params?.period && params.period !== 'all') {
    queryParts.push(`period=${encodeURIComponent(params.period)}`);
  }
  if (params?.candidate_type && params.candidate_type !== 'all') {
    queryParts.push(`candidate_type=${encodeURIComponent(params.candidate_type)}`);
  }
  if (params?.search && params.search.trim()) {
    queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);
  }
  const qStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return apiRequest<AdmissionsResponse>(`/mobile/admissions/${qStr}`, { token });
}

export async function createAdmission(
  token: string,
  payload: CreateAdmissionPayload
): Promise<{ success: boolean; admission: AdmissionRecord }> {
  return apiRequest<{ success: boolean; admission: AdmissionRecord }>('/mobile/admissions/', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function searchLeadsForAdmission(
  token: string,
  query: string
): Promise<SearchLeadResult[]> {
  const qStr = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiRequest<SearchLeadResult[]>(`/mobile/admissions/search-leads/${qStr}`, { token });
}
