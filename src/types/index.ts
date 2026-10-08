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
  | 'ringing'
  | 'admission_done_by_other_consultancy'
  | 'b2b';

export type InterestedDetails = { selected_course?: string | null; selected_course_custom?: string;
  course_label?: string; expected_admission_year?: number | null; course_classification?: string; outcome_points?: number };
export type Lead = {
  preferredCourse?: string | null; preferredCourseCustom?: string; interestedDetails?: InterestedDetails | null;
  batchId?: number | null;
  batchName?: string;
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  college?: string;
  location?: string;
  notes?: string;
  followUpDate?: string;
  isClaimed?: boolean;
  createdAt: string;
};

export type CallHistory = {
  selectedCourse?: string | null; customCourse?: string; admissionYear?: number | null;
  courseClassification?: string; outcomePoints?: number; whatsappMessage?: string;
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

export type AvailableLeadService = {
  id: number;
  name: string;
  code: string;
  description?: string;
};

export type AvailableLead = {
  id: string;
  name: string;
  phone?: string;
  phoneMasked?: string;
  service?: AvailableLeadService | null;
  source?: string;
  campaign?: string;
  status?: string;
  statusDisplay?: string;
  queueCategory?: string;
  queuePriority?: number;
  createdAt: string;
};