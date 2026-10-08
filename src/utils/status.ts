import { LeadStatus } from '@/types';

export function getStatusLabel(
  status: LeadStatus
): string {
  switch (status) {
    case 'pending':
      return 'Pending';

    case 'called':
      return 'Called';

    case 'interested':
      return 'Interested';

    case 'not_interested':
      return 'Not Interested';

    case 'no_answer':
      return 'No Answer';

    case 'busy':
      return 'Busy';

    case 'call_back':
      return 'Call Back';

    case 'wrong_number':
      return 'Wrong Number';
    case 'forwarded_calls':
      return 'Forwarded Calls';
    case 'no_candidate':
      return 'No Candidate';
    case 'disconnected':
      return 'Disconnected';
    case 'admission_done':
      return 'Admission Done';
    case 'all_waiting':
      return 'Call Waiting';
    case 'not_reachable':
      return 'Not Reachable';
    case 'ringing':
      return 'Ringing';
    case 'admission_done_by_other_consultancy':
      return 'Admission done by other consultancy';
    case 'b2b':
      return 'B2B';

    default:
      return status;
  }
}

export function getStatusColor(
  status: LeadStatus,
  mode: 'light' | 'dark' = 'light'
): string {
  if (mode === 'dark') {
    const colors: Record<LeadStatus, string> = {
      interested: '#78DBB9', not_interested: '#F4A4BB', no_answer: '#E9BF70',
      busy: '#C2A7FF', call_back: '#BEAEFF', wrong_number: '#B4BED0',
      called: '#78DBB9', pending: '#E9BF70',
      forwarded_calls: '#B4BED0',
      no_candidate: '#B4BED0',
      disconnected: '#B4BED0',
      admission_done: '#B4BED0',
      all_waiting: '#B4BED0',
      not_reachable: '#B4BED0',
      ringing: '#B4BED0',
      admission_done_by_other_consultancy: '#B4BED0',
      b2b: '#93C5FD',
    };
    return colors[status];
  }
  switch (status) {
    case 'interested':
      return '#16A34A';

    case 'not_interested':
      return '#DC2626';

    case 'no_answer':
      return '#D97706';

    case 'busy':
      return '#7C3AED';

    case 'call_back':
      return '#2563EB';

    case 'wrong_number':
      return '#6B7280';

    case 'called':
      return '#059669';

    case 'pending':
      return '#64748B';

    default:
      return '#64748B';
  }
}
