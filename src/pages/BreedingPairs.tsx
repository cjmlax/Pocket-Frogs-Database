import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { fetchTable, fetchBreedFrogs, fetchMutations, fetchFrogById, type Mutation, type TeableRecord } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { formatNum } from '../utils/format';
import { breedOptionsFrom } from '../utils/breeds';
import { imageProxyUrl } from '../utils/attachments';
import { useBreedSort } from '../hooks/useBreedSort';
import { useColorSort } from '../hooks/useColorSort';
import { useSpoilers } from '../hooks/useSpoilers';
import { colorOptionsFrom } from '../utils/colors';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  fullname?: string;
  Value?:    number;
  Speed?:    number;
  Stamina?:  number;
}

interface ParentSel {
  base:  ComboOption | null;
  sec:   ComboOption | null;
  breed: ComboOption | null;
}

const EMPTY: ParentSel = { base: null, sec: null, breed: null };

// All 8 offspring trait combinations: each character picks parent A's or B's
// base / secondary / breed respectively.
const COMBOS = ['AAA', 'AAB', 'ABA', 'ABB', 'BAA', 'BAB', 'BBA', 'BBB'] as const;

// Floors any numeric stat to a whole value; returns null for missing data.
function statInt(n: unknown): number | null {
  return typeof n === 'number' ? Math.floor(n) : null;
}

function fullName(base: ComboOption, sec: ComboOption, breed: ComboOption): string {
  return `${base.label} ${sec.label} ${breed.label}`;
}

const HOVER_CLASSES = ['row-hover', 'col-hover', 'cell-hover'] as const;

function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

// Two circling arrows — flips a column between a mutation and the frog it replaces.
function IconSwap() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

// ── Parent selector column ──────────────────────────────────────────────────────

function ParentInputs({
  title, sel, onChange, baseOpts, secOpts, breedOpts, breedPresorted,
}: {
  title: string;
  sel: ParentSel;
  onChange: (s: ParentSel) => void;
  baseOpts: ComboOption[];
  secOpts: ComboOption[];
  breedOpts: ComboOption[];
  breedPresorted: boolean;
}) {
  return (
    <div className="parent-group">
      <h2 className="parent-title">{title}</h2>
      <ComboBox
        label="Base Color"
        options={baseOpts}
        presorted
        initialSelection={sel.base}
        onSelect={o => onChange({ ...sel, base: o })}
      />
      <ComboBox
        label="Secondary Color"
        options={secOpts}
        presorted
        initialSelection={sel.sec}
        onSelect={o => onChange({ ...sel, sec: o })}
      />
      <ComboBox
        label="Breed"
        options={breedOpts}
        presorted={breedPresorted}
        initialSelection={sel.breed}
        onSelect={o => onChange({ ...sel, breed: o })}
      />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function BreedingPairs() {
  const [pa, setPa] = useState<ParentSel>(EMPTY);
  const [pb, setPb] = useState<ParentSel>(EMPTY);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Lookup tables for the ComboBoxes (small, ETag-cached)
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedSort = useBreedSort();
  const colorSort = useColorSort();
  const { spoilers } = useSpoilers();
  const breedOpts = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOpts  = useMemo<ComboOption[]>(() => colorOptionsFrom(bases, 'BaseColors', colorSort), [bases, colorSort]);
  const secOpts   = useMemo<ComboOption[]>(() => colorOptionsFrom(secs,  'Sec_Color',  colorSort), [secs,  colorSort]);

  // Offspring only ever use the two parents' breeds, so fetching those two breed
  // sets covers every combination. If both breeds match, TanStack dedupes the query.
  const breedAQuery = useQuery({
    queryKey: ['breed-frogs', pa.breed?.id],
    queryFn:  () => fetchBreedFrogs<FrogFields>(pa.breed!.id),
    enabled:  !!pa.breed,
    staleTime: 1000 * 60 * 60 * 24,
  });
  const breedBQuery = useQuery({
    queryKey: ['breed-frogs', pb.breed?.id],
    queryFn:  () => fetchBreedFrogs<FrogFields>(pb.breed!.id),
    enabled:  !!pb.breed,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // Special-combination tables — small and ETag-cached, so fetch eagerly
  const { data: mutations } = useQuery({ queryKey: ['mutations'], queryFn: fetchMutations });

  // Index every fetched frog by its fullname for O(1) offspring lookups
  const index = useMemo(() => {
    const m = new Map<string, TeableRecord<FrogFields>>();
    for (const f of [...(breedAQuery.data ?? []), ...(breedBQuery.data ?? [])]) {
      if (f.fields.fullname) m.set(f.fields.fullname, f);
    }
    return m;
  }, [breedAQuery.data, breedBQuery.data]);

  const allSelected = !!(pa.base && pa.sec && pa.breed && pb.base && pb.sec && pb.breed);
  const loading = (!!pa.breed && breedAQuery.isFetching) || (!!pb.breed && breedBQuery.isFetching);

  // Resolve the two selected parents to actual frog records
  const frogA = useMemo(
    () => (allSelected ? index.get(fullName(pa.base!, pa.sec!, pa.breed!)) ?? null : null),
    [allSelected, index, pa],
  );
  const frogB = useMemo(
    () => (allSelected ? index.get(fullName(pb.base!, pb.sec!, pb.breed!)) ?? null : null),
    [allSelected, index, pb],
  );

  // Find the parent pair's Chroma/Glass mutations (pair stored in either order).
  // Matches on frog record ID, the reliable link-field key. A pair can have
  // several mutations, each carrying the Lost→Result swap it defines.
  // Mutation Result / Lost Frog describe the in-game swap: when this pair pops,
  // the Lost Frog offspring is replaced by the (special) Result Frog.
  const specialMatches = useMemo(() => {
    if (!frogA || !frogB) return [];
    const a = frogA.id, b = frogB.id;
    const matches = (m: Mutation) =>
      (m.frogAId === a && m.frogBId === b) || (m.frogAId === b && m.frogBId === a);
    return (mutations ?? []).filter(matches).map(m => ({
      type: m.type as string,
      screenshot: m.hasScreenshot ? imageProxyUrl('pairs', m.pairId, 'Screenshot') : null,
      lostId: m.lostId,
      resultId: m.resultId,
      resultTitle: m.resultTitle,
    }));
  }, [frogA, frogB, mutations]);

  // Resolve each Result Frog's record (stats + fullname) for the swapped slot.
  // Shares the ['frog', id] cache with the Frog Detail page.
  const resultIds = useMemo(
    () => Array.from(new Set(specialMatches.map(s => s.resultId).filter(Boolean))) as string[],
    [specialMatches],
  );
  const resultQueries = useQueries({
    queries: resultIds.map(id => ({
      queryKey: ['frog', id],
      queryFn:  () => fetchFrogById<FrogFields>(id),
      enabled:  !!id,
      staleTime: 1000 * 60 * 60 * 24,
    })),
  });
  const resultById = useMemo(() => {
    const m = new Map<string, TeableRecord<FrogFields>>();
    resultIds.forEach((id, i) => {
      const data = resultQueries[i]?.data;
      if (data) m.set(id, data);
    });
    return m;
  }, [resultIds, resultQueries]);

  // Lost-frog record id → the Result Frog that takes its place in the grid.
  const replacementByLostId = useMemo(() => {
    const m = new Map<string, { resultId: string; resultTitle: string | null; type: string }>();
    for (const s of specialMatches) {
      if (s.lostId && s.resultId) {
        m.set(s.lostId, { resultId: s.resultId, resultTitle: s.resultTitle, type: s.type });
      }
    }
    return m;
  }, [specialMatches]);

  const result = useMemo(() => {
    if (!allSelected) return null;

    const valA = statInt(frogA?.fields.Value) ?? 0;
    const valB = statInt(frogB?.fields.Value) ?? 0;
    const cost = Math.floor((valA + valB) / 4);

    const seen = new Set<string>();
    const offspring = COMBOS.flatMap(code => {
      const base  = code[0] === 'A' ? pa.base!  : pb.base!;
      const sec   = code[1] === 'A' ? pa.sec!   : pb.sec!;
      const breed = code[2] === 'A' ? pa.breed! : pb.breed!;
      const name = fullName(base, sec, breed);
      if (seen.has(name)) return [];
      seen.add(name);

      const frog = index.get(name) ?? null;
      const value   = statInt(frog?.fields.Value);
      const speed   = statInt(frog?.fields.Speed);
      const stamina = statInt(frog?.fields.Stamina);
      return [{
        id:      frog?.id ?? null,
        name,
        found:   frog !== null,
        value,
        profit:  value !== null ? value - cost : null,
        speed,
        stamina,
        racing:  speed !== null && stamina !== null ? speed + stamina : null,
        special: null as string | null,
        // Lost-frog id of a column a known mutation replaces (null otherwise).
        swapId:  null as string | null,
      }];
    });

    return { cost, offspring };
  }, [allSelected, index, pa, pb, frogA, frogB]);

  // Columns flipped back to their original (lost) frog, by lost-frog id. Tied to
  // the parent pair, so picking new parents shows every mutation again.
  const pairKey = frogA && frogB ? `${frogA.id}|${frogB.id}` : '';
  const [flipped, setFlipped] = useState<{ pairKey: string; ids: Set<string> }>({ pairKey: '', ids: new Set() });
  const flippedIds = useMemo(
    () => (flipped.pairKey === pairKey ? flipped.ids : new Set<string>()),
    [flipped, pairKey],
  );
  function toggleFlip(lostId: string) {
    const ids = new Set(flippedIds);
    if (ids.has(lostId)) ids.delete(lostId); else ids.add(lostId);
    setFlipped({ pairKey, ids });
  }

  // Apply special-pair swaps: each offspring matching a Lost Frog is replaced by
  // its Result Frog (real stats, profit recomputed against the same cost) —
  // unless that column has been flipped back to show the original frog.
  const displayedOffspring = useMemo(() => {
    if (!result) return [];
    if (replacementByLostId.size === 0) return result.offspring;
    return result.offspring.map(o => {
      const repl = o.id ? replacementByLostId.get(o.id) : undefined;
      if (!repl) return o;
      if (flippedIds.has(o.id!)) return { ...o, swapId: o.id };
      const rec = resultById.get(repl.resultId);
      const value   = statInt(rec?.fields.Value);
      const speed   = statInt(rec?.fields.Speed);
      const stamina = statInt(rec?.fields.Stamina);
      return {
        id:      repl.resultId,
        name:    rec?.fields.fullname ?? repl.resultTitle ?? o.name,
        found:   true,
        value,
        profit:  value !== null ? value - result.cost : null,
        speed,
        stamina,
        racing:  speed !== null && stamina !== null ? speed + stamina : null,
        special: repl.type,
        swapId:  o.id,
      };
    });
  }, [result, replacementByLostId, resultById, flippedIds]);

  // Swappable columns get a quick fade; cells are keyed by frog so a flip remounts them.
  const cellKey = (o: { id: string | null; name: string }, i: number) => `${i}:${o.id ?? o.name}`;
  const swapCls = (o: { swapId: string | null }, extra?: string) =>
    [extra, o.swapId ? 'breeding-swap' : null].filter(Boolean).join(' ') || undefined;

  const shownOffspring = spoilers ? displayedOffspring : (result?.offspring ?? []);

  // ── Crosshair hover (mirrors the Breed Overview grid) ─────────────────────
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
      <h1>Breeding Pairs</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Enter the traits of two parent frogs to display the offspring and their stats.
      </p>

      <div className="breeding-parents">
        <ParentInputs title="Parent Frog A" sel={pa} onChange={setPa} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} breedPresorted />
        <ParentInputs title="Parent Frog B" sel={pb} onChange={setPb} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} breedPresorted />
      </div>

      {!allSelected ? (
        <p className="search-hint">Waiting for parents...</p>
      ) : loading ? (
        <p className="search-hint">Loading frog data…</p>
      ) : result ? (
        <>
          {spoilers && specialMatches.map((s, i) => (
            <p key={`${s.type}-${i}`} className="breeding-special">
              ✨ This pairing is known to produce a <strong>{s.type}</strong> frog!
              {s.screenshot && (
                <button
                  className="screenshot-btn"
                  onClick={() => setLightbox(s.screenshot)}
                  aria-label={`View ${s.type} screenshot`}
                  title="View screenshot"
                >
                  <IconCamera />
                </button>
              )}
            </p>
          ))}

          <p className="breeding-cost">
            Breeding Cost: <strong>{formatNum(result.cost)}</strong>
          </p>

          <div className="table-wrapper">
            <table
              className="breeding-results"
              ref={tableRef}
              onMouseOver={handleMouseOver}
              onMouseLeave={clearHover}
            >
              <tbody>
                <tr>
                  <th className="breeding-row-label" data-row="frog">Frog</th>
                  {shownOffspring.map((o, i) => (
                    <th
                      key={cellKey(o, i)}
                      className={swapCls(o, `breeding-frog-name${o.special ? ' breeding-frog-special' : ''}`)}
                      data-row="frog"
                      data-col={i}
                      title={o.special ? `${o.special} replacement` : undefined}
                    >
                      {o.name.split(' ').map((word, w) => (
                        <span key={w} className="breeding-frog-word">{word}</span>
                      ))}
                      {o.swapId && (
                        <button
                          type="button"
                          className="swap-btn"
                          onClick={() => toggleFlip(o.swapId!)}
                          aria-label={o.special ? 'Show the original frog' : 'Show the mutation'}
                          title={o.special ? 'Show the original frog' : 'Show the mutation'}
                        >
                          <IconSwap />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="value">Value</th>
                  {shownOffspring.map((o, i) => (
                    <td key={cellKey(o, i)} className={swapCls(o)} data-row="value" data-col={i}>{o.value !== null ? formatNum(o.value) : (o.found ? '—' : 'Not Found')}</td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="profit">Net Profit</th>
                  {shownOffspring.map((o, i) => (
                    <td key={cellKey(o, i)} data-row="profit" data-col={i} className={swapCls(o,
                      o.profit === null ? undefined
                        : o.profit > 0 ? 'profit-positive'
                        : o.profit < 0 ? 'profit-negative'
                        : undefined,
                    )}>
                      {o.profit === null ? '—' : `${o.profit > 0 ? '+' : ''}${formatNum(o.profit)}`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="speed">Speed</th>
                  {shownOffspring.map((o, i) => (
                    <td key={cellKey(o, i)} className={swapCls(o)} data-row="speed" data-col={i}>{o.speed !== null ? formatNum(o.speed) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="stamina">Stamina</th>
                  {shownOffspring.map((o, i) => (
                    <td key={cellKey(o, i)} className={swapCls(o)} data-row="stamina" data-col={i}>{o.stamina !== null ? formatNum(o.stamina) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="racing">Racing Stat</th>
                  {shownOffspring.map((o, i) => (
                    <td key={cellKey(o, i)} className={swapCls(o)} data-row="racing" data-col={i}>{o.racing !== null ? formatNum(o.racing) : '—'}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

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
