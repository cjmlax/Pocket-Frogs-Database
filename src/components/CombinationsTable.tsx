import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchTable } from '../api/teable';
import ImageLightbox from './ImageLightbox';
import { frogIdsParam, frogPath, frogSearch } from '../utils/frogIds';

// One known Chroma / Glass combination. Titles are the frogs' Frog_IDs.
export interface CombinationRow {
  type:         'Chroma' | 'Glass';
  thisTitle:    string | null;
  thisName:     string;
  partnerTitle: string | null;
  partnerName:  string;
  resultTitle:  string | null;
  resultName:   string;
  screenshots:  string[];
}

interface BreedFields extends Record<string, unknown> {
  Breed_ID?: string;
  Level?:    unknown;   // link → { id, title } where title is the level number
}

// Pulls the linked record's id from a Teable link field ({ id, title } or array).
function linkId(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
  return null;
}

// The breed code from a Frog_ID ("Base:Sec:Breed" → "Breed").
function breedCode(frogId: string | null): string | null {
  return frogId?.split(':')[2] ?? null;
}

// Cycles All → Same Breed → Same Level, comparing each partner to this frog.
const partnerFilters = ['all', 'breed', 'level'] as const;
type PartnerFilter = (typeof partnerFilters)[number];
const partnerFilterLabels: Record<PartnerFilter, string> = {
  all:   'All Mutations',
  breed: 'Same Breed',
  level: 'Same Level',
};

type SortKey = 'thisName' | 'partnerName' | 'resultName';
interface Sort { key: SortKey; desc: boolean }

function SortHeader({ sort, k, onSort, children }: {
  sort: Sort | null; k: SortKey; onSort: (k: SortKey) => void; children: string;
}) {
  return (
    <th className="sortable" onClick={() => onSort(k)}>
      {children}
      {sort?.key === k && (sort.desc ? ' ↓' : ' ↑')}
    </th>
  );
}

function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

// Box with an arrow leaving its upper-right corner — opens the pair elsewhere.
function IconLinkOut() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}

// `highlight` picks out one word of the name (the mutation type in a result
// frog, e.g. Aqua *Chroma* Crustalli), styled like Weekly Sets' breed matches.
function FrogLink({ title, name, highlight }: { title: string | null; name: string; highlight?: string }) {
  const text = highlight
    ? name.split(' ').map((word, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {word === highlight ? <span className="weekly-frog-match">{word}</span> : word}
        </span>
      ))
    : name;
  return title ? <a href={frogPath(title)} className="plain-link">{text}</a> : <>{text}</>;
}

// Chroma and Glass combinations in one table: the result frog's mutation type
// is highlighted in its name, and each row links to the pair in Breeding Pairs.
export default function CombinationsTable({ rows, thisHeader }: {
  rows: CombinationRow[];
  thisHeader: string;
}) {
  const [lightbox, setLightbox] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<PartnerFilter>('all');
  const [sort, setSort] = useState<Sort | null>(null);

  // Breed code → level record id, for the Same Level filter (shared, ETag-cached).
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const levelByBreed = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of breeds ?? []) {
      const level = linkId(b.fields.Level);
      if (b.fields.Breed_ID != null && level) map.set(String(b.fields.Breed_ID), level);
    }
    return map;
  }, [breeds]);

  const visibleRows = useMemo(() => {
    const filtered = filter === 'all' ? rows : rows.filter(row => {
      const thisBreed = breedCode(row.thisTitle), partnerBreed = breedCode(row.partnerTitle);
      if (thisBreed == null || partnerBreed == null) return false;
      if (filter === 'breed') return thisBreed === partnerBreed;
      const thisLevel = levelByBreed.get(thisBreed);
      return thisLevel != null && thisLevel === levelByBreed.get(partnerBreed);
    });
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = a[sort.key].localeCompare(b[sort.key]);
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, filter, sort, levelByBreed]);

  // Header clicks cycle ascending → descending → unsorted, like Weekly Sets.
  function toggleSort(key: SortKey) {
    setSort(prev =>
      prev?.key !== key ? { key, desc: false }
        : !prev.desc     ? { key, desc: true }
        : null,
    );
  }

  return (
    <div className="special-combo-panel">
      <h2 className="breed-weekly-title">
        Known Mutations{' '}
        <span className="breed-weekly-count">({visibleRows.length})</span>
      </h2>
      <button
        type="button"
        className={`weekly-hide-completed-btn${filter === 'all' ? '' : ' active'}`}
        onClick={() => setFilter(partnerFilters[(partnerFilters.indexOf(filter) + 1) % partnerFilters.length])}
      >
        {partnerFilterLabels[filter]}
      </button>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <SortHeader sort={sort} onSort={toggleSort} k="thisName">{thisHeader}</SortHeader>
              <SortHeader sort={sort} onSort={toggleSort} k="partnerName">Partner</SortHeader>
              <SortHeader sort={sort} onSort={toggleSort} k="resultName">Result</SortHeader>
              <th className="pin-cell"></th>
              <th className="pin-cell"></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={5} className="search-hint">No known mutations.</td></tr>
            ) : visibleRows.map((row, i) => (
              <tr key={i}>
                <td><FrogLink title={row.thisTitle} name={row.thisName} /></td>
                <td><FrogLink title={row.partnerTitle} name={row.partnerName} /></td>
                <td><FrogLink title={row.resultTitle} name={row.resultName} highlight={row.type} /></td>
                <td className="pin-cell">
                  {row.thisTitle && row.partnerTitle && (
                    <Link
                      to={`/breeding${frogSearch('pair', frogIdsParam([row.thisTitle, row.partnerTitle]))}`}
                      className="screenshot-btn"
                      aria-label={`Open ${row.thisName} × ${row.partnerName} in Breeding Pairs`}
                      title="Open in Breeding Pairs"
                    >
                      <IconLinkOut />
                    </Link>
                  )}
                </td>
                <td className="pin-cell">
                  {row.screenshots.length > 0 && (
                    <button
                      className="screenshot-btn"
                      onClick={() => setLightbox(row.screenshots)}
                      aria-label={`View ${row.type} screenshot`}
                      title="View screenshot"
                    >
                      <IconCamera />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lightbox && (
        <ImageLightbox images={lightbox} alt="Combination screenshot" onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
