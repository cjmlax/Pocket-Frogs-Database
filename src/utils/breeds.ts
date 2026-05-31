import type { TeableRecord } from '../api/teable';
import type { ComboOption } from '../components/ComboBox';
import type { BreedSort } from '../hooks/useBreedSort';

// Breed "Level" is a link field shaped { id, title: "3" }; parse the title.
function breedLevel(r: TeableRecord): number {
  const lvl = r.fields.Level;
  const title = lvl && typeof lvl === 'object' ? (lvl as { title?: unknown }).title : lvl;
  const n = parseInt(String(title ?? ''), 10);
  return Number.isNaN(n) ? Infinity : n;
}

// Builds Breed ComboBox options, fully ordered by the active sort key and
// direction. Breed boxes always pass presorted so the ComboBox keeps this order.
export function breedOptionsFrom(
  breeds: TeableRecord[] | undefined,
  sort: BreedSort,
): ComboOption[] {
  const recs = breeds ?? [];
  const label = (r: TeableRecord) => (r.fields.Breed as string) ?? r.id;
  const cmp = sort.key === 'level'
    ? (a: TeableRecord, b: TeableRecord) => breedLevel(a) - breedLevel(b) || label(a).localeCompare(label(b))
    : (a: TeableRecord, b: TeableRecord) => label(a).localeCompare(label(b));
  const ordered = [...recs].sort(cmp);
  if (sort.dir === 'desc') ordered.reverse();
  return ordered.map(r => {
    const lvl = breedLevel(r);
    return {
      id: r.id,
      label: label(r),
      detail: Number.isFinite(lvl) ? `Lvl ${lvl}` : undefined,
    };
  });
}
