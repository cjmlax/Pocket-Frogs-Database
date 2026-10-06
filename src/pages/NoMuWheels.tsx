import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchFrogPairs, fetchMutations } from '../api/teable';
import ComboBox from '../components/ComboBox';
import { useFrogOptions } from '../hooks/useFrogOptions';
import { useSpoilers } from '../hooks/useSpoilers';
import { downloadCsv } from '../utils/csv';
import { MAX_PLANNER_FROGS as HABITAT_SIZE, frogIdsParam, frogPath, frogSearch } from '../utils/frogIds';
import { analyzeBreed, type PlanRow, type WheelMode, type WheelResult } from '../utils/nomuWheel';

// Wheels are laid out over three habitats of up to 8 frogs (a habitat's cap,
// and the Mutation Planner's), so each habitat can be opened in the Planner.
const HABITATS = 3;

const MODE_TEXT: Record<WheelMode, { label: string; hint: string }> = {
  nomu: {
    label: 'NoMu',
    hint: 'Every frog comes from its parents’ colours. A mutation is fine only when it replaces a wheel frog or a frog another pair also gives.',
  },
  mutation: {
    label: 'Mutations',
    hint: 'Glass and Chroma frogs may also come from known mutations, so the Glass frog is optional when mutations cover every Glass frog.',
  },
};

type Status = 'wheel' | 'clear' | 'mutation' | 'unknown' | 'missing';

const STATUS_TEXT: Record<Status, string> = {
  wheel:    'Wheel frog',
  clear:    'Verified pair',
  mutation: 'Mutation',
  unknown:  'Record this pair',
  missing:  'Unobtainable',
};

// With spoilers off, which pair gives a Glass / Chroma mutation stays hidden.
const hiddenPair = (row: PlanRow, spoilers: boolean) =>
  !spoilers && row.source.kind === 'pair' && !!row.source.mutation;

function rowStatus(row: PlanRow): Status {
  const s = row.source;
  if (s.kind === 'wheel') return 'wheel';
  if (s.kind === 'none') return 'missing';
  if (!s.verified) return 'unknown';
  return s.mutation ? 'mutation' : 'clear';
}

// Query strings are written by hand so the Frog_IDs' colons stay readable.
function buildSearch(params: Record<string, string | null | undefined>): string {
  const parts = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ── Habitat layout ───────────────────────────────────────────────────────────
// Three ordered lists of Frog_IDs, kept in the URL (?h=, habitats split by
// "." and frogs by "_") so a layout survives a trip to the Planner and back.

type Layout = string[][];
type Slot = { h: number; i: number };

const defaultLayout = (frogs: string[]): Layout =>
  Array.from({ length: HABITATS }, (_, h) => frogs.slice(h * HABITAT_SIZE, (h + 1) * HABITAT_SIZE));

const encodeLayout = (layout: Layout) => layout.map(h => h.join('_')).join('.');

// The layout in the URL if it holds exactly this wheel's frogs; null otherwise.
function parseLayout(param: string | null, frogs: string[]): Layout | null {
  if (!param) return null;
  const layout = param.split('.').map(h => (h ? h.split('_') : []));
  const flat = layout.flat();
  const wheel = new Set(frogs);
  const ok = layout.length === HABITATS
    && layout.every(h => h.length <= HABITAT_SIZE)
    && flat.length === frogs.length
    && new Set(flat).size === flat.length
    && flat.every(f => wheel.has(f));
  return ok ? layout : null;
}

// Swaps two frogs, or moves a frog to the end of a habitat with room.
function moveFrog(layout: Layout, from: Slot, to: Slot): Layout | null {
  const next = layout.map(h => [...h]);
  const frog = next[from.h][from.i];
  const other = next[to.h][to.i];
  if (!frog) return null;
  if (other) {
    next[from.h][from.i] = other;
    next[to.h][to.i] = frog;
  } else {
    if (to.h !== from.h && next[to.h].length >= HABITAT_SIZE) return null;
    next[from.h].splice(from.i, 1);
    next[to.h].push(frog);
  }
  return next;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NoMuWheels() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { lookup, breedOpts, baseOpts, secOpts } = useFrogOptions();
  const { spoilers } = useSpoilers();
  const { data: pairs }     = useQuery({ queryKey: ['pairs'],     queryFn: fetchFrogPairs });
  const { data: mutations } = useQuery({ queryKey: ['mutations'], queryFn: fetchMutations });

  const breedCode = searchParams.get('breed');
  const mode: WheelMode = searchParams.get('mode') === 'mutation' ? 'mutation' : 'nomu';
  const wheelParam = searchParams.get('wheel');
  const layoutParam = searchParams.get('h');

  function update(next: Partial<Record<'breed' | 'mode' | 'wheel' | 'h', string | null>>) {
    const keys = ['breed', 'mode', 'wheel', 'h'] as const;
    const params = Object.fromEntries(keys.map(k => [k, k in next ? next[k] : searchParams.get(k)]));
    navigate({ search: buildSearch(params) }, { replace: true });
  }

  const breedOpt = (breedCode && lookup?.breed.byCode.get(breedCode)) || null;

  // Bases and secondaries go in in table order (rainbow), so results don't
  // depend on the viewer's sort settings.
  const analysis = useMemo(() => {
    if (!lookup || !pairs || !mutations || !breedOpt || !breedCode) return null;
    const bases = [...lookup.base.byCode.keys()];
    const secs  = [...lookup.sec.byCode.keys()];
    const glassBase = [...lookup.base.byCode].find(([, o]) => o.label === 'Glass')?.[0] ?? null;
    return analyzeBreed({ breed: breedCode, bases, secs, glassBase, mode, pairs, mutations });
  }, [lookup, pairs, mutations, breedOpt, breedCode, mode]);

  const results = useMemo<WheelResult[]>(
    () => (analysis ? [...analysis.complete, ...analysis.nearMisses] : []),
    [analysis],
  );
  const wheelIndex = Math.min(Math.max(0, parseInt(wheelParam ?? '0', 10) || 0), Math.max(0, results.length - 1));
  const wheel = results[wheelIndex] ?? null;
  const completeCount = analysis?.complete.length ?? 0;

  const savedLayout = useMemo(() => (wheel ? parseLayout(layoutParam, wheel.frogs) : null), [layoutParam, wheel]);
  const layout = useMemo(() => savedLayout ?? (wheel ? defaultLayout(wheel.frogs) : []), [savedLayout, wheel]);
  const habitatOf = useMemo(() => {
    const m = new Map<string, number>();
    layout.forEach((frogs, h) => frogs.forEach(f => m.set(f, h)));
    return m;
  }, [layout]);

  // A frog picked up by tapping, tied to the wheel and layout it was picked from.
  const wheelKey = wheel ? `${breedCode}|${mode}|${wheelIndex}|${layoutParam ?? ''}` : '';
  const [heldState, setHeld] = useState<{ key: string; slot: Slot } | null>(null);
  const held = heldState?.key === wheelKey ? heldState.slot : null;

  const partsOf = (id: string) => {
    const [b, s] = id.split(':');
    return { base: lookup?.base.byCode.get(b)?.label ?? b, sec: lookup?.sec.byCode.get(s)?.label ?? s };
  };
  const nameOf = (id: string) => {
    const { base, sec } = partsOf(id);
    return `${base} ${sec}`;
  };
  const breedLabel = breedOpt?.label ?? '';
  const habitatText = (...ids: string[]) =>
    [...new Set(ids.map(id => habitatOf.get(id)).filter((h): h is number => h != null))]
      .sort((x, y) => x - y).map(h => h + 1).join(' + ');

  function applyMove(from: Slot, to: Slot) {
    const next = moveFrog(layout, from, to);
    setHeld(null);
    if (next) update({ h: encodeLayout(next) });
  }

  function tapSlot(slot: Slot, hasFrog: boolean) {
    if (!held) {
      if (hasFrog) setHeld({ key: wheelKey, slot });
      return;
    }
    if (held.h === slot.h && held.i === slot.i) setHeld(null);
    else applyMove(held, slot);
  }

  const dragProps = (slot: Slot) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const [h, i] = e.dataTransfer.getData('text/plain').split(',').map(Number);
      if (Number.isInteger(h) && Number.isInteger(i)) applyMove({ h, i }, slot);
    },
  });

  // ── Breeding plan views ───────────────────────────────────────────────────
  const [view, setView] = useState<'frog' | 'pair'>('frog');
  const [onlyToRecord, setOnlyToRecord] = useState(false);

  const hidePair = (row: PlanRow) => hiddenPair(row, spoilers);

  // Rows in the viewer's colour order, by base then secondary.
  const frogRows = useMemo(() => {
    if (!wheel || !lookup) return [];
    const byFrog = new Map(wheel.rows.map(r => [r.frog, r]));
    const rows: PlanRow[] = [];
    for (const b of baseOpts) {
      for (const s of secOpts) {
        const row = byFrog.get(`${lookup.base.code.get(b.id)}:${lookup.sec.code.get(s.id)}:${breedCode}`);
        if (row) rows.push(row);
      }
    }
    return rows;
  }, [wheel, lookup, baseOpts, secOpts, breedCode]);

  const pairGroups = useMemo(() => {
    const groups = new Map<string, { a: string; b: string; verified: boolean; frogs: PlanRow[] }>();
    let hidden = 0;
    for (const row of frogRows) {
      const s = row.source;
      if (s.kind !== 'pair') continue;
      if (hiddenPair(row, spoilers)) { hidden++; continue; }
      const key = [s.a, s.b].sort().join('|');
      const g = groups.get(key);
      if (g) g.frogs.push(row); else groups.set(key, { a: s.a, b: s.b, verified: s.verified, frogs: [row] });
    }
    // Pairs inside one habitat first, then by the habitats they span.
    const rank = (g: { a: string; b: string }) => {
      const ha = habitatOf.get(g.a) ?? 0, hb = habitatOf.get(g.b) ?? 0;
      return (ha === hb ? 0 : 10) + Math.min(ha, hb) * 3 + Math.max(ha, hb);
    };
    const list = [...groups.values()].sort((x, y) => rank(x) - rank(y));
    return { list, hidden };
  }, [frogRows, habitatOf, spoilers]);

  function exportCsv() {
    if (!wheel) return;
    const rows: (string | number)[][] = [['Frog_ID', 'Frog', 'Parent A', 'Parent B', 'Habitats', 'Status']];
    for (const row of frogRows) {
      const s = row.source;
      const parents = s.kind === 'pair' && !hidePair(row) ? [s.a, s.b] : ['', ''];
      const habitats = s.kind === 'pair' ? (hidePair(row) ? '' : habitatText(s.a, s.b)) : s.kind === 'wheel' ? habitatText(row.frog) : '';
      rows.push([row.frog, `${nameOf(row.frog)} ${breedLabel}`, ...parents, habitats, STATUS_TEXT[rowStatus(row)]]);
    }
    downloadCsv(`nomu-${breedLabel}-${mode}-${wheelIndex + 1}`, rows);
  }

  const loading = !lookup || !pairs || !mutations;

  return (
    <div>
      <h1>NoMu Wheels</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        A colour wheel is one frog of each base colour, all the same breed, that between them breed every
        frog of that breed for the Froggydex. Wheels here are built from verified pairs only. Near misses
        list the pairs still to record. Arrange the habitats, then open each one in the Mutation Planner.
      </p>

      <div className="filter-grid">
        <ComboBox
          key={lookup ? 'ready' : 'loading'}
          label="Breed"
          options={breedOpts}
          presorted
          initialSelection={breedOpt}
          onSelect={opt => {
            const code = opt && lookup?.breed.code.get(opt.id);
            if (code) update({ breed: code, wheel: null, h: null });
          }}
        />
        <div className="combobox-field">
          <label className="combobox-label">Algorithm</label>
          <div className="settings-row">
            {(['nomu', 'mutation'] as const).map(m => (
              <button
                key={m}
                type="button"
                className={`settings-theme-opt nomu-mode-btn${mode === m ? ' active' : ''}`}
                aria-pressed={mode === m}
                onClick={() => update({ mode: m === 'nomu' ? null : m, wheel: null, h: null })}
                title={MODE_TEXT[m].hint}
              >
                {MODE_TEXT[m].label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="search-hint">{MODE_TEXT[mode].hint}</p>

      {loading ? (
        <p className="search-hint">Loading pair data…</p>
      ) : !breedOpt ? (
        <p className="search-hint">Choose a breed to find its wheels.</p>
      ) : !analysis || analysis.recordedPairs === 0 ? (
        <p className="search-hint">No verified pairs are recorded for {breedLabel} yet, so there's nothing to build a wheel from.</p>
      ) : (
        <>
          <div className="nomu-results">
            <div className="nomu-result-group">
              <h2>Complete wheels</h2>
              {completeCount === 0 ? (
                <p className="search-hint">None yet, from {analysis.recordedPairs} verified {breedLabel} pairs.</p>
              ) : (
                <div className="nomu-result-list">
                  {analysis.complete.map((w, i) => (
                    <ResultButton key={i} wheel={w} title={`Wheel ${i + 1}`} active={i === wheelIndex}
                      onSelect={() => update({ wheel: i ? String(i) : null, h: null })} />
                  ))}
                </div>
              )}
              {analysis.truncated && (
                <p className="search-hint">The search stopped early; there may be more complete wheels.</p>
              )}
            </div>
            {analysis.nearMisses.length > 0 && (
              <div className="nomu-result-group">
                <h2>Near misses</h2>
                <div className="nomu-result-list">
                  {analysis.nearMisses.map((w, i) => {
                    const index = completeCount + i;
                    return (
                      <ResultButton key={index} wheel={w} title={`Near miss ${i + 1}`} active={index === wheelIndex}
                        onSelect={() => update({ wheel: index ? String(index) : null, h: null })} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {wheel && (
            <>
              <div className="nomu-section-head">
                <h2>{wheelIndex < completeCount ? `Wheel ${wheelIndex + 1}` : `Near miss ${wheelIndex - completeCount + 1}`}: habitats</h2>
                {savedLayout && (
                  <button type="button" className="csv-btn" onClick={() => update({ h: null })}>Reset order</button>
                )}
              </div>
              <p className="search-hint" style={{ marginTop: 0 }}>
                Drag a frog onto another to swap them, or onto an empty slot to move it. On touch screens, tap a
                frog, then tap where it should go.
              </p>

              <div className="nomu-habitats">
                {layout.map((frogs, h) => (
                  <section key={h} className="nomu-habitat" aria-label={`Habitat ${h + 1}`}>
                    <header className="nomu-habitat-head">
                      <h3>Habitat {h + 1}</h3>
                      <span className="planner-count">{frogs.length} / {HABITAT_SIZE}</span>
                      {frogs.length > 0 && (
                        <Link className="csv-btn" to={`/planner${frogSearch('frogs', frogIdsParam(frogs))}`}>
                          Open in Planner
                        </Link>
                      )}
                    </header>
                    <ol className="nomu-slots">
                      {Array.from({ length: HABITAT_SIZE }, (_, i) => {
                        const id = frogs[i];
                        const slot = { h, i };
                        const isHeld = held?.h === h && held.i === i;
                        if (!id) {
                          return (
                            <li key={i}>
                              <button
                                type="button"
                                className="nomu-slot-empty"
                                disabled={!held}
                                onClick={() => tapSlot(slot, false)}
                                aria-label={`Empty slot in habitat ${h + 1}${held ? ': move the picked frog here' : ''}`}
                                {...dragProps(slot)}
                              >
                                Empty
                              </button>
                            </li>
                          );
                        }
                        const { base, sec } = partsOf(id);
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className={`nomu-frog${isHeld ? ' is-held' : ''}`}
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.setData('text/plain', `${h},${i}`);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onClick={() => tapSlot(slot, true)}
                              aria-pressed={isHeld}
                              aria-label={`${nameOf(id)}, habitat ${h + 1}. ${
                                isHeld ? 'Picked up; select again to put it back.'
                                : held ? 'Swap with the picked frog.'
                                : 'Select to pick up.'}`}
                              {...dragProps(slot)}
                            >
                              <span>{base}</span>
                              <span>{sec}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>

              <div className="nomu-section-head">
                <h2>Breeding plan</h2>
                <button type="button" className="csv-btn" onClick={exportCsv}>Download CSV</button>
              </div>
              <p className="nomu-summary">
                <span>{wheel.frogs.length} wheel frogs</span>
                <span>{wheel.pairCount} breeding pairs</span>
                {wheel.toRecord.length > 0 && <span className="nomu-status is-unknown">{wheel.toRecord.length} pairs to record</span>}
                {wheel.unobtainable > 0 && <span className="nomu-status is-missing">{wheel.unobtainable} unobtainable</span>}
              </p>
              <p className="search-hint" style={{ marginTop: 0 }}>
                Each {breedLabel} frog and the pair to breed for it, using as few pairs as possible.
                {mode === 'mutation' && !spoilers && ' Spoilers are off, so pairs that give Glass or Chroma mutations are hidden.'}
              </p>

              <div className="table-toolbar">
                <div className="settings-row">
                  {(['frog', 'pair'] as const).map(v => (
                    <button key={v} type="button" className={`settings-theme-opt nomu-mode-btn${view === v ? ' active' : ''}`}
                      aria-pressed={view === v} onClick={() => setView(v)}>
                      {v === 'frog' ? 'By frog' : 'By pair'}
                    </button>
                  ))}
                </div>
                {(wheel.toRecord.length > 0 || wheel.unobtainable > 0) && (
                  <label className="nomu-filter">
                    <input type="checkbox" checked={onlyToRecord} onChange={e => setOnlyToRecord(e.target.checked)} />
                    Only what's left to record
                  </label>
                )}
              </div>

              <div className="table-wrapper">
                {view === 'frog' ? (
                  <table>
                    <thead>
                      <tr><th>Frog</th><th>From pair</th><th>Habitats</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {frogRows
                        .filter(r => !onlyToRecord || ['unknown', 'missing'].includes(rowStatus(r)))
                        .map(row => {
                          const s = row.source, status = rowStatus(row);
                          return (
                            <tr key={row.frog}>
                              <td><Link to={frogPath(row.frog)}>{nameOf(row.frog)}</Link></td>
                              <td>
                                {s.kind !== 'pair' ? '—'
                                  : hidePair(row) ? <span className="nomu-hidden">Hidden (spoilers off)</span>
                                  : <PairLink a={s.a} b={s.b} nameOf={nameOf} />}
                              </td>
                              <td>{s.kind === 'pair' ? (hidePair(row) ? '—' : habitatText(s.a, s.b)) : s.kind === 'wheel' ? habitatText(row.frog) : '—'}</td>
                              <td>
                                <span className={`nomu-status is-${status}`}>
                                  {status === 'mutation' && s.kind === 'pair' && s.mutation ? `${s.mutation} mutation` : STATUS_TEXT[status]}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                ) : (
                  <table>
                    <thead>
                      <tr><th>Pair</th><th>Habitats</th><th>Gives</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {pairGroups.list
                        .filter(g => !onlyToRecord || !g.verified)
                        .map(g => (
                          <tr key={`${g.a}|${g.b}`}>
                            <td><PairLink a={g.a} b={g.b} nameOf={nameOf} /></td>
                            <td>{habitatText(g.a, g.b)}</td>
                            <td className="nomu-gives">
                              {g.frogs.map((r, i) => (
                                <span key={r.frog}>
                                  {i > 0 && ', '}
                                  <Link to={frogPath(r.frog)}>{nameOf(r.frog)}</Link>
                                  {r.source.kind === 'pair' && r.source.mutation && ` (${r.source.mutation})`}
                                </span>
                              ))}
                            </td>
                            <td>
                              <span className={`nomu-status is-${g.verified ? 'clear' : 'unknown'}`}>
                                {g.verified ? STATUS_TEXT.clear : STATUS_TEXT.unknown}
                              </span>
                              {!g.verified && (
                                <>
                                  {' · '}
                                  <Link to={`/planner${frogSearch('frogs', frogIdsParam([g.a, g.b]))}`}>Open in Planner</Link>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      {pairGroups.hidden > 0 && !onlyToRecord && (
                        <tr>
                          <td colSpan={4} className="nomu-hidden">
                            {pairGroups.hidden} frogs come from mutation pairs hidden while spoilers are off.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ResultButton({ wheel, title, active, onSelect }: {
  wheel: WheelResult;
  title: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={`nomu-result${active ? ' active' : ''}`} aria-pressed={active} onClick={onSelect}>
      <strong>{title}</strong>
      <span>{wheel.frogs.length} frogs · {wheel.pairCount} pairs</span>
      {!wheel.complete && (
        <span className="nomu-status is-unknown">
          {wheel.toRecord.length} to record{wheel.unobtainable > 0 && ` · ${wheel.unobtainable} unobtainable`}
        </span>
      )}
    </button>
  );
}

// A pair links to its Breeding Pairs page.
function PairLink({ a, b, nameOf }: { a: string; b: string; nameOf: (id: string) => string }) {
  return (
    <Link to={`/breeding${frogSearch('pair', frogIdsParam([a, b]))}`}>
      {nameOf(a)} × {nameOf(b)}
    </Link>
  );
}
