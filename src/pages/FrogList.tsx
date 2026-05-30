import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import { fetchTable, searchFrogs, type TeableRecord, type FrogFilter } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { formatNum } from '../utils/format';

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

const columns = [
  col.accessor(r => r.fields.fullname ?? '—',  { id: 'name',    header: 'Frog Name' }),
  col.accessor(r => cell(r.fields.Breed),       { id: 'breed',   header: 'Breed' }),
  col.accessor(r => cell(r.fields.Primary),     { id: 'base',    header: 'Base Color' }),
  col.accessor(r => cell(r.fields.Secondary),   { id: 'sec',     header: 'Secondary' }),
  col.accessor(r => r.fields.Value   ?? 0, { id: 'value',   header: 'Value',   cell: i => formatNum(i.getValue()) }),
  col.accessor(r => r.fields.Speed   ?? 0, { id: 'speed',   header: 'Speed',   cell: i => formatNum(i.getValue()) }),
  col.accessor(r => r.fields.Stamina ?? 0, { id: 'stamina', header: 'Stamina', cell: i => formatNum(i.getValue()) }),
];

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
  const [globalFilter, setGlobalFilter] = useState(() => searchParams.get('q') ?? '');

  // Sync URL whenever committed state or result sort/filter changes.
  // Uses replace:true so every keystroke doesn't create a browser history entry.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (submitted?.breed)     { params.breedId = submitted.breed.id; params.breedLabel = submitted.breed.label; }
    if (submitted?.base)      { params.baseId  = submitted.base.id;  params.baseLabel  = submitted.base.label;  }
    if (submitted?.secondary) { params.secId   = submitted.secondary.id; params.secLabel = submitted.secondary.label; }
    if (submitted && sorting.length) { params.sort = sorting[0].id; params.dir = sorting[0].desc ? 'desc' : 'asc'; }
    if (submitted && globalFilter)   params.q = globalFilter;
    setSearchParams(params, { replace: true });
  }, [submitted, sorting, globalFilter, setSearchParams]);

  // ── Lookup tables (small, ETag-cached) ──────────────────────────────────
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedOptions = useMemo<ComboOption[]>(() => breeds?.map(r => ({ id: r.id, label: r.fields.Breed      ?? r.id })) ?? [], [breeds]);
  const baseOptions  = useMemo<ComboOption[]>(() => bases?.map( r => ({ id: r.id, label: r.fields.BaseColors  ?? r.id })) ?? [], [bases]);
  const secOptions   = useMemo<ComboOption[]>(() => secs?.map(  r => ({ id: r.id, label: r.fields.Sec_Color   ?? r.id })) ?? [], [secs]);

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
    state: { sorting, globalFilter },
    onSortingChange:      setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const hasFilter = !!(selection.breed || selection.base || selection.secondary);

  function handleSearch() {
    setSubmitted({ ...selection });
    setGlobalFilter('');
    setSorting([]);
  }

  const { pageIndex } = table.getState().pagination;
  const filteredCount  = table.getFilteredRowModel().rows.length;

  return (
    <div>
      <h1>Frog Lookup</h1>

      <div className="filter-grid">
        <ComboBox
          label="Base Color"
          options={baseOptions}
          initialSelection={selection.base ?? null}
          onSelect={opt => setSelection(s => ({ ...s, base: opt ?? undefined }))}
        />
        <ComboBox
          label="Secondary Color"
          options={secOptions}
          initialSelection={selection.secondary ?? null}
          onSelect={opt => setSelection(s => ({ ...s, secondary: opt ?? undefined }))}
        />
        <ComboBox
          label="Breed"
          options={breedOptions}
          initialSelection={selection.breed ?? null}
          onSelect={opt => setSelection(s => ({ ...s, breed: opt ?? undefined }))}
        />
      </div>

      <div className="search-actions">
        <button
          className="search-btn"
          onClick={handleSearch}
          disabled={!hasFilter || isFetching}
        >
          {isFetching ? 'Searching…' : 'Search'}
        </button>
        {error && <span className="search-error">Error: {String(error)}</span>}
      </div>

      {submitted === null ? (
        <p className="search-hint">Select at least one filter above, then click Search.</p>
      ) : isFetching ? (
        <p className="search-hint">Searching…</p>
      ) : (
        <>
          <div className="table-toolbar">
            <p className="search-hint" style={{ margin: 0 }}>{filteredCount} frogs found</p>
            <input
              className="search-input"
              type="search"
              placeholder="Filter results…"
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
            />
          </div>

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
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map(c => (
                      <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                    ))}
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
    </div>
  );
}
