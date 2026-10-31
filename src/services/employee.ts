import { apiRequest } from './api';

export type AttendanceRequestType = 'LATE_ARRIVAL' | 'EARLY_SHIFT_END';

export type AttendanceRequestItem = {
  id: number;
  date: string;
  request_type: AttendanceRequestType | string;
  request_type_display: string;
  reason: string;
  requested_start: string | null;
  requested_end: string | null;
  requested_net_hours: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  status_display: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_notes: string;
  created_at: string;
};

export type CreateAttendanceRequestPayload = {
  date: string;
  request_type: AttendanceRequestType | string;
  reason: string;
  requested_start?: string | null;
  requested_end?: string | null;
  requested_net_hours?: string | null;
  session_id?: string | number | null;
};

export async function getAttendanceRequests(
  token: string,
  status?: string,
): Promise<{ requests: AttendanceRequestItem[] }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<{ requests: AttendanceRequestItem[] }>(
    `/mobile/employee/attendance-requests/${query}`,
    { token },
  );
}

export async function submitAttendanceRequest(
  token: string,
  payload: CreateAttendanceRequestPayload,
): Promise<AttendanceRequestItem> {
  return apiRequest<AttendanceRequestItem>('/mobile/employee/attendance-requests/', {
    token,
    method: 'POST',
    body: payload,
  });
}

export async function cancelAttendanceRequest(token: string, id: number): Promise<void> {
  await apiRequest<void>(`/mobile/employee/attendance-requests/${id}/`, {
    token,
    method: 'DELETE',
  });
}

