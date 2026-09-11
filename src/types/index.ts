export type LeadStatus =
  | 'pending'
  | 'called'
  | 'interested'
  | 'not_interested'
  | 'no_answer'
  | 'busy'
  | 'call_back'
  | 'wrong_number';

export type Lead = {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  notes?: string;
  followUpDate?: string;
  createdAt: string;
};

export type CallHistory = {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  outcome: LeadStatus;
  notes?: string;
  calledAt: string;
  followUpDate?: string;
};