import type { TeableRecord } from '../api/teable';
import type { ComboOption } from '../components/ComboBox';
import type { BreedSort } from '../hooks/useBreedSort';

// Breed "Level" is a link field shaped { id, title: "3" }; parse the title.
export function breedLevel(r: TeableRecord): number {
  const lvl = r.fields.Level;
  const title = lvl && typeof lvl === 'object' ? (lvl as { title?: unknown }).title : lvl;
  const n = parseInt(String(title ?? ''), 10);
  return Number.isNaN(n) ? Infinity : n;
}

// Position in the in-game Froggydex (dex_order field). Unnumbered breeds sort
// last, falling back to level so new frogs still land roughly in place.
function breedDex(r: TeableRecord): number {
  const n = r.fields.dex_order;
  return typeof n === 'number' ? n : Infinity;
}

// Infinity - Infinity is NaN, which sort() treats as unordered; compare explicitly.
function cmpNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Builds Breed ComboBox options, fully ordered by the active sort key and
// direction. Breed boxes always pass presorted so the ComboBox keeps this order.
export function breedOptionsFrom(
  breeds: TeableRecord[] | undefined,
  sort: BreedSort,
): ComboOption[] {
  const recs = breeds ?? [];
  const label = (r: TeableRecord) => (r.fields.Breed as string) ?? r.id;
  const cmp = sort.key === 'dex'
    ? (a: TeableRecord, b: TeableRecord) =>
        cmpNum(breedDex(a), breedDex(b)) || cmpNum(breedLevel(a), breedLevel(b)) || label(a).localeCompare(label(b))
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
