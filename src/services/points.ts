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

export type CallerPoints = {
  caller: number;
  summary: {
    lifetime_points?: number;
    performance_points?: number;
    total_points: number;
    daily_points: number;
    weekly_points: number;
    monthly_points: number;
    peer_appreciation?: PeerAppreciationSummary;
  };
  peer_appreciation?: PeerAppreciationSummary;
  results: { id: number; event_display: string; points: number; reason: string; occurred_at: string }[];
};

export const getMyPoints = (token: string) =>
  apiRequest<CallerPoints>('/points/me/', { token });

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

