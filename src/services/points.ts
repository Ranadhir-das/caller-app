import { apiRequest } from './api';

export type PeerAppreciationSummary = {
  month: string;
  average_score: number | null;
  review_count: number;
};

export type PeerReviewEmployee = {
  id: number;
  name: string;
  username: string;
  designation: string;
};

export type PeerAppreciationStatus = {
  month: string;
  is_eligible: boolean;
  is_complete: boolean;
  total_peers: number;
  completed_count: number;
  remaining_count: number;
  pending_employees: PeerReviewEmployee[];
  summary?: PeerAppreciationSummary;
};

export type PointsBreakupCategory = {
  event: string;
  event_display: string;
  points: number;
  count: number;
  percentage: number;
};

export type PointsLedgerItem = {
  id: number;
  caller?: number;
  event: string;
  event_display: string;
  points: number;
  formatted_points?: string;
  reason: string;
  occurred_at: string;
  created_at?: string;
  running_balance?: number;
  lead?: number | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  call?: number | null;
  call_outcome?: string | null;
  call_duration?: number | null;
  followup?: number | null;
  counselling?: number | null;
  admission?: number | null;
  is_positive?: boolean;
  is_negative?: boolean;
};

export type PointsSummary = {
  lifetime_points?: number;
  performance_points?: number;
  total_points: number;
  daily_points: number;
  weekly_points: number;
  monthly_points: number;
  positive_points?: number;
  negative_points?: number;
  lifetime_earned?: number;
  lifetime_deducted?: number;
  current_balance?: number;
  today_earned?: number;
  today_deducted?: number;
  today_net?: number;
  peer_appreciation?: PeerAppreciationSummary;
  breakup?: PointsBreakupCategory[];
  earned_breakup?: PointsBreakupCategory[];
  deduction_breakup?: PointsBreakupCategory[];
  lifetime_breakup?: PointsBreakupCategory[];
  lifetime_earned_breakup?: PointsBreakupCategory[];
  lifetime_deduction_breakup?: PointsBreakupCategory[];
  talk_time_summary?: {
    total_seconds: number;
    formatted_talk_time: string;
    connected_calls: number;
    average_duration_seconds: number;
    formatted_avg_duration: string;
  };
};

export type CallerPoints = {
  caller: number;
  start?: string | null;
  end_exclusive?: string | null;
  interval?: string;
  count?: number;
  next?: string | null;
  previous?: string | null;
  breakup?: PointsBreakupCategory[];
  earned_breakup?: PointsBreakupCategory[];
  deduction_breakup?: PointsBreakupCategory[];
  lifetime_breakup?: PointsBreakupCategory[];
  lifetime_earned_breakup?: PointsBreakupCategory[];
  lifetime_deduction_breakup?: PointsBreakupCategory[];
  summary: PointsSummary;
  peer_appreciation?: PeerAppreciationSummary;
  results: PointsLedgerItem[];
};

export type PointsQueryParams = {
  all_time?: boolean;
  start_date?: string;
  end_date?: string;
  type?: 'all' | 'earned' | 'deducted';
  event?: string;
  timeframe?: string;
  page?: number;
  page_size?: number;
};

export const getMyPoints = (token: string, params?: PointsQueryParams) => {
  let url = '/points/me/';
  if (params) {
    const q = new URLSearchParams();
    if (params.all_time) q.set('all_time', 'true');
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    if (params.type && params.type !== 'all') q.set('type', params.type);
    if (params.event) q.set('event', params.event);
    if (params.timeframe) q.set('timeframe', params.timeframe);
    if (params.page) q.set('page', String(params.page));
    if (params.page_size) q.set('page_size', String(params.page_size));
    const qs = q.toString();
    if (qs) url += `?${qs}`;
  }
  return apiRequest<CallerPoints>(url, { token });
};

export function formatSecondsToDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `0m ${secs}s`;
}

export type TalkTimeTrendItem = {
  date: string;
  display_date: string;
  total_calls: number;
  connected_calls: number;
  talk_time_seconds: number;
  talk_time_minutes?: number;
  formatted_talk_time: string;
  average_duration_seconds: number;
  formatted_avg_duration?: string;
};

export type CallerTalkTimeData = {
  caller_id: number;
  timeframe: string;
  start_date: string;
  end_date: string;
  total_calls_count: number;
  connected_calls_count: number;
  unconnected_calls_count: number;
  connection_rate_percent: number;
  total_talk_time_seconds: number;
  formatted_talk_time: string;
  average_duration_seconds: number;
  formatted_avg_duration: string;
  average_talk_time_per_call_seconds?: number;
  formatted_avg_talk_time_per_call?: string;
  trend: TalkTimeTrendItem[];
};

export type TalkTimeQueryParams = {
  timeframe?: 'today' | 'yesterday' | '7days' | 'this_month' | '30days' | 'custom';
  start_date?: string;
  end_date?: string;
};

export const getCallerTalkTime = (token: string, params?: TalkTimeQueryParams) => {
  let url = '/points/talk-time/';
  if (params) {
    const q = new URLSearchParams();
    if (params.timeframe) q.set('timeframe', params.timeframe);
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    const qs = q.toString();
    if (qs) url += `?${qs}`;
  }
  return apiRequest<CallerTalkTimeData>(url, { token });
};

export const getPeerAppreciationStatus = (token: string, month?: string) =>
  apiRequest<PeerAppreciationStatus>(`/points/peer-appreciation/status/${month ? `?month=${month}` : ''}`, { token });

export const submitPeerAppreciation = (token: string, data: { employee: number; score: number; month?: string }) =>
  apiRequest<{ id: number; score: number }>('/points/peer-appreciation/', {
    method: 'POST',
    body: data,
    token,
  });

export type ProgressCaller = {
  caller_id: number;
  caller_name: string;
  username: string;
  points: number;
  calls: number;
  is_me: boolean;
  rank: number;
  bar_percent: number;
};

export type CallerProgressData = {
  timeframe: 'day' | 'week' | 'month' | 'year';
  start_date: string;
  end_date: string;
  maximum: number;
  callers: ProgressCaller[];
};

export const getCallerProgress = (token: string, timeframe: 'day' | 'week' | 'month' | 'year' = 'week') =>
  apiRequest<CallerProgressData>(`/points/progress/?timeframe=${timeframe}`, { token });
