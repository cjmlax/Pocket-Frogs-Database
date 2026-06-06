import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueries } from '@tanstack/react-query';
import { type SortingState } from '@tanstack/react-table';
import { fetchTable, fetchBreedFrogs, fetchCombos, fetchFrogById } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import WeeklyTable, { type WeeklyFields, WEEKLY_FROG_FIELDS } from '../components/WeeklyTable';
import { attachmentUrl } from '../utils/attachments';
import { formatNum } from '../utils/format';
import { downloadCsv } from '../utils/csv';
import { breedOptionsFrom } from '../utils/breeds';
import { useBreedSort } from '../hooks/useBreedSort';
import { useSpoilers } from '../hooks/useSpoilers';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BreedFields extends Record<string, unknown> {
  Breed?:        string;
  Level?:        unknown;   // link → { id, title } where title is the level number
  Version?:      string;
  Promotional?:  boolean;
  Stock_Image?:  unknown;  // attachment field
}
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  fullname?:  string;
  Value?:     number;
  Speed?:     number;
  Stamina?:   number;
}
interface LevelFields extends Record<string, unknown> {
  Level_No?:   number;
  Hatch?:      string;
  Growth?:     string;
  Flies?:      number;
  Rarity?:     string;
  Restricted?: boolean;
}

interface ComboFields extends Record<string, unknown> {
  'Frog 1'?:      unknown;
  'Frog 2'?:      unknown;
  'Result Frog'?: unknown;
  'Screenshot'?:  unknown;
}

// Pulls the linked record's id from a Teable link field ({ id, title } or array).
function linkId(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
  return null;
}

function linkTitle(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'title' in first) return String((first as { title: unknown }).title);
  return null;
}

function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
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

// Raw numeric summary (no locale separators) for CSV export — '' when empty.
function summarizeRaw(nums: number[], type: 'min' | 'avg' | 'max'): number | '' {
  if (!nums.length) return '';
  if (type === 'min') return Math.min(...nums);
  if (type === 'max') return Math.max(...nums);
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
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
  const { data: levels } = useQuery({ queryKey: ['table', 'levels'], queryFn: () => fetchTable<LevelFields>('levels') });

  const breedSort = useBreedSort();
  const breedOptions = useMemo<ComboOption[]>(
    () => breedOptionsFrom(breeds, breedSort),
    [breeds, breedSort],
  );

  // Resolve the selected breed to its record + linked Level row for the info box.
  // Independent of the stat selector and the frog grid.
  const breedInfo = useMemo(() => {
    if (!breed || !breeds) return null;
    const rec = breeds.find(b => b.id === breed.id);
    if (!rec) return null;
    const levelId = linkId(rec.fields.Level);
    const level = levels?.find(l => l.id === levelId) ?? null;
    const image = attachmentUrl(rec.fields.Stock_Image);
    return { rec, level, image };
  }, [breed, breeds, levels]);

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

  // ── Weekly sets featuring this breed ──────────────────────────────────────
  const { data: weekly } = useQuery({
    queryKey: ['table', 'weekly'],
    queryFn:  () => fetchTable<WeeklyFields>('weekly'),
  });

  // Fullnames of every frog in the selected breed, used to match weekly slots.
  const breedFrogNames = useMemo(() => {
    const names = new Set<string>();
    for (const frog of frogs ?? []) {
      if (frog.fields.fullname) names.add(frog.fields.fullname);
    }
    return names;
  }, [frogs]);

  const weeklyMatches = useMemo(() => {
    if (!weekly || breedFrogNames.size === 0) return [];
    return weekly.filter(set =>
      WEEKLY_FROG_FIELDS.some(f => {
        const name = set.fields[f];
        return typeof name === 'string' && breedFrogNames.has(name);
      }),
    );
  }, [weekly, breedFrogNames]);

  const [weeklySort, setWeeklySort] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { spoilers } = useSpoilers();

  // ── Chroma / Glass combinations ───────────────────────────────────────────
  const { data: chromaCombos } = useQuery({ queryKey: ['table', 'chroma'], queryFn: () => fetchCombos<ComboFields>('chroma') });
  const { data: glassCombos  } = useQuery({ queryKey: ['table', 'glass'],  queryFn: () => fetchCombos<ComboFields>('glass')  });

  const breedFrogIds = useMemo(() => {
    const ids = new Set<string>();
    for (const frog of frogs ?? []) ids.add(frog.id);
    return ids;
  }, [frogs]);

  const specials = useMemo(() => {
    if (!breedFrogIds.size) return [];
    const find = (combos: typeof chromaCombos, type: 'Chroma' | 'Glass') =>
      (combos ?? []).flatMap(rec => {
        const id1 = linkId(rec.fields['Frog 1']);
        const id2 = linkId(rec.fields['Frog 2']);
        const isBreed1 = breedFrogIds.has(id1 ?? '');
        const isBreed2 = breedFrogIds.has(id2 ?? '');
        if (!isBreed1 && !isBreed2) return [];
        const thisId       = isBreed1 ? id1 : id2;
        const partnerId    = isBreed1 ? id2 : id1;
        const partnerTitle = isBreed1 ? linkTitle(rec.fields['Frog 2']) : linkTitle(rec.fields['Frog 1']);
        const resultId     = linkId(rec.fields['Result Frog']);
        return [{ type, thisId, partnerId, partnerTitle, resultId, screenshot: attachmentUrl(rec.fields['Screenshot']) }];
      });
    return [...find(chromaCombos, 'Chroma'), ...find(glassCombos, 'Glass')];
  }, [breedFrogIds, chromaCombos, glassCombos]);

  const thisFrogNames = specials.map(
    s => (frogs ?? []).find(f => f.id === s.thisId)?.fields.fullname ?? '—',
  );

  const partnerQueries = useQueries({
    queries: specials.map(s => ({
      queryKey:  ['frog', s.partnerId],
      queryFn:   () => fetchFrogById<FrogFields>(s.partnerId!),
      enabled:   !!s.partnerId,
      staleTime: 1000 * 60 * 60 * 24,
    })),
  });
  const partnerNames = specials.map(
    (s, i) => partnerQueries[i]?.data?.fields.fullname ?? s.partnerTitle ?? '—',
  );

  const resultQueries = useQueries({
    queries: specials.map(s => ({
      queryKey:  ['frog', s.resultId],
      queryFn:   () => fetchFrogById<FrogFields>(s.resultId!),
      enabled:   !!s.resultId,
      staleTime: 1000 * 60 * 60 * 24,
    })),
  });
  const resultNames = specials.map(
    (_s, i) => resultQueries[i]?.data?.fields.fullname ?? '—',
  );

  function cellClass(val: number | null): string {
    if (val === null || globalMin === globalMax) return '';
    if (val === globalMax) return 'breed-cell-max';
    if (val === globalMin) return 'breed-cell-min';
    return '';
  }

  function gridKey(baseName: string, secName: string) {
    return `${baseName} ${secName} ${breed?.label ?? ''}`;
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  function handleExportGrid() {
    if (!bases || !secs || !breed) return;
    const secNames = secs.map(sec => sec.fields.Sec_Color ?? sec.id);
    const rows: (string | number | '')[][] = [
      [`Base \\ Secondary`, ...secNames, 'Min', 'Avg', 'Max'],
    ];

    bases.forEach(base => {
      const baseName = base.fields.BaseColors ?? base.id;
      const rowNums: number[] = [];
      const cells = secNames.map(secName => {
        const v = gridMap.get(gridKey(baseName, secName));
        if (v !== undefined) rowNums.push(v);
        return v ?? '';
      });
      rows.push([baseName, ...cells,
        summarizeRaw(rowNums, 'min'), summarizeRaw(rowNums, 'avg'), summarizeRaw(rowNums, 'max')]);
    });

    (['min', 'avg', 'max'] as const).forEach(type => {
      const label = type === 'min' ? 'Min' : type === 'avg' ? 'Avg' : 'Max';
      const cells = secNames.map(secName => {
        const colNums: number[] = [];
        bases.forEach(base => {
          const v = gridMap.get(gridKey(base.fields.BaseColors ?? base.id, secName));
          if (v !== undefined) colNums.push(v);
        });
        return summarizeRaw(colNums, type);
      });
      const overall = summarizeRaw(allValues, type);
      rows.push([label, ...cells,
        type === 'min' ? overall : '', type === 'avg' ? overall : '', type === 'max' ? overall : '']);
    });

    downloadCsv(`${breed.label} ${stat} grid`, rows);
  }

  function handleExportWeekly() {
    if (!breed) return;
    const rows: (string | number | '')[][] = [
      ['Name', 'Year-Set', 'Stamp', 'Min Lvl',
        ...WEEKLY_FROG_FIELDS.map((_, i) => `Frog ${String.fromCharCode(65 + i)}`)],
    ];
    weeklyMatches.forEach(set => {
      rows.push([
        set.fields.SetName ?? '',
        set.fields.SetDate ?? '',
        set.fields.Stamp ?? '',
        set.fields.LevelReq ?? '',
        ...WEEKLY_FROG_FIELDS.map(f => (set.fields[f] as string | undefined) ?? ''),
      ]);
    });
    downloadCsv(`${breed.label} weekly sets`, rows);
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
          presorted
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

      {breedInfo && (
        <div className="breed-info">
          {breedInfo.image && (
            <img
              className="breed-info-image"
              src={breedInfo.image}
              alt={`${breed?.label ?? 'Breed'} stock art`}
            />
          )}
          <div className="breed-info-stats">
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Level</span>
              <span className="breed-info-stat-value">{breedInfo.level?.fields.Level_No ?? '—'}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Flies to Tame</span>
              <span className="breed-info-stat-value">{formatNum(breedInfo.level?.fields.Flies)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Hatch Time</span>
              <span className="breed-info-stat-value">{breedInfo.level?.fields.Hatch ?? '—'}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Growth Time</span>
              <span className="breed-info-stat-value">{breedInfo.level?.fields.Growth ?? '—'}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Rarity</span>
              <span className="breed-info-stat-value">{breedInfo.level?.fields.Rarity ?? '—'}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Release Version</span>
              <span className="breed-info-stat-value">{breedInfo.rec.fields.Version ?? '—'}</span>
            </div>
          </div>
          {breedInfo.level?.fields.Restricted && (
            <p className="breed-info-note">
              ⚠ Restricted — This breed can only be found in the pond and cannot be traded to another player.
            </p>
          )}
          {breedInfo.rec.fields.Promotional && (
            <p className="breed-info-note">
              ★ Promotional — This breed can only be obtained via the FrogMart or player trade. AKA POP Frog or Potion Frog.
            </p>
          )}
        </div>
      )}

      {breed === null ? (
        <p className="search-hint">Select a breed above to generate the grid.</p>
      ) : isFetching ? (
        <p className="search-hint">Loading frogs for {breed.label}…</p>
      ) : bases && secs ? (
        <>
        <div className="breed-grid-toolbar">
          <button className="csv-btn" onClick={handleExportGrid}>⬇ Export CSV</button>
        </div>
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
                  <th className="breed-row-label breed-summary-label" data-row={`f-${type}`}>
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
        </>
      ) : null}

      {breed !== null && (
        <div className="breed-weekly">
          <div className="breed-weekly-head">
            <h2 className="breed-weekly-title">
              Weekly Sets featuring {breed.label}{' '}
              <span className="breed-weekly-count">({weeklyMatches.length})</span>
            </h2>
            {weeklyMatches.length > 0 && (
              <button className="csv-btn" onClick={handleExportWeekly}>⬇ Export CSV</button>
            )}
          </div>
          <WeeklyTable
            data={weeklyMatches}
            sorting={weeklySort}
            onSortingChange={setWeeklySort}
            paginate={false}
            highlightNames={breedFrogNames}
          />
        </div>
      )}

      {breed !== null && spoilers && (
        <div className="frog-detail-specials">
          {(['Chroma', 'Glass'] as const).map(type => {
            const rows = specials
              .map((s, i) => ({ ...s, thisFrogName: thisFrogNames[i], partnerName: partnerNames[i], resultName: resultNames[i] }))
              .filter(s => s.type === type);
            return (
              <div key={type} className="special-combo-panel">
                <h2 className="breed-weekly-title">
                  {type} Combinations{' '}
                  <span className="breed-weekly-count">({rows.length})</span>
                </h2>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Breed Frog</th>
                        <th>Partner</th>
                        <th>Result</th>
                        <th className="pin-cell"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={4} className="search-hint">No {type.toLowerCase()} combinations found.</td></tr>
                      ) : rows.map((row, i) => (
                        <tr key={i}>
                          <td>
                            {row.thisId
                              ? <a href={`/frog/${row.thisId}`} className="plain-link">{row.thisFrogName}</a>
                              : row.thisFrogName}
                          </td>
                          <td>
                            {row.partnerId
                              ? <a href={`/frog/${row.partnerId}`} className="plain-link">{row.partnerName}</a>
                              : row.partnerName}
                          </td>
                          <td>
                            {row.resultId
                              ? <a href={`/frog/${row.resultId}`} className="plain-link">{row.resultName}</a>
                              : row.resultName}
                          </td>
                          <td className="pin-cell">
                            {row.screenshot && (
                              <button
                                className="screenshot-btn"
                                onClick={() => setLightbox(row.screenshot)}
                                aria-label={`View ${type} screenshot`}
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
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Close" onClick={() => setLightbox(null)}>×</button>
          <img
            className="lightbox-image"
            src={lightbox}
            alt="Combination screenshot"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
