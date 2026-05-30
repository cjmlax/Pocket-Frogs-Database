import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchTable, fetchBreedFrogs } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { formatNum } from '../utils/format';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  fullname?:  string;
  Value?:     number;
  Speed?:     number;
  Stamina?:   number;
}

// ── Stat icons ────────────────────────────────────────────────────────────────

function IconCoins() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <ellipse cx="12" cy="5" rx="8" ry="2.5"/>
      <path d="M4 5v3.5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V5"/>
      <path d="M4 8.5v3.5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V8.5"/>
      <path d="M4 12v3.5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V12"/>
      <path d="M4 16v3.5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V16"/>
    </svg>
  );
}

function IconLightning() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/>
    </svg>
  );
}

function IconDumbbell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5v11M17.5 6.5v11"/>
      <path d="M3 9h4v6H3zM17 9h4v6h-4z"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
    </svg>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

type StatKey = 'Value' | 'Speed' | 'Stamina' | 'Race';

const STAT_OPTIONS: { value: StatKey; icon: ReactNode; label: string }[] = [
  { value: 'Value',   icon: <IconCoins/>,    label: 'Value' },
  { value: 'Speed',   icon: <IconLightning/>, label: 'Speed' },
  { value: 'Stamina', icon: <IconDumbbell/>, label: 'Stamina' },
  { value: 'Race',    icon: <IconTrophy/>,   label: 'Speed + Stamina' },
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
  if (type === 'min') return Math.min(...nums).toLocaleString();
  if (type === 'max') return Math.max(...nums).toLocaleString();
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length).toLocaleString();
}

const HOVER_CLASSES = ['row-hover', 'col-hover', 'cell-hover'] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BreedOverview() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tableRef = useRef<HTMLTableElement>(null);

  // Single breed state — updated immediately when user confirms a selection.
  // Clearing the ComboBox keeps the previous breed visible.
  const [breed, setBreed] = useState<ComboOption | null>(() => {
    const id = searchParams.get('breedId'), label = searchParams.get('breedLabel');
    return id && label ? { id, label } : null;
  });

  // Stat is independent of the breed query — changing it recomputes gridMap
  // instantly without a new API call.
  const [stat, setStat] = useState<StatKey>(() => {
    const s = searchParams.get('stat') as StatKey | null;
    return STAT_OPTIONS.find(o => o.value === s)?.value ?? 'Value';
  });

  useEffect(() => {
    if (!breed) return;
    setSearchParams(
      { breedId: breed.id, breedLabel: breed.label, stat },
      { replace: true },
    );
  }, [breed, stat, setSearchParams]);

  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedOptions = useMemo<ComboOption[]>(
    () => breeds?.map(r => ({ id: r.id, label: r.fields.Breed ?? r.id })) ?? [],
    [breeds],
  );

  const { data: frogs, isFetching, error } = useQuery({
    queryKey: ['breed-overview', breed?.id],
    queryFn:  () => fetchBreedFrogs<FrogFields>(breed!.id),
    enabled:  breed !== null,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // gridMap depends on stat directly so changing the stat button is instant.
  const gridMap = useMemo(() => {
    if (!frogs || !breed) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const frog of frogs) {
      const name = frog.fields.fullname;
      if (!name) continue;
      const val = getStat(frog.fields, stat);
      if (val !== null) map.set(name, val);
    }
    return map;
  }, [frogs, breed, stat]);

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
    return `${baseName} ${secName} ${breed?.label ?? ''}`;
  }

  // ── Crosshair hover ───────────────────────────────────────────────────────

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
          initialSelection={breed}
          onSelect={opt => { if (opt) setBreed(opt); }}
        />
        <div className="combobox-field">
          <label className="combobox-label">Stat</label>
          <div className="settings-row">
            {STAT_OPTIONS.map(({ value, icon, label }) => (
              <button
                key={value}
                className={`settings-theme-opt${stat === value ? ' active' : ''}`}
                onClick={() => setStat(value)}
                aria-label={label}
                title={label}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="search-error">Error loading data.</p>}

      {breed === null ? (
        <p className="search-hint">Select a breed above to generate the grid.</p>
      ) : isFetching ? (
        <p className="search-hint">Loading frogs for {breed.label}…</p>
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
                          {v !== null ? formatNum(v) : '—'}
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
