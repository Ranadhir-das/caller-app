export type LeadStatus =
  | 'pending'
  | 'called'
  | 'interested'
  | 'not_interested'
  | 'no_answer'
  | 'busy'
  | 'call_back'
  | 'wrong_number'
  | 'forwarded_calls'
  | 'no_candidate'
  | 'disconnected'
  | 'admission_done'
  | 'all_waiting'
  | 'not_reachable'
  | 'ringing';

export type Lead = {
  batchId?: number | null;
  batchName?: string;
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  notes?: string;
  followUpDate?: string;
  createdAt: string;
};

export type CallHistory = {
  isExternal?: boolean;
  durationSeconds?: number;
  followUpStatus?: string;
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  outcome: LeadStatus;
  notes?: string;
  calledAt: string;
  followUpDate?: string;
};