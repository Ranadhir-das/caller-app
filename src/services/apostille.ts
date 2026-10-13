import { apiRequest } from './api';
import type { LoggedInUser } from './auth';

export const canUseApostille = (user: LoggedInUser | null | undefined) =>
  user?.role === 'CALLER' && user.can_manage_apostille_leads === true && !user.needs_onboarding;

export type ApostilleInput = {
  name: string; phone: string; country: string; document_name: string; number_of_documents: number;
  conversion: boolean; notes: string; reason: string; client_event_id: string; revision?: number;
};
export type ApostilleLead = {
  id: number; name: string; phone: string; country: string; document_name: string;
  number_of_documents: number | null; conversion: boolean | null; conversion_notes: string; reason: string;
  notes: string; status_display: string; assigned_caller_name: string | null; can_call: boolean;
  client_event_id: string | null; revision: number;
  calls?: { id: number; outcome_display: string; notes: string; started_at: string;
    followup: { scheduled_at: string; status: string } | null }[];
};

export function apostillePayload(input: ApostilleInput): ApostilleInput {
  if (!input.name.trim() || !input.phone.trim() || !input.country.trim() || !input.document_name.trim()) {
    throw new Error('Enter name, phone number, country and document name.');
  }
  if (!Number.isSafeInteger(input.number_of_documents) || input.number_of_documents < 1) {
    throw new Error('Number of documents must be a positive whole number.');
  }
  if (!input.conversion && !input.reason.trim()) throw new Error('Enter a reason when Conversion is No.');
  return { ...input, name: input.name.trim(), phone: input.phone.trim(), country: input.country.trim(),
    document_name: input.document_name.trim(), notes: input.conversion ? input.notes.trim() : '',
    reason: input.conversion ? '' : input.reason.trim() };
}

export const apostilleApi = {
  list: (token: string, q: string, conversion: string, page: number) =>
    apiRequest<{ results: ApostilleLead[]; next: string | null }>('/mobile/apostille-leads/?' +
      `q=${encodeURIComponent(q)}&conversion=${encodeURIComponent(conversion)}&page=${page}`, { token }),
  detail: (token: string, id: string) => apiRequest<ApostilleLead>(`/mobile/apostille-leads/${id}/`, { token }),
  save: (token: string, input: ApostilleInput, id?: string) => apiRequest<ApostilleLead>(
    `/mobile/apostille-leads/${id ? id + '/' : ''}`, { token, method: id ? 'PATCH' : 'POST', body: apostillePayload(input) }),
};
