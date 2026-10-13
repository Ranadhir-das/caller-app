import { apiRequest, API_BASE_URL } from '@/services/api';

export interface DashboardFollowUp {
  id: number;
  lead: number | null;
  lead_name: string | null;
  lead_phone: string | null;
  phone_number: string;
  caller: number;
  scheduled_at: string;
  status: string;
  notes: string;
}

export function followUpCategory(scheduledAt: string, now = new Date()) {
  const date = new Date(scheduledAt);
  if (date.getTime() < now.getTime()) return 'Overdue';
  return date.toDateString() === now.toDateString() ? 'Due today' : 'Upcoming';
}

export function isDueFollowUp(item: DashboardFollowUp, now = Date.now()) {
  return item.status === 'PENDING' && Date.parse(item.scheduled_at) <= now;
}

export async function loadFollowUps(token: string, dueOnly = false): Promise<DashboardFollowUp[]> {
  let endpoint: string | null = dueOnly ? '/mobile/follow-ups/?due=true' : '/mobile/follow-ups/';
  const seen = new Set<string>();
  const records = new Map<number, DashboardFollowUp>();
  while (endpoint && !seen.has(endpoint)) {
    seen.add(endpoint);
    const page: DashboardFollowUp[] | { results: DashboardFollowUp[]; next: string | null } =
      await apiRequest(endpoint, { token });
    for (const item of Array.isArray(page) ? page : page.results) {
      if (item.status === 'PENDING' && Number.isFinite(Date.parse(item.scheduled_at)) && (!dueOnly || isDueFollowUp(item))) records.set(item.id, item);
    }
    const next: string | null = Array.isArray(page) ? null : page.next;
    if (!next) break;
    // Never send the session token to an arbitrary pagination host/path.
    const url: URL = new URL(next, `${API_BASE_URL}/mobile/follow-ups/`);
    const base = new URL(API_BASE_URL);
    if (url.origin !== base.origin || url.pathname !== `${base.pathname}/mobile/follow-ups/`) {
      throw new Error('Invalid follow-up pagination URL');
    }
    if (dueOnly) url.searchParams.set('due', 'true');
    endpoint = `/mobile/follow-ups/${url.search}`;
  }
  return [...records.values()].sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
}

export async function completeFollowUp(token: string, id: number) {
  await apiRequest(`/followups/${id}/update/`, { token, method: 'PATCH', body: { status: 'COMPLETED' } });
}
