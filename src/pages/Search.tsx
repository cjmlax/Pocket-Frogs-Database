import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import { fetchTable, searchFrogs, type TeableRecord, type FrogFilter } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { formatNum } from '../utils/format';
import { breedOptionsFrom, breedLevel } from '../utils/breeds';
import { useBreedSort } from '../hooks/useBreedSort';
import { useColorSort } from '../hooks/useColorSort';
import { colorOptionsFrom } from '../utils/colors';
import { MAX_PLANNER_FROGS, frogIdsParam } from '../utils/frogIds';

interface BreedFields  extends Record<string, unknown> { Breed?:      string }
interface BaseFields   extends Record<string, unknown> { BaseColors?: string }
interface SecFields    extends Record<string, unknown> { Sec_Color?:  string }

interface FrogFields extends Record<string, unknown> {
  Frog_ID?:   string;
  fullname?:  string;
  Breed?:     unknown;
  Primary?:   unknown;
  Secondary?: unknown;
  Value?:     number;
  Speed?:     number;
  Stamina?:   number;
}

// Stores a filter selection as both its record ID (for the API) and display label
// (for restoring the ComboBox text on remount)
type FilterSelection = ComboOption; // { id: string; label: string }

interface SearchState {
  breed?:     FilterSelection;
  base?:      FilterSelection;
  secondary?: FilterSelection;
}

/** Read filter selections out of URL search params */
function stateFromParams(p: URLSearchParams): SearchState {
  const s: SearchState = {};
  const breedId = p.get('breedId'), breedLabel = p.get('breedLabel');
  const baseId  = p.get('baseId'),  baseLabel  = p.get('baseLabel');
  const secId   = p.get('secId'),   secLabel   = p.get('secLabel');
  if (breedId && breedLabel) s.breed     = { id: breedId, label: breedLabel };
  if (baseId  && baseLabel)  s.base      = { id: baseId,  label: baseLabel  };
  if (secId   && secLabel)   s.secondary = { id: secId,   label: secLabel   };
  return s;
}

function IconPin() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22"/>
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79L5.5 13.5A2 2 0 0 0 4.5 15.5V17h15v-1.5a2 2 0 0 0-1-1.74l-2.39-.95A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76z"/>
    </svg>
  );
}

// Three frogs, all linked to each other — the Mutation Planner.
function IconPlanner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="7.5" x2="6.2" y2="16.5"/>
      <line x1="12" y1="7.5" x2="17.8" y2="16.5"/>
      <line x1="8" y1="19" x2="16" y2="19"/>
      <circle cx="12" cy="5" r="3"/>
      <circle cx="5" cy="19" r="3"/>
      <circle cx="19" cy="19" r="3"/>
    </svg>
  );
}

// Two overlapping hearts — Breeding Pairs.
function IconHearts() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M9 20.5S2 16.2 2 10.8A3.8 3.8 0 0 1 9 8.7a3.8 3.8 0 0 1 7 2.1c0 5.4-7 9.7-7 9.7Z"/>
      <path d="M16.6 15.6c2.6-2 5.4-4.9 5.4-8.2a3.4 3.4 0 0 0-6.2-1.9 3.4 3.4 0 0 0-3.3-1.4"/>
    </svg>
  );
}

// Icon link that sends the comparison list to another page. When the list
// doesn't fit that page it's shown greyed out and isn't a link at all.
function ComparisonLink({ to, enabled, label, disabledLabel, children }: {
  to: string;
  enabled: boolean;
  label: string;
  disabledLabel: string;
  children: React.ReactNode;
}) {
  return enabled ? (
    <Link to={to} className="compare-link" aria-label={label} title={label}>{children}</Link>
  ) : (
    <span className="compare-link is-disabled" role="link" aria-disabled="true" aria-label={disabledLabel} title={disabledLabel}>
      {children}
    </span>
  );
}

function cell(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) {
    return val
      .map(v => (typeof v === 'object' && v !== null ? String((v as Record<string, unknown>).title ?? '') : String(v)))
      .join(', ') || '—';
  }
  if (typeof val === 'object') return String((val as Record<string, unknown>).title ?? '—');
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  const s = String(val);
  return s === '' ? '—' : s;
}

const col = createColumnHelper<TeableRecord<FrogFields>>();


export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Pending filter — updated as user makes ComboBox selections
  const [selection, setSelection] = useState<SearchState>(() => stateFromParams(searchParams));

  // Committed filter — drives the API query; also restored from URL on remount
  const [submitted, setSubmitted] = useState<SearchState | null>(() => {
    const s = stateFromParams(searchParams);
    return Object.keys(s).length > 0 ? s : null;
  });

  const [sorting, setSorting] = useState<SortingState>(() => {
    const s = searchParams.get('sort'), d = searchParams.get('dir');
    return s ? [{ id: s, desc: d !== 'asc' }] : [];
  });
  // Sync URL whenever committed state or result sort changes.
  // Uses replace:true so every change doesn't create a browser history entry.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (submitted?.breed)     { params.breedId = submitted.breed.id; params.breedLabel = submitted.breed.label; }
    if (submitted?.base)      { params.baseId  = submitted.base.id;  params.baseLabel  = submitted.base.label;  }
    if (submitted?.secondary) { params.secId   = submitted.secondary.id; params.secLabel = submitted.secondary.label; }
    if (submitted && sorting.length) { params.sort = sorting[0].id; params.dir = sorting[0].desc ? 'desc' : 'asc'; }
    setSearchParams(params, { replace: true });
  }, [submitted, sorting, setSearchParams]);

  // ── Lookup tables (small, ETag-cached) ──────────────────────────────────
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedSort = useBreedSort();
  const colorSort = useColorSort();
  const breedOptions = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOptions  = useMemo<ComboOption[]>(() => colorOptionsFrom(bases, 'BaseColors', colorSort), [bases, colorSort]);
  const secOptions   = useMemo<ComboOption[]>(() => colorOptionsFrom(secs,  'Sec_Color',  colorSort), [secs,  colorSort]);

  // breed name → level number (Infinity for promotional/un-leveled breeds)
  const breedLevelMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of breeds ?? []) {
      const name = (r.fields.Breed as string) ?? '';
      if (name) map.set(name, breedLevel(r));
    }
    return map;
  }, [breeds]);

  const columns = useMemo(() => [
    col.accessor(r => cell(r.fields.Breed),     { id: 'breed',   header: 'Breed' }),
    col.accessor(r => cell(r.fields.Primary),   { id: 'base',    header: 'Base Color' }),
    col.accessor(r => cell(r.fields.Secondary), { id: 'sec',     header: 'Secondary' }),
    col.accessor(r => r.fields.Value   ?? 0, { id: 'value',   header: 'Value',   cell: i => formatNum(i.getValue()) }),
    col.accessor(r => r.fields.Speed   ?? 0, { id: 'speed',   header: 'Speed',   cell: i => formatNum(i.getValue()) }),
    col.accessor(r => r.fields.Stamina ?? 0, { id: 'stamina', header: 'Stamina', cell: i => formatNum(i.getValue()) }),
    col.accessor(r => (r.fields.Speed ?? 0) + (r.fields.Stamina ?? 0), {
      id: 'spd_stm', header: 'Spd+Stm', cell: i => formatNum(i.getValue()),
    }),
    col.accessor(r => breedLevelMap.get(cell(r.fields.Breed)) ?? Infinity, {
      id: 'level', header: 'Level',
      cell: i => Number.isFinite(i.getValue()) ? String(i.getValue()) : '—',
    }),
  ], [breedLevelMap]);

  // ── Search query ─────────────────────────────────────────────────────────
  const frogFilter: FrogFilter = {
    ...(submitted?.breed?.id     && { breed:     submitted.breed.id     }),
    ...(submitted?.base?.id      && { base:      submitted.base.id      }),
    ...(submitted?.secondary?.id && { secondary: submitted.secondary.id }),
  };

  const { data: frogs, isFetching, error } = useQuery({
    queryKey: ['frog-search', frogFilter],
    queryFn:  () => searchFrogs<FrogFields>(frogFilter),
    enabled:  submitted !== null,
  });

  const data = useMemo(() => frogs ?? [], [frogs]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const [pinned, setPinned] = useState<TeableRecord<FrogFields>[]>([]);
  const pinnedIds = useMemo(() => new Set(pinned.map(r => r.id)), [pinned]);
  const [pinnedSorting, setPinnedSorting] = useState<SortingState>([]);

  const pinnedTable = useReactTable({
    data: pinned,
    columns,
    state: { sorting: pinnedSorting },
    onSortingChange: setPinnedSorting,
    getCoreRowModel:   getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const togglePin = useCallback((row: TeableRecord<FrogFields>) => {
    setPinned(prev =>
      prev.some(r => r.id === row.id)
        ? prev.filter(r => r.id !== row.id)
        : [...prev, row]
    );
  }, []);

  // Auto-submit whenever any filter is populated. Skip the initial mount so
  // URL-restored sort/filter state isn't wiped on first render.
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return; }
    if (selection.breed || selection.base || selection.secondary) {
      setSubmitted({ ...selection });
      setSorting([]);
    }
  }, [selection]);

  const { pageIndex } = table.getState().pagination;
  const filteredCount = data.length;

  return (
    <div>
      <h1>Search</h1>

      <div className="filter-grid">
        <ComboBox
          label="Base Color"
          options={baseOptions}
          presorted
          initialSelection={selection.base ?? null}
          onSelect={opt => setSelection(s => ({ ...s, base: opt ?? undefined }))}
        />
        <ComboBox
          label="Secondary Color"
          options={secOptions}
          presorted
          initialSelection={selection.secondary ?? null}
          onSelect={opt => setSelection(s => ({ ...s, secondary: opt ?? undefined }))}
        />
        <ComboBox
          label="Breed"
          options={breedOptions}
          presorted
          initialSelection={selection.breed ?? null}
          onSelect={opt => setSelection(s => ({ ...s, breed: opt ?? undefined }))}
        />
      </div>

      {error && <p className="search-error">Error: {String(error)}</p>}

      {submitted === null ? (
        <p className="search-hint">Select at least one filter above to search.</p>
      ) : isFetching ? (
        <p className="search-hint">Searching…</p>
      ) : (
        <>
<div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {table.getFlatHeaders().map(header => (
                    <th
                      key={header.id}
                      className={header.column.getCanSort() ? 'sortable' : undefined}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'  && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </th>
                  ))}
                  <th className="pin-cell"></th>
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map(c => (
                      <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                    ))}
                    <td className="pin-cell">
                      <button
                        className={`pin-btn${pinnedIds.has(row.original.id) ? ' pinned' : ''}`}
                        onClick={() => togglePin(row.original)}
                        title={pinnedIds.has(row.original.id) ? 'Remove from comparison' : 'Pin for comparison'}
                        aria-label={pinnedIds.has(row.original.id) ? 'Remove from comparison' : 'Pin for comparison'}
                      >
                        <IconPin />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-pagination">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>←</button>
            <span>Page {pageIndex + 1} of {table.getPageCount()}</span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>→</button>
            <span className="pagination-count">{filteredCount} frogs</span>
          </div>
        </>
      )}

      {pinned.length > 0 && (
        <div className="pinned-section">
          <div className="pinned-header">
            <div className="pinned-title">
              <h2 style={{ margin: 0 }}>Comparison</h2>
              <ComparisonLink
                to={`/planner?frogs=${frogIdsParam(pinned.map(r => r.fields.Frog_ID))}`}
                enabled={pinned.length <= MAX_PLANNER_FROGS}
                label="Open these frogs in the Mutation Planner"
                disabledLabel={`The Mutation Planner holds up to ${MAX_PLANNER_FROGS} frogs`}
              >
                <IconPlanner />
              </ComparisonLink>
              <ComparisonLink
                to={`/breeding?pair=${frogIdsParam(pinned.map(r => r.fields.Frog_ID))}`}
                enabled={pinned.length === 2}
                label="Open this pair in Breeding Pairs"
                disabledLabel="Pin exactly 2 frogs to open them in Breeding Pairs"
              >
                <IconHearts />
              </ComparisonLink>
            </div>
            <button className="csv-btn" onClick={() => setPinned([])}>Clear all</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {pinnedTable.getFlatHeaders().map(header => (
                    <th
                      key={header.id}
                      className={header.column.getCanSort() ? 'sortable' : undefined}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'  && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </th>
                  ))}
                  <th className="pin-cell"></th>
                </tr>
              </thead>
              <tbody>
                {pinnedTable.getRowModel().rows.map(row => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map(c => (
                      <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                    ))}
                    <td className="pin-cell">
                      <button
                        className="pin-btn pinned"
                        onClick={() => togglePin(row.original)}
                        title="Remove from comparison"
                        aria-label="Remove from comparison"
                      >
                        <IconPin />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
