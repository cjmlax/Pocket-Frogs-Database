/** Format a number using the visitor's locale (e.g. 1,234 in en-US, 1.234 in de-DE). */
export function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}
