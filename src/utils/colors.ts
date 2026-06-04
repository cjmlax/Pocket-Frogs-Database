import type { TeableRecord } from '../api/teable';
import type { ComboOption } from '../components/ComboBox';
import type { ColorSort } from '../hooks/useColorSort';

// Builds color ComboBox options, fully ordered by the active sort key and
// direction. Color boxes always pass presorted so the ComboBox keeps this order.
export function colorOptionsFrom(
  records: TeableRecord[] | undefined,
  field: string,
  sort: ColorSort,
): ComboOption[] {
  const recs = records ?? [];
  const label = (r: TeableRecord) => (r.fields[field] as string) ?? r.id;
  const ordered = sort.key === 'alpha'
    ? [...recs].sort((a, b) => label(a).localeCompare(label(b)))
    : [...recs]; // rainbow: preserve record order
  if (sort.dir === 'desc') ordered.reverse();
  return ordered.map(r => ({ id: r.id, label: label(r) }));
}
