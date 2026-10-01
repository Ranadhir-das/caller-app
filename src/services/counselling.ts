import { apiRequest } from './api';

export type CounsellingType = 'WALK_IN' | 'ONLINE';

export type CounsellingRecord = {
  id: number;
  lead_id: number;
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
  lead_id: number;
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
 * Record a Walk-in Counselling event for an authorized lead.
 */
export async function createWalkInCounselling(
  token: string,
  payload: CreateCounsellingPayload
): Promise<{ success: boolean; message: string; counselling: CounsellingRecord }> {
  return apiRequest<{ success: boolean; message: string; counselling: CounsellingRecord }>(
    '/mobile/counselling/',
    {
      method: 'POST',
      token,
      body: payload,
    }
  );
}
