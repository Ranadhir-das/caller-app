import { apiRequest } from './api';

export type ActivityCategory = {
  id: number;
  name: string;
  slug: string;
  icon_key: string;
  color_hex: string;
  is_default_for_caller: boolean;
  is_default_for_counselor: boolean;
  is_default_general: boolean;
  sort_order: number;
};

export type BreakReasonConfig = {
  id: number;
  name: string;
  code: string;
  warning_threshold_minutes: number;
  requires_note: boolean;
  sort_order: number;
};

export type WorkSessionSummary = {
  id: number;
  date: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'AUTO_CLOSED';
  started_at: string;
  elapsed_gross_seconds: number;
  total_break_seconds: number;
  elapsed_net_seconds: number;
};

export type CurrentSegment = {
  id: number;
  category: {
    id: number;
    name: string;
    slug: string;
    icon_key: string;
    color_hex: string;
  };
  started_at: string;
  elapsed_seconds: number;
  note: string;
};

export type CurrentBreak = {
  id: number;
  reason: {
    id: number;
    name: string;
    code: string;
  };
  started_at: string;
  elapsed_seconds: number;
  warning_threshold_minutes: number;
  warning_exceeded: boolean;
  note: string;
};

export type CurrentActivityResponse = {
  has_active_session: boolean;
  session: WorkSessionSummary | null;
  current_segment: CurrentSegment | null;
  current_break: CurrentBreak | null;
};

export type ActivityCategoriesResponse = {
  categories: ActivityCategory[];
  break_reasons: BreakReasonConfig[];
};

export type EndActivityResponse = {
  detail: string;
  session: {
    id: number;
    date: string;
    status: string;
    closure_reason: string;
    started_at: string;
    ended_at: string;
    gross_seconds: number;
    break_seconds: number;
    net_seconds: number;
  };
};

export type HistoryShiftStartEvent = {
  type: 'SHIFT_START';
  timestamp: string;
};

export type HistorySegmentEvent = {
  type: 'SEGMENT';
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  category: {
    id: number;
    name: string;
    slug: string;
    icon_key: string;
    color_hex: string;
  };
  note: string;
};

export type HistoryBreakEvent = {
  type: 'BREAK';
  id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  warning_threshold_minutes: number;
  exceeded: boolean;
  reason: {
    id: number;
    name: string;
    code: string;
  };
  closure_reason: string;
  note: string;
};

export type HistoryShiftEndEvent = {
  type: 'SHIFT_END';
  timestamp: string;
  reason: string;
  reason_display: string;
};

export type HistoryTimelineEvent =
  | HistoryShiftStartEvent
  | HistorySegmentEvent
  | HistoryBreakEvent
  | HistoryShiftEndEvent;

export type HistorySessionItem = {
  id: number;
  date: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  closure_reason: string | null;
  gross_seconds: number;
  break_seconds: number;
  net_seconds: number;
  timeline: HistoryTimelineEvent[];
};

export type ActivityHistoryResponse = {
  range: {
    preset: string;
    start_date: string;
    end_date: string;
  };
  summary: {
    total_sessions: number;
    total_gross_seconds: number;
    total_break_seconds: number;
    total_net_seconds: number;
  };
  performance_points: {
    total_points: number;
    note: string;
  };
  sessions: HistorySessionItem[];
};

export type HistoryFilterParams = {
  preset?: 'today' | 'yesterday' | 'last_7_days' | 'this_month' | 'custom';
  start_date?: string;
  end_date?: string;
};

export const activityApi = {
  getCurrentActivity: (token: string, signal?: AbortSignal) =>
    apiRequest<CurrentActivityResponse>('/mobile/activity/current/', {
      token,
      signal,
    }),

  getActivityCategories: (token: string, signal?: AbortSignal) =>
    apiRequest<ActivityCategoriesResponse>('/mobile/activity/categories/', {
      token,
      signal,
    }),

  startActivity: (
    token: string,
    data?: {
      category_id?: number;
      note?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      recorded_at?: string;
      timestamp?: string;
      is_mocked?: boolean;
    },
    signal?: AbortSignal
  ) =>
    apiRequest<CurrentActivityResponse>('/mobile/activity/start/', {
      token,
      method: 'POST',
      body: data || {},
      signal,
    }),

  pauseActivity: (
    token: string,
    data: { break_reason_id: number; note?: string },
    signal?: AbortSignal
  ) =>
    apiRequest<CurrentActivityResponse>('/mobile/activity/pause/', {
      token,
      method: 'POST',
      body: data,
      signal,
    }),

  resumeActivity: (
    token: string,
    data?: {
      category_id?: number;
      note?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      recorded_at?: string;
      timestamp?: string;
      is_mocked?: boolean;
    },
    signal?: AbortSignal
  ) =>
    apiRequest<CurrentActivityResponse>('/mobile/activity/resume/', {
      token,
      method: 'POST',
      body: data || {},
      signal,
    }),

  switchActivity: (
    token: string,
    data: { category_id: number; note?: string },
    signal?: AbortSignal
  ) =>
    apiRequest<CurrentActivityResponse>('/mobile/activity/switch/', {
      token,
      method: 'POST',
      body: data,
      signal,
    }),

  endActivity: (
    token: string,
    data?: {
      note?: string;
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      recorded_at?: string;
      timestamp?: string;
      is_mocked?: boolean;
    },
    signal?: AbortSignal
  ) =>
    apiRequest<EndActivityResponse>('/mobile/activity/end/', {
      token,
      method: 'POST',
      body: data || {},
      signal,
    }),

  getActivityHistory: (
    token: string,
    params?: HistoryFilterParams,
    signal?: AbortSignal
  ) => {
    const query = new URLSearchParams();
    if (params?.preset && params.preset !== 'custom') {
      query.set('preset', params.preset);
    } else if (params?.start_date && params?.end_date) {
      query.set('start_date', params.start_date);
      query.set('end_date', params.end_date);
    }
    const qs = query.toString();
    const endpoint = `/mobile/activity/history/${qs ? `?${qs}` : ''}`;
    return apiRequest<ActivityHistoryResponse>(endpoint, {
      token,
      signal,
    });
  },
};

