import { apiRequest } from './api';

export type CallerPoints = {
  caller: number;
  summary: {
    lifetime_points?: number;
    total_points: number;
    daily_points: number;
    weekly_points: number;
    monthly_points: number;
  };
  results: { id: number; event_display: string; points: number; reason: string; occurred_at: string }[];
};

export const getMyPoints = (token: string) =>
  apiRequest<CallerPoints>('/points/me/', { token });
