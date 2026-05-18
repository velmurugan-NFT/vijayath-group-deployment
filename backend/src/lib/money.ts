export function N(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}

export function sumAmounts(values: (bigint | number)[]): number {
  return values.reduce<number>((s, v) => s + N(v), 0);
}
