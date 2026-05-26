export function N(v) {
    if (v == null)
        return 0;
    return typeof v === 'bigint' ? Number(v) : v;
}
export function sumAmounts(values) {
    return values.reduce((s, v) => s + N(v), 0);
}
