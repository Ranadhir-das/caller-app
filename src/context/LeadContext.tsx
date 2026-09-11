import React, {
    createContext,
    useContext,
    useMemo,
    useState,
} from 'react';

import { leads as initialLeads } from '@/data/leads';
import { Lead, LeadStatus } from '@/types';

type UpdateLeadData = {
  status: LeadStatus;
  notes?: string;
  followUpDate?: string;
};

type LeadContextType = {
  leads: Lead[];
  updateLead: (id: string, data: UpdateLeadData) => void;
};

const LeadContext = createContext<LeadContextType | undefined>(
  undefined
);

export function LeadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);

  const updateLead = (id: string, data: UpdateLeadData) => {
    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === id
          ? {
              ...lead,
              status: data.status,
              notes: data.notes,
              followUpDate: data.followUpDate,
            }
          : lead
      )
    );
  };

  const value = useMemo(
    () => ({
      leads,
      updateLead,
    }),
    [leads]
  );

  return (
    <LeadContext.Provider value={value}>
      {children}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const context = useContext(LeadContext);

  if (!context) {
    throw new Error(
      'useLeads must be used inside LeadProvider'
    );
  }

  return context;
}