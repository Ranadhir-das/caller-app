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
  company?: string;
  email?: string;
  status: LeadStatus;
  notes?: string;
  followUpDate?: string;
  createdAt: string;
};