import { apiRequest, ApiError } from './api';

export type CounsellingType = 'WALK_IN' | 'ONLINE' | 'GOOGLE_MEET';

export type CounsellingRecord = {
  id: number;
  lead_id: number | null;
  visitor_name?: string;
  visitor_phone?: string;
  visitor_email?: string;
  visitor_source?: string;
  source?: string;
  lead_name: string;
  lead_phone: string;
  caller_id: number;
  caller_name: string;
  counselling_type: CounsellingType;
  counselling_type_display: string;
  college?: string;
  course?: string;
  conducted_at: string;
  notes?: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

export type CreateCounsellingPayload = {
  lead_id?: number;
  visitor_name?: string;
  visitor_phone?: string;
  visitor_email?: string;
  visitor_source?: string;
  source?: string;
  counselling_type?: CounsellingType;
  college?: string;
  course?: string;
  conducted_at?: string;
  notes?: string;
};

export type LeadCounsellingResponse = {
  lead_id: number;
  lead_name: string;
  counsellings: CounsellingRecord[];
};

export type CounsellingListResponse = {
  total: number;
  counsellings: CounsellingRecord[];
};

/**
 * Fetch counselling sessions for a specific lead.
 */
export async function getLeadCounsellings(
  token: string,
  leadId: number | string
): Promise<LeadCounsellingResponse> {
  return apiRequest<LeadCounsellingResponse>(`/mobile/counselling/?lead_id=${leadId}`, {
    token,
  });
}

/**
 * Fetch all counselling sessions for the logged-in caller.
 */
export async function getCallerCounsellings(
  token: string,
  search?: string
): Promise<CounsellingListResponse> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<CounsellingListResponse>(`/mobile/counselling/${query}`, {
    token,
  });
}

/**
 * Record a counselling session for an authorized lead.
 */
export async function createCounselling(
  token: string,
  payload: CreateCounsellingPayload
): Promise<{ success: boolean; message: string; counselling: CounsellingRecord }> {
  try {
    return await apiRequest<{ success: boolean; message: string; counselling: CounsellingRecord }>(
    '/mobile/counselling/',
    {
      method: 'POST',
      token,
      body: payload,
    }
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 400 && error.details && typeof error.details === 'object') {
      const fields = error.details as Record<string, unknown>;
      if (!payload.lead_id && payload.visitor_name && Array.isArray(fields.lead_id)
        && fields.lead_id.some(message => typeof message === 'string' && /required/i.test(message))) {
        throw new Error('This CRM server still requires an existing lead. Update the backend counselling API and apply migration 0020 to enable new visitors.');
      }
      const labels: Record<string, string> = { visitor_name: 'Visitor name', visitor_phone: 'Phone number',
        visitor_email: 'Email', visitor_source: 'Source', source: 'Source', lead_id: 'Student', counselling_type: 'Counselling type', conducted_at: 'Counselling date' };
      const messages = Object.entries(fields).flatMap(([field, value]) =>
        Array.isArray(value) && typeof value[0] === 'string'
          ? [`${labels[field] ?? field.replace(/_/g, ' ')}: ${value[0]}`] : []);
      if (messages.length) throw new Error(messages.join('\n'));
    }
    throw error;
  }
}

// Compatibility for existing callers of the original service function.
export const createWalkInCounselling = createCounselling;
