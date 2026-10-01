import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';

import {
  AvailableLead,
  CallHistory,
  Lead,
  LeadStatus,
} from '@/types';

import {
  ApiError,
  apiRequest,
} from '@/services/api';

import {
  getStoredToken,
} from '@/services/auth';

// --------------------------------------------------
// UPDATE DATA
// --------------------------------------------------

type UpdateLeadData = {
  status: LeadStatus;
  notes?: string;
  followUpDate?: string;
};

// --------------------------------------------------
// DJANGO API TYPE
// --------------------------------------------------

export type ApiLead = {
  batch_id?: number | null;
  batch_name?: string;
  id: number;
  name: string;
  phone: string;
  email?: string;
  location?: string;
  college?: string;
  neet_status?: string;
  pcb_percentage?: string | number | null;
  preferred_intake?: string;
  source?: string;
  campaign?: string;
  status: string;
  status_display?: string;
  assigned_caller?: number | null;
  assigned_caller_name?: string | null;
  assigned_at?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
};

// --------------------------------------------------
// STATUS MAPPING
// --------------------------------------------------

function mapApiStatus(
  status: string
): LeadStatus {
  switch (status) {
    case 'PENDING':
      return 'pending';

    case 'CALLED':
      return 'called';

    case 'INTERESTED':
      return 'interested';

    case 'NOT_INTERESTED':
      return 'not_interested';

    case 'NO_ANSWER':
      return 'no_answer';

    case 'BUSY':
      return 'busy';

    case 'CALL_BACK':
      return 'call_back';

    case 'FORWARDED_CALLS':
      return 'forwarded_calls';
    case 'NO_CANDIDATE':
      return 'no_candidate';
    case 'DISCONNECTED':
      return 'disconnected';
    case 'ADMISSION_DONE':
      return 'admission_done';
    case 'ALL_WAITING':
      return 'all_waiting';
    case 'NOT_REACHABLE':
      return 'not_reachable';
    case 'RINGING':
      return 'ringing';

    case 'WRONG_NUMBER':
      return 'wrong_number';

    default:
      return 'pending';
  }
}

// --------------------------------------------------
// API → APP LEAD
// --------------------------------------------------

export function mapApiLead(
  lead: ApiLead
): Lead {
  return {
    id: String(lead.id),
    batchId: lead.batch_id,
    batchName: lead.batch_name || "Unbatched leads",
    name: lead.name,
    phone: lead.phone,
    status: mapApiStatus(lead.status),
    notes: lead.notes || undefined,
    createdAt: lead.created_at,
  };
}

// --------------------------------------------------
// API AVAILABLE LEAD TYPE & MAPPING
// --------------------------------------------------

type ApiAvailableLead = {
  id: number;
  name: string;
  service?: {
    id: number;
    name: string;
    code: string;
    description?: string;
  } | null;
  source?: string;
  campaign?: string;
  status?: string;
  status_display?: string;
  phone_masked?: string;
  queue_category?: string;
  queue_priority?: number;
  created_at: string;
};

function mapApiAvailableLead(
  item: ApiAvailableLead
): AvailableLead {
  return {
    id: String(item.id),
    name: item.name,
    phoneMasked: item.phone_masked,
    service: item.service
      ? {
          id: item.service.id,
          name: item.service.name,
          code: item.service.code,
          description: item.service.description,
        }
      : null,
    source: item.source,
    campaign: item.campaign,
    status: item.status,
    statusDisplay: item.status_display,
    queueCategory: item.queue_category,
    queuePriority: item.queue_priority,
    createdAt: item.created_at,
  };
}

// --------------------------------------------------
// CONTEXT TYPE
// --------------------------------------------------

type LeadContextType = {
  refresh: () => Promise<void>;
  refreshing: boolean;
  refreshError: string | null;
  leads: Lead[];
  availableLeads: AvailableLead[];
  loadingAvailable: boolean;
  availableError: string | null;
  refreshAvailableLeads: () => Promise<void>;
  claimLead: (leadId: string) => Promise<Lead>;
  releaseClaim: (leadId: string) => Promise<void>;
  markCallStarted: (leadId: string) => Promise<void>;

  updateLead: (
    id: string,
    data: UpdateLeadData
  ) => void;

  callHistory: CallHistory[];

  addCallHistory: (
    call: CallHistory
  ) => void;

  getNextPendingLead: (
    currentLeadId?: string
  ) => Lead | undefined;

  getUpcomingFollowUps: () => Lead[];

  getOverdueFollowUps: () => Lead[];
};

// --------------------------------------------------
// CONTEXT
// --------------------------------------------------

const LeadContext =
  createContext<LeadContextType | undefined>(
    undefined
  );

// --------------------------------------------------
// PROVIDER
// --------------------------------------------------

export function LeadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token: sessionToken, user } = useAuth();
  const [leads, setLeads] =
    useState<Lead[]>([]);

  const [availableLeads, setAvailableLeads] =
    useState<AvailableLead[]>([]);
  const [loadingAvailable, setLoadingAvailable] =
    useState(false);
  const [availableError, setAvailableError] =
    useState<string | null>(null);

  const [callHistory, setCallHistory] =
    useState<CallHistory[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = () => refreshRef.current();
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    setLeads([]);
    setCallHistory([]);
    setAvailableLeads([]);
    const loadData = async () => {
      if (!sessionToken || user?.role !== 'CALLER' || inFlight) return;
      inFlight = true;
      setRefreshing(true);
      setRefreshError(null);
      setAvailableError(null);
      try {
        const [leadResponse, historyResponse, availableResponse] = await Promise.all([
          apiRequest<ApiLead[]>('/mobile/leads/', { token: sessionToken }),
          apiRequest<Array<{
            id: number; lead: number | null; lead_name: string | null; lead_phone: string | null;
            phone_number: string; duration_seconds: number; followup?: { scheduled_at: string; status: string } | null;
            outcome: string; notes: string; started_at: string; ended_at: string | null;
          }>>('/calls/mine/', { token: sessionToken }),
          apiRequest<ApiAvailableLead[]>('/mobile/leads/available/?category=WEBSITE', { token: sessionToken }).catch((err) => {
            console.warn('Failed to load available website leads:', err);
            return [] as ApiAvailableLead[];
          }),
        ]);
        if (cancelled) return;
        setLeads(leadResponse.map(lead => {
          const pending = historyResponse.find(call => call.lead === lead.id && call.followup?.status === 'PENDING');
          return { ...mapApiLead(lead), followUpDate: pending?.followup?.scheduled_at };
        }));
        setCallHistory(historyResponse.map(call => ({
          id: String(call.id), leadId: call.lead == null ? '' : String(call.lead), leadName: call.lead_name || call.phone_number || 'External call',
          phone: call.phone_number || call.lead_phone || '', isExternal: call.lead == null,
          durationSeconds: call.duration_seconds, followUpDate: call.followup?.scheduled_at, followUpStatus: call.followup?.status, outcome: mapApiStatus(call.outcome),
          notes: call.notes, calledAt: call.ended_at || call.started_at,
        })));
        setAvailableLeads(
          availableResponse
            .filter(item => (item.queue_category ? item.queue_category === 'WEBSITE' : true))
            .map(mapApiAvailableLead)
        );
      } catch (error) {
        if (!cancelled) setRefreshError('Could not refresh. Check your connection and try again.');
      } finally { inFlight = false; if (!cancelled) setRefreshing(false); }
    };
    refreshRef.current = loadData;
    void loadData();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void loadData();
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [sessionToken, user?.role]);

  // ------------------------------------------------
  // UPDATE LEAD
  // ------------------------------------------------

  const updateLead = async (
    id: string,
    data: UpdateLeadData
  ) => {
    // ----------------------------------------------
    // UPDATE UI IMMEDIATELY
    // ----------------------------------------------

    setLeads(
      (currentLeads) =>
        currentLeads.map(
          (lead) => {
            if (lead.id !== id) {
              return lead;
            }

            return {
              ...lead,
              status: data.status,
              notes: data.notes,
              followUpDate:
                data.followUpDate,
            };
          }
        )
    );

    // ----------------------------------------------
    // UPDATE DJANGO
    // ----------------------------------------------

    try {
      const token =
        await getStoredToken();

      if (!token) {
        return;
      }

      const backendStatus =
        data.status
          .toUpperCase();

      await apiRequest(
        `/mobile/leads/${id}/update/`,
        {
          method: 'PATCH',
          token,
          body: {
            status:
              backendStatus,
            notes:
              data.notes ?? '',
          },
        }
      );

      console.log(
        `Student ${id} updated successfully.`
      );
    } catch (error) {
      console.error(
        'LEAD UPDATE ERROR:',
        error
      );
    }
  };

  // ------------------------------------------------
  // ADD CALL HISTORY
  // ------------------------------------------------

  const addCallHistory = (
    call: CallHistory
  ) => {
    setCallHistory(
      (currentHistory) => [
        call,
        ...currentHistory.filter(item => item.id !== call.id),
      ]
    );
  };

  // ------------------------------------------------
  // GET NEXT PENDING LEAD
  // ------------------------------------------------

  const getNextPendingLead = (
    currentLeadId?: string
  ) => {
    const currentIndex =
      currentLeadId
        ? leads.findIndex(
            (lead) =>
              lead.id ===
              currentLeadId
          )
        : -1;

    const nextLead =
      leads.find(
        (lead, index) =>
          index >
            currentIndex &&
          lead.status ===
            'pending'
      );

    if (nextLead) {
      return nextLead;
    }

    return leads.find(
      (lead) =>
        lead.status ===
          'pending' &&
        lead.id !==
          currentLeadId
    );
  };

  // ------------------------------------------------
  // GET UPCOMING FOLLOW-UPS
  // ------------------------------------------------

  const getUpcomingFollowUps =
    () => {
      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      return leads
        .filter((lead) => {
          if (
            !lead.followUpDate
          ) {
            return false;
          }

          const followUpDate =
            new Date(
              lead.followUpDate
            );

          followUpDate.setHours(
            0,
            0,
            0,
            0
          );

          return (
            lead.status ===
              'call_back' &&
            followUpDate >=
              today
          );
        })
        .sort(
          (a, b) =>
            new Date(
              a.followUpDate!
            ).getTime() -
            new Date(
              b.followUpDate!
            ).getTime()
        );
    };

  // ------------------------------------------------
  // GET OVERDUE FOLLOW-UPS
  // ------------------------------------------------

  const getOverdueFollowUps =
    () => {
      const today =
        new Date();

      today.setHours(
        0,
        0,
        0,
        0
      );

      return leads
        .filter((lead) => {
          if (
            !lead.followUpDate
          ) {
            return false;
          }

          const followUpDate =
            new Date(
              lead.followUpDate
            );

          followUpDate.setHours(
            0,
            0,
            0,
            0
          );

          return (
            lead.status ===
              'call_back' &&
            followUpDate <
              today
          );
        })
        .sort(
          (a, b) =>
            new Date(
              a.followUpDate!
            ).getTime() -
            new Date(
              b.followUpDate!
            ).getTime()
        );
    };

  // ------------------------------------------------
  // REFRESH AVAILABLE LEADS
  // ------------------------------------------------

  const refreshAvailableLeads = async () => {
    const token = sessionToken || (await getStoredToken());
    if (!token || user?.role !== 'CALLER') return;
    setLoadingAvailable(true);
    setAvailableError(null);
    try {
      const response = await apiRequest<ApiAvailableLead[]>(
        '/mobile/leads/available/?category=WEBSITE',
        { token }
      );
      setAvailableLeads(
        response
          .filter(item => (item.queue_category ? item.queue_category === 'WEBSITE' : true))
          .map(mapApiAvailableLead)
      );
    } catch (error) {
      console.error('REFRESH AVAILABLE LEADS ERROR:', error);
      setAvailableError('Could not load available leads. Pull to refresh.');
    } finally {
      setLoadingAvailable(false);
    }
  };

  // ------------------------------------------------
  // CLAIM AVAILABLE LEAD
  // ------------------------------------------------

  const claimLead = async (leadId: string): Promise<Lead> => {
    const token = sessionToken || (await getStoredToken());
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await apiRequest<{
        claimed_by: number;
        claimed_at: string;
        lead: ApiLead;
      }>(`/mobile/leads/${leadId}/claim/`, {
        method: 'POST',
        token,
      });

      const claimedLead: Lead = {
        ...mapApiLead(response.lead),
        isClaimed: true,
      };
      setLeads((prev) => [claimedLead, ...prev.filter((l) => l.id !== claimedLead.id)]);
      setAvailableLeads((prev) => prev.filter((l) => l.id !== leadId));
      return claimedLead;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setAvailableLeads((prev) => prev.filter((l) => l.id !== leadId));
      }
      throw error;
    }
  };

  // ------------------------------------------------
  // MARK CALL STARTED (OFFHOOK REACHED)
  // ------------------------------------------------

  const markCallStarted = async (leadId: string): Promise<void> => {
    const token = sessionToken || (await getStoredToken());
    if (!token) throw new Error('No authenticated session');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await apiRequest<{ call_started: boolean; lead_id: number }>(
        `/mobile/leads/${leadId}/call-started/`,
        {
          method: 'POST',
          signal: controller.signal,
          token,
        }
      );
      console.log(`[LeadContext] Call started marked on backend for lead ${leadId}`);
    } catch (error) {
      throw error;
    } finally { clearTimeout(timeout); }
  };

  // ------------------------------------------------
  // RELEASE CLAIMED LEAD
  // ------------------------------------------------

  const releaseClaim = async (leadId: string): Promise<void> => {
    const token = sessionToken || (await getStoredToken());
    if (!token) return;

    try {
      await apiRequest<{ released?: boolean; status: string; lead_id: number; message: string }>(
        `/mobile/leads/${leadId}/release-claim/`,
        {
          method: 'POST',
          token,
        }
      );
    } catch (error) {
      console.warn('RELEASE CLAIM ERROR:', error);
    } finally {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      void refreshAvailableLeads();
    }
  };

  // ------------------------------------------------
  // CONTEXT VALUE
  // ------------------------------------------------

  const value =
    useMemo(
      () => ({
        refresh,
        refreshing,
        refreshError,
        leads,
        availableLeads,
        loadingAvailable,
        availableError,
        refreshAvailableLeads,
        claimLead,
        releaseClaim,
        markCallStarted,
        updateLead,
        callHistory,
        addCallHistory,
        getNextPendingLead,
        getUpcomingFollowUps,
        getOverdueFollowUps,
      }),
      [
        refresh,
        refreshing,
        refreshError,
        leads,
        availableLeads,
        loadingAvailable,
        availableError,
        callHistory,
        claimLead,
        releaseClaim,
        markCallStarted,
      ]
    );

  return (
    <LeadContext.Provider
      value={value}
    >
      {children}
    </LeadContext.Provider>
  );
}

// --------------------------------------------------
// HOOK
// --------------------------------------------------

export function useLeads() {
  const context =
    useContext(
      LeadContext
    );

  if (!context) {
    throw new Error(
      'useLeads must be used inside LeadProvider'
    );
  }

  return context;
}
