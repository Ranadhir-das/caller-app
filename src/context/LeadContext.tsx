import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  loadCallHistory,
  saveCallHistory,
} from '@/services/storage';

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
  const [leads, setLeads] =
    useState<Lead[]>([]);

  const [callHistory, setCallHistory] =
    useState<CallHistory[]>([]);

  const [isLoaded, setIsLoaded] =
    useState(false);

  // ------------------------------------------------
  // LOAD DATA
  // ------------------------------------------------

  useEffect(() => {
    const loadData = async () => {
      try {
        // ------------------------------------------
        // LOAD LOCAL CALL HISTORY
        // ------------------------------------------

        const savedCallHistory =
          await loadCallHistory();

        if (savedCallHistory) {
          setCallHistory(
            savedCallHistory
          );
        }

        // ------------------------------------------
        // GET AUTH TOKEN
        // ------------------------------------------

        const token =
          await getStoredToken();

        if (!token) {
          console.log(
            'No authentication token found.'
          );

          return;
        }

        // ------------------------------------------
        // LOAD ASSIGNED LEADS FROM DJANGO
        // ------------------------------------------

        const response =
          await apiRequest<
            ApiLead[]
          >(
            '/mobile/leads/',
            {
              token,
            }
          );

        const apiLeads =
          response.map(
            mapApiLead
          );

        setLeads(apiLeads);

        console.log(
          `Loaded ${apiLeads.length} students from Django.`
        );
      } catch (error) {
        console.error(
          'LEAD DATA LOAD ERROR:',
          error
        );
      } finally {
        setIsLoaded(true);
      }
    };

    loadData();
  }, []);

  // ------------------------------------------------
  // SAVE CALL HISTORY
  // ------------------------------------------------

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    saveCallHistory(
      callHistory
    );
  }, [
    callHistory,
    isLoaded,
  ]);

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
        callHistory,
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