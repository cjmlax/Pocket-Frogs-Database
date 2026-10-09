import { useState, useMemo, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueries } from '@tanstack/react-query';
import { fetchBreedFrogs, fetchFrogPairs, fetchMutations, fetchFrogById, type Mutation, type TeableRecord } from '../api/teable';
import { fetchCredits } from '../api/profile';
import type { ComboOption } from '../components/ComboBox';
import FrogInputs from '../components/FrogInputs';
import { formatNum } from '../utils/format';
import { pairScreenshotUrls } from '../utils/attachments';
import { EMPTY_FROG, decodeFrogParam, encodeFrogParam, frogSearch, isComplete, type FrogSel } from '../utils/frogIds';
import ImageLightbox from '../components/ImageLightbox';
import IconVerified from '../components/IconVerified';
import { useFrogOptions } from '../hooks/useFrogOptions';
import { useSpoilers } from '../hooks/useSpoilers';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FrogFields  extends Record<string, unknown> {
  fullname?: string;
  Value?:    number;
  Speed?:    number;
  Stamina?:  number;
}

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

// Exclamation in a circle — opens the pair's action tray.
function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="7" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

// Flag on a pole — report a problem with the pair's data.
function IconFlag() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  );
}

// Opposing arrows — hand the pair over to another page.
function IconTrade() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function BreedingPairs() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pa, setPa] = useState<FrogSel>(EMPTY_FROG);
  const [pb, setPb] = useState<FrogSel>(EMPTY_FROG);
  const [lightbox, setLightbox] = useState<string[] | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const frogOptions = useFrogOptions();
  const { lookup } = frogOptions;
  const { spoilers } = useSpoilers();

  // ?pair= holds both parents' Frog_IDs (e.g. "18:11:0_18:4:0", as linked from
  // the Mutation Planner). Read once the lookup tables load; the inputs are keyed
  // on this so they remount showing the restored parents.
  const [urlRead, setUrlRead] = useState(false);
  if (lookup && !urlRead) {
    const [a, b] = decodeFrogParam(searchParams.get('pair'), lookup);
    if (a) setPa(a);
    if (b) setPb(b);
    setUrlRead(true);
  }

  // Keep ?pair= in step with the chosen parents so the page can be shared.
  useEffect(() => {
    if (!urlRead || !lookup) return;
    const next = isComplete(pa) && isComplete(pb) ? encodeFrogParam([pa, pb], lookup) : '';
    if ((searchParams.get('pair') ?? '') === next) return;
    navigate({ search: frogSearch('pair', next) }, { replace: true });
  }, [urlRead, lookup, pa, pb, searchParams, navigate]);

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
  const { data: pairs }     = useQuery({ queryKey: ['pairs'],     queryFn: fetchFrogPairs });

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

  // Whether this pair's results are confirmed: it must be in Frog Pairs and
  // Verified. A missing or unverified pair may produce mutations we don't know of.
  // Null until the pairs table has loaded, so the indicator doesn't flash.
  const pairVerified = useMemo(() => {
    if (!frogA || !frogB || !pairs) return null;
    const a = frogA.id, b = frogB.id;
    return pairs.some(p =>
      p.verified && ((p.frogAId === a && p.frogBId === b) || (p.frogAId === b && p.frogBId === a)),
    );
  }, [frogA, frogB, pairs]);

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
      screenshots: pairScreenshotUrls(m.pairId, m.screenshotCount),
      submitter: m.submitter,
      lostId: m.lostId,
      resultId: m.resultId,
      resultTitle: m.resultTitle,
    }));
  }, [frogA, frogB, mutations]);

  // All of a pair's mutations share its screenshots, so any match carries them.
  const pairScreenshots = specialMatches[0]?.screenshots ?? [];

  // Credit for the pair. A Submitter starting with '~' is a manually recorded
  // credit shown as written; anything else is a user's sub, resolved to the
  // display name they chose. Unknown subs get no credit line.
  const submitter = specialMatches[0]?.submitter ?? null;
  const manualCredit = submitter?.startsWith('~') ? submitter.slice(1).trim() || null : null;
  const creditSub = submitter && !submitter.startsWith('~') ? submitter : null;
  const { data: credits } = useQuery({
    queryKey: ['credit', creditSub],
    queryFn: () => fetchCredits([creditSub!]),
    enabled: !!creditSub,
    staleTime: 10 * 60 * 1000,
  });
  const creditName = manualCredit ?? (creditSub ? credits?.[creditSub] ?? null : null);

  // Resolve each Result Frog's record (stats + fullname) for the swapped slot.
  // Shares the ['frog', id] cache with the Frog page.
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

  // ── Crosshair hover (mirrors the Breed page grid) ─────────────────────────
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
        <FrogInputs key={`a-${urlRead}`} title="Parent Frog A" sel={pa} onChange={setPa} options={frogOptions} />
        <FrogInputs key={`b-${urlRead}`} title="Parent Frog B" sel={pb} onChange={setPb} options={frogOptions} />
      </div>

      {!allSelected ? (
        <p className="search-hint">Waiting for parents...</p>
      ) : loading ? (
        <p className="search-hint">Loading frog data…</p>
      ) : result ? (
        <>
          {spoilers && specialMatches.length > 0 && (
            <p className="breeding-special">
              ✨ This pairing is known to produce {specialMatches.map((s, i) => (
                <span key={i}>
                  {i === 0 ? '' : i === specialMatches.length - 1 ? (specialMatches.length > 2 ? ', and ' : ' and ') : ', '}
                  a <strong>{s.type}</strong>
                </span>
              ))} frog!
              {creditName && <span className="breeding-credit"> Thanks {creditName}!</span>}
              {pairScreenshots.length > 0 && (
                <button
                  className="screenshot-btn"
                  onClick={() => setLightbox(pairScreenshots)}
                  aria-label={pairScreenshots.length > 1 ? 'View screenshots' : 'View screenshot'}
                  title={pairScreenshots.length > 1 ? `View screenshots (${pairScreenshots.length})` : 'View screenshot'}
                >
                  <IconCamera />
                </button>
              )}
            </p>
          )}

          <div className="breeding-cost-bar">
            {pairVerified !== null && (
              <span
                className={`breeding-verified${pairVerified ? '' : ' is-unverified'}`}
                role="img"
                aria-label={pairVerified
                  ? "This breeding pair's results have been confirmed"
                  : "This pair's breeding results may contain unknown mutations"}
                title={pairVerified
                  ? "This breeding pair's results have been confirmed"
                  : "This pair's breeding results may contain unknown mutations"}
              >
                <IconVerified ok={pairVerified} />
              </span>
            )}
            <p className="breeding-cost">
              Breeding Cost: <strong>{formatNum(result.cost)}</strong>
            </p>
            {/* Right-aligned tray: the ! button slides the pair's actions out to its left. */}
            <div className={`breeding-actions${actionsOpen ? ' open' : ''}`}>
              <div className="breeding-actions-tray" id="breeding-actions-tray" inert={!actionsOpen}>
                {/* Fills the submission page's parent pickers; its own check still runs.
                    Hidden for verified pairs (and until that's known), which refuse submissions. */}
                {pairVerified === false && (
                  <Link
                    to={`/submit${frogSearch('pair', searchParams.get('pair') ?? '')}`}
                    className="screenshot-btn"
                    aria-label="Submit a Glass/Chroma mutation for this pair"
                    title="Submit a Glass/Chroma mutation for this pair"
                  >
                    <IconTrade />
                  </Link>
                )}
                {/* TODO: wire up once issue reporting exists. */}
                <button
                  type="button"
                  className="screenshot-btn"
                  aria-label="Report an issue with this pair's data"
                  title="Click to report issue"
                >
                  <IconFlag />
                </button>
              </div>
              <button
                type="button"
                className="screenshot-btn"
                onClick={() => setActionsOpen(o => !o)}
                aria-expanded={actionsOpen}
                aria-controls="breeding-actions-tray"
                aria-label={actionsOpen ? 'Hide pair actions' : 'Show pair actions'}
                title={actionsOpen ? 'Hide pair actions' : 'Show pair actions'}
              >
                <IconAlert />
              </button>
            </div>
          </div>

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
        <ImageLightbox images={lightbox} alt="Combination screenshot" onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
