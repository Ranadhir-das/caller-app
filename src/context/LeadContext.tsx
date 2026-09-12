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
  CallHistory,
  Lead,
  LeadStatus,
} from '@/types';

import {
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

type ApiLead = {
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

    case 'WRONG_NUMBER':
      return 'wrong_number';

    default:
      return 'pending';
  }
}

// --------------------------------------------------
// API → APP LEAD
// --------------------------------------------------

function mapApiLead(
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
// CONTEXT TYPE
// --------------------------------------------------

type LeadContextType = {
  refresh: () => Promise<void>;
  refreshing: boolean;
  refreshError: string | null;
  leads: Lead[];

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
  const { token: sessionToken } = useAuth();
  const [leads, setLeads] =
    useState<Lead[]>([]);

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
    const loadData = async () => {
      if (!sessionToken || inFlight) return;
      inFlight = true;
      setRefreshing(true);
      setRefreshError(null);
      try {
        const [leadResponse, historyResponse] = await Promise.all([
          apiRequest<ApiLead[]>('/mobile/leads/', { token: sessionToken }),
          apiRequest<Array<{
            id: number; lead: number; lead_name: string; lead_phone: string;
            outcome: string; notes: string; started_at: string; ended_at: string | null;
          }>>('/calls/mine/', { token: sessionToken }),
        ]);
        if (cancelled) return;
        setLeads(leadResponse.map(mapApiLead));
        setCallHistory(historyResponse.map(call => ({
          id: String(call.id), leadId: String(call.lead), leadName: call.lead_name,
          phone: call.lead_phone, outcome: mapApiStatus(call.outcome),
          notes: call.notes, calledAt: call.ended_at || call.started_at,
        })));
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
  }, [sessionToken]);

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
        ...currentHistory,
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
  // CONTEXT VALUE
  // ------------------------------------------------

  const value =
    useMemo(
      () => ({
        refresh, refreshing, refreshError,
        leads,
        updateLead,
        callHistory,
        addCallHistory,
        getNextPendingLead,
        getUpcomingFollowUps,
        getOverdueFollowUps,
      }),
      [
        leads,
        callHistory, refreshing, refreshError,
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
