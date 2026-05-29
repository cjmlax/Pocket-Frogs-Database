import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchTable, fetchBreedFrogs } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  fullname?:  string;
  Value?:     number;
  Speed?:     number;
  Stamina?:   number;
}

type StatKey = 'Value' | 'Speed' | 'Stamina' | 'Race';
const STAT_OPTIONS: { value: StatKey; label: string }[] = [
  { value: 'Value',   label: 'Value' },
  { value: 'Speed',   label: 'Speed' },
  { value: 'Stamina', label: 'Stamina' },
  { value: 'Race',    label: 'Speed + Stamina' },
];

function getStat(fields: FrogFields, stat: StatKey): number | null {
  if (stat === 'Race') {
    const s = fields.Speed ?? null, st = fields.Stamina ?? null;
    if (s === null && st === null) return null;
    return (s ?? 0) + (st ?? 0);
  }
  const v = fields[stat as keyof FrogFields];
  return typeof v === 'number' ? v : null;
}

function summarize(nums: number[], type: 'min' | 'avg' | 'max'): string {
  if (!nums.length) return '—';
  if (type === 'min') return String(Math.min(...nums));
  if (type === 'max') return String(Math.max(...nums));
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(0);
}

const HOVER_CLASSES = ['row-hover', 'col-hover', 'cell-hover'] as const;

export default function BreedOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tableRef = useRef<HTMLTableElement>(null);

  const [breedSelection, setBreedSelection] = useState<ComboOption | null>(() => {
    const id = searchParams.get('breedId'), label = searchParams.get('breedLabel');
    return id && label ? { id, label } : null;
  });
  const [stat, setStat] = useState<StatKey>(() => {
    const s = searchParams.get('stat') as StatKey | null;
    return STAT_OPTIONS.find(o => o.value === s)?.value ?? 'Value';
  });
  const [submitted, setSubmitted] = useState<{ breed: ComboOption; stat: StatKey } | null>(() => {
    const id = searchParams.get('breedId'), label = searchParams.get('breedLabel');
    const s = searchParams.get('stat') as StatKey | null;
    return id && label ? { breed: { id, label }, stat: s ?? 'Value' } : null;
  });

  useEffect(() => {
    if (!submitted) return;
    setSearchParams(
      { breedId: submitted.breed.id, breedLabel: submitted.breed.label, stat: submitted.stat },
      { replace: true },
    );
  }, [submitted, setSearchParams]);

  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedOptions = useMemo<ComboOption[]>(
    () => breeds?.map(r => ({ id: r.id, label: r.fields.Breed ?? r.id })) ?? [],
    [breeds],
  );

  const { data: frogs, isFetching, error } = useQuery({
    queryKey: ['breed-overview', submitted?.breed.id],
    queryFn:  () => fetchBreedFrogs<FrogFields>(submitted!.breed.id),
    enabled:  submitted !== null,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // Keys are the frog's fullname ("Base Sec Breed") — mirrors the original
  // BreedDataDisplay logic and avoids parsing linked-record field formats.
  const gridMap = useMemo(() => {
    if (!frogs || !submitted) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const frog of frogs) {
      const name = frog.fields.fullname;
      if (!name) continue;
      const val = getStat(frog.fields, submitted.stat);
      if (val !== null) map.set(name, val);
    }
    return map;
  }, [frogs, submitted]);

  const allValues = useMemo(() => Array.from(gridMap.values()), [gridMap]);
  const globalMin = allValues.length ? Math.min(...allValues) : null;
  const globalMax = allValues.length ? Math.max(...allValues) : null;

  function cellClass(val: number | null): string {
    if (val === null || globalMin === globalMax) return '';
    if (val === globalMax) return 'breed-cell-max';
    if (val === globalMin) return 'breed-cell-min';
    return '';
  }

  function gridKey(baseName: string, secName: string) {
    return `${baseName} ${secName} ${submitted?.breed.label ?? ''}`;
  }

  // ── Crosshair hover via event delegation ──────────────────────────────────
  // Direct DOM class toggling avoids re-rendering the whole table on mousemove.

  function clearHover() {
    tableRef.current?.querySelectorAll<HTMLElement>('.row-hover,.col-hover,.cell-hover')
      .forEach(el => el.classList.remove(...HOVER_CLASSES));
  }

  function handleMouseOver(e: React.MouseEvent<HTMLTableElement>) {
    const cell = (e.target as HTMLElement).closest('td,th') as HTMLElement | null;
    if (!cell) return;
    const table = tableRef.current!;
    clearHover();
    const rowId = cell.dataset.row;
    const colId = cell.dataset.col;
    if (rowId) table.querySelectorAll(`[data-row="${rowId}"]`).forEach(el => el.classList.add('row-hover'));
    if (colId) table.querySelectorAll(`[data-col="${colId}"]`).forEach(el => el.classList.add('col-hover'));
    if (rowId && colId) {
      table.querySelector(`[data-row="${rowId}"][data-col="${colId}"]`)?.classList.add('cell-hover');
    }
  }

  return (
    <div>
      <h1>Breed Overview</h1>

      <div className="filter-grid">
        <ComboBox
          label="Breed"
          options={breedOptions}
          initialSelection={breedSelection}
          onSelect={opt => setBreedSelection(opt)}
        />
        <div className="combobox-field">
          <label className="combobox-label" htmlFor="stat-select">Stat</label>
          <select
            id="stat-select"
            className="search-input breed-stat-select"
            value={stat}
            onChange={e => setStat(e.target.value as StatKey)}
          >
            {STAT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="search-actions">
        <button
          className="search-btn"
          onClick={() => breedSelection && setSubmitted({ breed: breedSelection, stat })}
          disabled={breedSelection === null || isFetching}
        >
          {isFetching ? 'Loading…' : 'Search'}
        </button>
        {error && <span className="search-error">Error loading data.</span>}
      </div>

      {submitted === null ? (
        <p className="search-hint">Select a breed above, then click Generate.</p>
      ) : isFetching ? (
        <p className="search-hint">Loading frogs for {submitted.breed.label}…</p>
      ) : bases && secs ? (
        <div className="table-wrapper breed-grid-wrapper">
          <table
            className="breed-grid"
            ref={tableRef}
            onMouseOver={handleMouseOver}
            onMouseLeave={clearHover}
          >
            <thead>
              <tr>
                <th className="breed-corner"></th>
                {secs.map(sec => (
                  <th key={sec.id} className="breed-col-header" data-col={sec.id}>
                    {sec.fields.Sec_Color ?? sec.id}
                  </th>
                ))}
                <th className="breed-summary-divider breed-summary" data-col="s-min">Min</th>
                <th className="breed-summary" data-col="s-avg">Avg</th>
                <th className="breed-summary" data-col="s-max">Max</th>
              </tr>
            </thead>
            <tbody>
              {bases.map(base => {
                const baseName = base.fields.BaseColors ?? base.id;
                const rowNums: number[] = [];
                secs.forEach(sec => {
                  const v = gridMap.get(gridKey(baseName, sec.fields.Sec_Color ?? sec.id));
                  if (v !== undefined) rowNums.push(v);
                });
                return (
                  <tr key={base.id}>
                    <th className="breed-row-label" data-row={base.id}>{baseName}</th>
                    {secs.map(sec => {
                      const secName = sec.fields.Sec_Color ?? sec.id;
                      const v = gridMap.get(gridKey(baseName, secName)) ?? null;
                      return (
                        <td
                          key={sec.id}
                          className={cellClass(v)}
                          data-row={base.id}
                          data-col={sec.id}
                        >
                          {v ?? '—'}
                        </td>
                      );
                    })}
                    <td className="breed-summary-divider breed-summary" data-row={base.id} data-col="s-min">{summarize(rowNums, 'min')}</td>
                    <td className="breed-summary" data-row={base.id} data-col="s-avg">{summarize(rowNums, 'avg')}</td>
                    <td className="breed-summary" data-row={base.id} data-col="s-max">{summarize(rowNums, 'max')}</td>
                  </tr>
                );
              })}

              {(['min', 'avg', 'max'] as const).map((type, i) => (
                <tr key={type} className={`breed-footer${i === 0 ? ' breed-footer-divider' : ''}`}>
                  <th className="breed-row-label breed-summary-label">
                    {type === 'min' ? 'Min' : type === 'avg' ? 'Avg' : 'Max'}
                  </th>
                  {secs.map(sec => {
                    const secName = sec.fields.Sec_Color ?? sec.id;
                    const colNums: number[] = [];
                    bases.forEach(base => {
                      const baseName = base.fields.BaseColors ?? base.id;
                      const v = gridMap.get(gridKey(baseName, secName));
                      if (v !== undefined) colNums.push(v);
                    });
                    return (
                      <td key={sec.id} data-row={`f-${type}`} data-col={sec.id}>{summarize(colNums, type)}</td>
                    );
                  })}
                  <td className="breed-summary-divider breed-summary" data-row={`f-${type}`} data-col="s-min">
                    {type === 'min' ? summarize(allValues, 'min') : '—'}
                  </td>
                  <td className="breed-summary" data-row={`f-${type}`} data-col="s-avg">{type === 'avg' ? summarize(allValues, 'avg') : '—'}</td>
                  <td className="breed-summary" data-row={`f-${type}`} data-col="s-max">{type === 'max' ? summarize(allValues, 'max') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
