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

    default:
      return status;
  }
}

export function getStatusColor(
  status: LeadStatus
): string {
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