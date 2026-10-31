import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import {
  activityApi,
  type ActivityCategory,
  type BreakReasonConfig,
  type CurrentActivityResponse,
  type CurrentBreak,
  type CurrentSegment,
  type EndActivityResponse,
  type WorkSessionSummary,
} from '@/services/activity';
import { ApiError } from '@/services/api';
import { getCurrentCoords } from '@/services/location';

export type ActivityContextType = {
  session: WorkSessionSummary | null;
  currentSegment: CurrentSegment | null;
  currentBreak: CurrentBreak | null;
  hasActiveSession: boolean;
  categories: ActivityCategory[];
  breakReasons: BreakReasonConfig[];
  loading: boolean;
  refreshing: boolean;
  mutating: boolean;
  error: string | null;

  // Local live tick durations (in seconds)
  elapsedGross: number;
  elapsedBreak: number;
  elapsedNet: number;
  breakElapsed: number;
  segmentElapsed: number;
  breakWarningExceeded: boolean;

  // Methods
  refreshCurrent: (showLoading?: boolean) => Promise<void>;
  startShift: (categoryId?: number, note?: string) => Promise<void>;
  pause: (breakReasonId: number, note?: string) => Promise<void>;
  resume: (categoryId?: number, note?: string) => Promise<void>;
  switchCategory: (categoryId: number, note?: string) => Promise<void>;
  endShift: (note?: string) => Promise<EndActivityResponse>;
};

const ActivityContext = createContext<ActivityContextType | undefined>(undefined);

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();

  const [session, setSession] = useState<WorkSessionSummary | null>(null);
  const [currentSegment, setCurrentSegment] = useState<CurrentSegment | null>(null);
  const [currentBreak, setCurrentBreak] = useState<CurrentBreak | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [breakReasons, setBreakReasons] = useState<BreakReasonConfig[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live timer state
  const [elapsedGross, setElapsedGross] = useState(0);
  const [elapsedBreak, setElapsedBreak] = useState(0);
  const [elapsedNet, setElapsedNet] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const [segmentElapsed, setSegmentElapsed] = useState(0);
  const [breakWarningExceeded, setBreakWarningExceeded] = useState(false);

  const mutatingRef = useRef(false);
  const activeRef = useRef(true);

  // Sync state from server response
  const applyServerResponse = useCallback((res: CurrentActivityResponse) => {
    setHasActiveSession(res.has_active_session);
    setSession(res.session);
    setCurrentSegment(res.current_segment);
    setCurrentBreak(res.current_break);

    if (res.session) {
      setElapsedGross(res.session.elapsed_gross_seconds || 0);
      setElapsedBreak(res.session.total_break_seconds || 0);
      setElapsedNet(res.session.elapsed_net_seconds || 0);
    } else {
      setElapsedGross(0);
      setElapsedBreak(0);
      setElapsedNet(0);
    }

    if (res.current_segment) {
      setSegmentElapsed(res.current_segment.elapsed_seconds || 0);
    } else {
      setSegmentElapsed(0);
    }

    if (res.current_break) {
      const bElapsed = res.current_break.elapsed_seconds || 0;
      setBreakElapsed(bElapsed);
      const threshSec = (res.current_break.warning_threshold_minutes || 0) * 60;
      setBreakWarningExceeded(threshSec > 0 && bElapsed > threshSec);
    } else {
      setBreakElapsed(0);
      setBreakWarningExceeded(false);
    }
  }, []);

  // Fetch categories & break reasons (cached)
  const fetchMetadata = useCallback(async () => {
    if (!token) return;
    try {
      const meta = await activityApi.getActivityCategories(token);
      if (activeRef.current) {
        setCategories(meta.categories);
        setBreakReasons(meta.break_reasons);
      }
    } catch (e) {
      console.warn('Could not load activity metadata:', e);
    }
  }, [token]);

  // Authoritative refresh from server
  const refreshCurrent = useCallback(
    async (showLoading = false) => {
      if (!token) return;
      if (showLoading) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await activityApi.getCurrentActivity(token);
        if (activeRef.current) {
          applyServerResponse(res);
          setError(null);
        }
      } catch (err: unknown) {
        if (!activeRef.current) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Auth issue; let AuthContext handle token expiry
          return;
        }
        const msg = err instanceof Error ? err.message : 'Could not refresh activity state.';
        setError(msg);
      } finally {
        if (activeRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [token, applyServerResponse]
  );

  // Initial mount & user change
  useEffect(() => {
    activeRef.current = true;
    if (token && user) {
      void fetchMetadata();
      void refreshCurrent(true);
    } else {
      setSession(null);
      setCurrentSegment(null);
      setCurrentBreak(null);
      setHasActiveSession(false);
      setLoading(false);
    }
    return () => {
      activeRef.current = false;
    };
  }, [token, user?.id, fetchMetadata, refreshCurrent]);

  // Foreground listener
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && token) {
        void refreshCurrent();
      }
    });
    return () => {
      sub.remove();
    };
  }, [token, refreshCurrent]);

  // 1-second interval timer ticker
  useEffect(() => {
    if (!hasActiveSession || !session) return;
    if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') return;

    const timer = setInterval(() => {
      if (session.status === 'ACTIVE') {
        setElapsedGross((g) => g + 1);
        setElapsedNet((n) => n + 1);
        setSegmentElapsed((s) => s + 1);
      } else if (session.status === 'PAUSED') {
        setElapsedGross((g) => g + 1);
        setElapsedBreak((b) => b + 1);
        setBreakElapsed((prevBreak) => {
          const nextBreak = prevBreak + 1;
          if (currentBreak) {
            const threshSec = (currentBreak.warning_threshold_minutes || 0) * 60;
            if (threshSec > 0 && nextBreak > threshSec) {
              setBreakWarningExceeded(true);
            }
          }
          return nextBreak;
        });
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [hasActiveSession, session?.status, currentBreak]);

  // Start shift action
  const startShift = useCallback(
    async (categoryId?: number, note?: string) => {
      if (!token) throw new Error('Not authenticated.');
      if (mutatingRef.current) return;
      mutatingRef.current = true;
      setMutating(true);

      let location = null;
      let locError: unknown = null;
      try {
        location = await getCurrentCoords();
      } catch (e) {
        locError = e;
      }

      try {
        const res = await activityApi.startActivity(token, {
          category_id: categoryId,
          note: note?.trim() || undefined,
          latitude: location?.latitude,
          longitude: location?.longitude,
          accuracy: location?.accuracy,
          recorded_at: location?.recorded_at,
          timestamp: location?.recorded_at,
          is_mocked: location?.is_mocked ?? false,
        });
        applyServerResponse(res);
      } catch (err: unknown) {
        await refreshCurrent();
        if (locError && err instanceof ApiError && err.status === 422) {
          throw locError;
        }
        throw err;
      } finally {
        mutatingRef.current = false;
        setMutating(false);
      }
    },
    [token, applyServerResponse, refreshCurrent]
  );

  // Pause action
  const pause = useCallback(
    async (breakReasonId: number, note?: string) => {
      if (!token) throw new Error('Not authenticated.');
      if (mutatingRef.current) return;
      mutatingRef.current = true;
      setMutating(true);

      try {
        const res = await activityApi.pauseActivity(token, {
          break_reason_id: breakReasonId,
          note: note?.trim() || undefined,
        });
        applyServerResponse(res);
      } catch (err: unknown) {
        // Refresh authoritative state on error to reconcile
        await refreshCurrent();
        throw err;
      } finally {
        mutatingRef.current = false;
        setMutating(false);
      }
    },
    [token, applyServerResponse, refreshCurrent]
  );

  // Resume action
  const resume = useCallback(
    async (categoryId?: number, note?: string) => {
      if (!token) throw new Error('Not authenticated.');
      if (mutatingRef.current) return;
      mutatingRef.current = true;
      setMutating(true);

      let location = null;
      let locError: unknown = null;
      try {
        location = await getCurrentCoords();
      } catch (e) {
        locError = e;
      }

      try {
        const res = await activityApi.resumeActivity(token, {
          category_id: categoryId,
          note: note?.trim() || undefined,
          latitude: location?.latitude,
          longitude: location?.longitude,
          accuracy: location?.accuracy,
          recorded_at: location?.recorded_at,
          timestamp: location?.recorded_at,
          is_mocked: location?.is_mocked ?? false,
        });
        applyServerResponse(res);
      } catch (err: unknown) {
        await refreshCurrent();
        if (locError && err instanceof ApiError && err.status === 422) {
          throw locError;
        }
        throw err;
      } finally {
        mutatingRef.current = false;
        setMutating(false);
      }
    },
    [token, applyServerResponse, refreshCurrent]
  );

  // Switch category action
  const switchCategory = useCallback(
    async (categoryId: number, note?: string) => {
      if (!token) throw new Error('Not authenticated.');
      if (mutatingRef.current) return;
      mutatingRef.current = true;
      setMutating(true);

      try {
        const res = await activityApi.switchActivity(token, {
          category_id: categoryId,
          note: note?.trim() || undefined,
        });
        applyServerResponse(res);
      } catch (err: unknown) {
        await refreshCurrent();
        throw err;
      } finally {
        mutatingRef.current = false;
        setMutating(false);
      }
    },
    [token, applyServerResponse, refreshCurrent]
  );

  // End shift action
  const endShift = useCallback(
    async (note?: string): Promise<EndActivityResponse> => {
      if (!token) throw new Error('Not authenticated.');
      if (mutatingRef.current) throw new Error('Action in progress.');
      mutatingRef.current = true;
      setMutating(true);

      let location = null;
      let locError: unknown = null;
      try {
        location = await getCurrentCoords();
      } catch (e) {
        locError = e;
      }

      try {
        const res = await activityApi.endActivity(token, {
          note: note?.trim() || undefined,
          latitude: location?.latitude,
          longitude: location?.longitude,
          accuracy: location?.accuracy,
          recorded_at: location?.recorded_at,
          timestamp: location?.recorded_at,
          is_mocked: location?.is_mocked ?? false,
        });
        // Clear active session locally
        setHasActiveSession(false);
        setSession(null);
        setCurrentSegment(null);
        setCurrentBreak(null);
        setElapsedGross(res.session.gross_seconds || 0);
        setElapsedBreak(res.session.break_seconds || 0);
        setElapsedNet(res.session.net_seconds || 0);
        return res;
      } catch (err: unknown) {
        await refreshCurrent();
        if (locError && err instanceof ApiError && err.status === 422) {
          throw locError;
        }
        throw err;
      } finally {
        mutatingRef.current = false;
        setMutating(false);
      }
    },
    [token, refreshCurrent]
  );

  return (
    <ActivityContext.Provider
      value={{
        session,
        currentSegment,
        currentBreak,
        hasActiveSession,
        categories,
        breakReasons,
        loading,
        refreshing,
        mutating,
        error,
        elapsedGross,
        elapsedBreak,
        elapsedNet,
        breakElapsed,
        segmentElapsed,
        breakWarningExceeded,
        refreshCurrent,
        startShift,
        pause,
        resume,
        switchCategory,
        endShift,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}

export function useActivity() {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return context;
}

/**
 * Utility to format seconds into HH:MM:SS or MM:SS
 */
export function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

