export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `₹${amount.toLocaleString('en-IN')}`;
}