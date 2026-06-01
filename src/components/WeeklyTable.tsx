import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type OnChangeFn,
} from '@tanstack/react-table';
import type { TeableRecord } from '../api/teable';

export interface WeeklyFields extends Record<string, unknown> {
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

// The eight frog-slot field keys / column ids, kept together so both the table
// and callers (e.g. breed filtering) reference one source of truth.
export const WEEKLY_FROG_FIELDS = [
  'NameA', 'NameB', 'NameC', 'NameD', 'NameE', 'NameF', 'NameG', 'NameH',
] as const;

const FROG_COL_IDS = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

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

interface WeeklyTableProps {
  data: TeableRecord<WeeklyFields>[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  pageSize?: number;
  paginate?: boolean;
  // Frog fullnames to highlight in the frog-slot cells (e.g. the focused breed).
  highlightNames?: Set<string>;
  // Shown after the page indicator, e.g. "sets".
  countLabel?: string;
}

// Shared weekly-sets table — column layout and rendering live here so the
// Weekly Sets page and the Breed Overview box stay in sync.
export default function WeeklyTable({
  data,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  pageSize = 25,
  paginate = true,
  highlightNames,
  countLabel = 'sets',
}: WeeklyTableProps) {
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange,
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
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
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => {
                  const match =
                    highlightNames &&
                    FROG_COL_IDS.has(cell.column.id) &&
                    highlightNames.has(String(cell.getValue()));
                  return (
                    <td key={cell.id} className={match ? 'weekly-frog-match' : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginate && (
        <div className="table-pagination">
          <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>←</button>
          <span>Page {pageIndex + 1} of {pageCount}</span>
          <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>→</button>
          <span className="pagination-count">{filteredCount} {countLabel}</span>
        </div>
      )}
    </>
  );
}
