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

// ── Reward header icons ─────────────────────────────────────────────────────
// The "stamp" column shows a frog's reward, given as either potions or a
// postage stamp depending on the set, so the header pairs both icons.

function IconPotion() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3h6" />
      <path d="M10 3v5L5.5 16a4 4 0 0 0 3.5 6h6a4 4 0 0 0 3.5-6L14 8V3" />
      <path d="M7 15h10" />
    </svg>
  );
}

function IconStamp() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2 2" />
      <rect x="8.5" y="8.5" width="7" height="7" />
    </svg>
  );
}

function RewardHeader() {
  return (
    <span className="weekly-reward-header" title="Potions/Stamps">
      <IconPotion />
      <span aria-hidden="true">/</span>
      <IconStamp />
    </span>
  );
}

const col = createColumnHelper<TeableRecord<WeeklyFields>>();

// Defined outside the component so the array reference is stable across renders
const columns = [
  col.accessor(r => r.fields.SetName ?? '', { id: 'name',  header: 'Name' }),
  col.accessor(r => r.fields.SetDate ?? '', { id: 'date',  header: 'Year-Set' }),
  col.accessor(r => r.fields.Stamp   ?? 0,  { id: 'stamp', header: () => <RewardHeader /> }),
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
    // Only paginate when asked; without this row model getRowModel() returns the
    // full filtered set, so paginate={false} callers see every row.
    getPaginationRowModel: paginate ? getPaginationRowModel() : undefined,
    initialState: { pagination: { pageSize } },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const leafColumns = table.getAllLeafColumns();

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
            {rows.length === 0 ? (
              // Keep the table visible (headers + a blank row) when there are no
              // matches, so an empty result reads as "0 sets" rather than a void.
              <tr className="weekly-empty-row">
                {leafColumns.map(c => (
                  <td key={c.id}>&nbsp;</td>
                ))}
              </tr>
            ) : (
              rows.map(row => (
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
              ))
            )}
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
