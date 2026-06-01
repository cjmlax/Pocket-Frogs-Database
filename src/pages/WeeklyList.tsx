import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { type SortingState } from '@tanstack/react-table';
import { fetchTable } from '../api/teable';
import WeeklyTable, { type WeeklyFields } from '../components/WeeklyTable';

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

  if (isLoading) return <p>Loading weekly sets…</p>;
  if (error) return <p>Error: {String(error)}</p>;

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

      <WeeklyTable
        data={data}
        sorting={sorting}
        onSortingChange={setSorting}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
      />
    </div>
  );
}
