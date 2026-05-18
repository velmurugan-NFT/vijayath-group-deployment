import { format } from 'date-fns';

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return format(new Date(d), 'dd-MMM-yyyy');
}
