import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';
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

interface BreedFields  extends Record<string, unknown> { Breed?:      string }
interface BaseFields   extends Record<string, unknown> { BaseColors?: string }
interface SecFields    extends Record<string, unknown> { Sec_Color?:  string }

interface FrogFields extends Record<string, unknown> {
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


export default function FrogList() {
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
      <h1>Frog Lookup</h1>

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
            <h2 style={{ margin: 0 }}>Comparison</h2>
            <button className="csv-btn" onClick={() => setPinned([])}>Clear all</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Breed</th>
                  <th>Base Color</th>
                  <th>Secondary</th>
                  <th>Value</th>
                  <th>Speed</th>
                  <th>Stamina</th>
                  <th>Spd+Stm</th>
                  <th>Level</th>
                  <th className="pin-cell"></th>
                </tr>
              </thead>
              <tbody>
                {pinned.map(r => (
                  <tr key={r.id}>
                    <td>{cell(r.fields.Breed)}</td>
                    <td>{cell(r.fields.Primary)}</td>
                    <td>{cell(r.fields.Secondary)}</td>
                    <td>{formatNum(r.fields.Value ?? 0)}</td>
                    <td>{formatNum(r.fields.Speed ?? 0)}</td>
                    <td>{formatNum(r.fields.Stamina ?? 0)}</td>
                    <td>{formatNum((r.fields.Speed ?? 0) + (r.fields.Stamina ?? 0))}</td>
                    <td>{(() => { const lvl = breedLevelMap.get(cell(r.fields.Breed)) ?? Infinity; return Number.isFinite(lvl) ? String(lvl) : '—'; })()}</td>
                    <td className="pin-cell">
                      <button
                        className="pin-btn pinned"
                        onClick={() => togglePin(r)}
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
