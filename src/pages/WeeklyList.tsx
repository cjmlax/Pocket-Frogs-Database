import { useMemo, useState, useEffect } from 'react';
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
import { fetchTable, type TeableRecord } from '../api/teable';

interface WeeklyFields extends Record<string, unknown> {
  SetName?: string;
  SetDate?: string;
  Stamp?: number;
  LevelReq?: number;
  NameA?: string;
  NameB?: string;
  NameC?: string;
  NameD?: string;
  NameE?: string;
  NameF?: string;
  NameG?: string;
  NameH?: string;
}

const col = createColumnHelper<TeableRecord<WeeklyFields>>();

// Defined outside the component so the array reference is stable across renders
const columns = [
  col.accessor(r => r.fields.SetName ?? '', { id: 'name',  header: 'Name' }),
  col.accessor(r => r.fields.SetDate ?? '', { id: 'date',  header: 'Year-Set' }),
  col.accessor(r => r.fields.Stamp   ?? 0,  { id: 'stamp', header: 'P/S' }),
  col.accessor(r => r.fields.LevelReq ?? '', { id: 'level', header: 'Min Lvl' }),
  col.accessor(r => r.fields.NameA ?? '', { id: 'a', header: 'Frog A', enableSorting: false }),
  col.accessor(r => r.fields.NameB ?? '', { id: 'b', header: 'Frog B', enableSorting: false }),
  col.accessor(r => r.fields.NameC ?? '', { id: 'c', header: 'Frog C', enableSorting: false }),
  col.accessor(r => r.fields.NameD ?? '', { id: 'd', header: 'Frog D', enableSorting: false }),
  col.accessor(r => r.fields.NameE ?? '', { id: 'e', header: 'Frog E', enableSorting: false }),
  col.accessor(r => r.fields.NameF ?? '', { id: 'f', header: 'Frog F', enableSorting: false }),
  col.accessor(r => r.fields.NameG ?? '', { id: 'g', header: 'Frog G', enableSorting: false }),
  col.accessor(r => r.fields.NameH ?? '', { id: 'h', header: 'Frog H', enableSorting: false }),
];

export default function WeeklyList() {
  const { data: records, isLoading, error } = useQuery({
    queryKey: ['table', 'weekly'],
    queryFn: () => fetchTable<WeeklyFields>('weekly'),
  });

  const [searchParams, setSearchParams] = useSearchParams();

  // Restore sort/filter from URL so state survives navigation
  const [sorting, setSorting] = useState<SortingState>(() => {
    const s = searchParams.get('sort'), d = searchParams.get('dir');
    return s ? [{ id: s, desc: d !== 'asc' }] : [{ id: 'date', desc: true }];
  });
  const [globalFilter, setGlobalFilter] = useState(() => searchParams.get('q') ?? '');

  // Keep URL in sync so navigating away and back restores state
  useEffect(() => {
    const params: Record<string, string> = {};
    if (sorting.length) { params.sort = sorting[0].id; params.dir = sorting[0].desc ? 'desc' : 'asc'; }
    if (globalFilter)   params.q = globalFilter;
    setSearchParams(params, { replace: true });
  }, [sorting, globalFilter, setSearchParams]);

  const data = useMemo(() => records ?? [], [records]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  if (isLoading) return <p>Loading weekly sets…</p>;
  if (error) return <p>Error: {String(error)}</p>;

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div>
      <div className="table-toolbar">
        <h1>Weekly Sets</h1>
        <input
          className="search-input"
          type="search"
          placeholder="Search…"
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
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>←</button>
        <span>Page {pageIndex + 1} of {pageCount}</span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>→</button>
        <span className="pagination-count">{filteredCount} sets</span>
      </div>
    </div>
  );
}
