import type { CallDraft, CallPayload } from './callDrafts';
import { allowsContact, completeInterestedSelection } from './courses';

export function incompleteInterestedPayload(payload?: CallPayload): boolean {
  return payload?.outcome === 'INTERESTED' && !completeInterestedSelection(
    payload.selected_course || '', payload.selected_course_custom || '', String(payload.expected_admission_year || ''));
}

export type OutcomeValues = {
  outcome: string; notes: string; course: string; customCourse: string; year: string;
  callbackAt?: string; whatsappMessage?: string; whatsappTemplate?: number;
};

/** Only outcome fields belong in this request. Recording is deliberately excluded. */
export function buildOutcomePayload(draft: CallDraft, values: OutcomeValues): CallPayload {
  const payload: CallPayload = draft.payload || {
    client_event_id: draft.id, phone_number: draft.phone,
    ...(draft.leadId ? { lead: Number(draft.leadId) } : {}),
    started_at: draft.startedAt || '', ended_at: draft.endedAt || '',
    duration_seconds: Math.round(draft.durationSeconds ?? NaN),
    outcome: values.outcome, notes: values.notes.trim(),
    ...(values.outcome === 'INTERESTED' ? {
      selected_course: values.course,
      selected_course_custom: values.course === 'OTHERS' ? values.customCourse.trim() : '',
      expected_admission_year: Number(values.year),
    } : {}),
    ...(allowsContact(values.outcome) && values.callbackAt ? { callback_at: values.callbackAt } : {}),
    ...(allowsContact(values.outcome) && values.whatsappMessage?.trim() ? {
      whatsapp_message: values.whatsappMessage.trim(),
      ...(values.whatsappTemplate ? { whatsapp_template: values.whatsappTemplate } : {}),
    } : {}),
  };
  if (incompleteInterestedPayload(payload)) throw new Error('Complete the course and admission year before saving Interested.');
  if (!payload.outcome) throw new Error('Select a call outcome.');
  if (payload.outcome === 'CALL_BACK' && !payload.callback_at) throw new Error('Select a follow-up date and time for Call Back.');
  if (!payload.started_at || !payload.ended_at || !Number.isFinite(payload.duration_seconds) || payload.duration_seconds < 0) {
    throw new Error('Complete call timing is unavailable. This draft is retained for review.');
  }
  return payload;
}
