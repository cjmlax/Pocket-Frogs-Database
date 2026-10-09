import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchFrogPairs, fetchMutations } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import FrogInputs from '../components/FrogInputs';
import { useFrogOptions } from '../hooks/useFrogOptions';
import { useSpoilers } from '../hooks/useSpoilers';
import { downloadCsv } from '../utils/csv';
import {
  MAX_PLANNER_FROGS as HABITAT_SIZE, frogId, frogIdsParam, frogName, frogPath, frogSearch, isComplete, parseFrogId,
  type FrogSel,
} from '../utils/frogIds';
import { createWheelSolver, pairFloors, type PlanRow, type WheelMode, type WheelResult } from '../utils/nomuWheel';
import { WHEEL_PRESETS } from '../utils/wheelPresets';

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

const baseCodeOf = (id: string) => id.split(':')[0];
const sameFrogs = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ── Habitat layout ───────────────────────────────────────────────────────────
// Three ordered lists of Frog_IDs, kept in the URL (?h=, habitats split by
// "." and frogs by "_") so a layout survives a trip to the Planner and back
// and can be shared. Locks stay on the page, so shared links are the same for
// everyone.

type Layout = string[][];
type Slot = { h: number; i: number };

const EMPTY_LAYOUT: Layout = Array.from({ length: HABITATS }, () => []);

const encodeLayout = (layout: Layout) =>
  (layout.some(h => h.length) ? layout.map(h => h.join('_')).join('.') : null);

// Keeps what's valid: frogs of this breed, one per base, up to 8 a habitat.
function parseLayout(param: string | null, breed: string | null): Layout {
  if (!param || !breed) return EMPTY_LAYOUT;
  const bases = new Set<string>();
  const habitats = param.split('.').slice(0, HABITATS).map(h => (h ? h.split('_') : []).flatMap(text => {
    const id = parseFrogId(text);
    if (!id || id.split(':')[2] !== breed || bases.has(baseCodeOf(id))) return [];
    bases.add(baseCodeOf(id));
    return [id];
  }).slice(0, HABITAT_SIZE));
  while (habitats.length < HABITATS) habitats.push([]);
  return habitats;
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

// Fills the habitats with a wheel: locked frogs stay put (every result keeps
// them), unlocked frogs stay only if the wheel uses them, and the wheel's
// other frogs fill the remaining slots in order.
function applyWheel(layout: Layout, locked: Set<string>, frogs: string[]): Layout {
  const wanted = new Set(frogs);
  const next = layout.map(h => h.filter(f => locked.has(f) || wanted.has(f)));
  const placed = new Set(next.flat());
  const rest = frogs.filter(f => !placed.has(f));
  for (const h of next) while (h.length < HABITAT_SIZE && rest.length) h.push(rest.shift()!);
  return next;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconLock({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'}/>
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  );
}

// An editor open on one habitat slot. `key` bumps whenever it opens so the
// inputs remount with the right selection.
interface Editor {
  slot: Slot;
  sel:  FrogSel;
  key:  number;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NoMuWheels() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const frogOptions = useFrogOptions();
  const { lookup, breedOpts, baseOpts, secOpts } = frogOptions;
  const { spoilers } = useSpoilers();
  const { data: pairs }     = useQuery({ queryKey: ['pairs'],     queryFn: fetchFrogPairs });
  const { data: mutations } = useQuery({ queryKey: ['mutations'], queryFn: fetchMutations });

  const breedCode = searchParams.get('breed');
  const mode: WheelMode = searchParams.get('mode') === 'mutation' ? 'mutation' : 'nomu';
  const layoutParam = searchParams.get('h');

  function update(next: Partial<Record<'breed' | 'mode' | 'h', string | null>>) {
    const keys = ['breed', 'mode', 'h'] as const;
    const params = Object.fromEntries(keys.map(k => [k, k in next ? next[k] : searchParams.get(k)]));
    navigate({ search: buildSearch(params) }, { replace: true });
  }

  const breedOpt = (breedCode && lookup?.breed.byCode.get(breedCode)) || null;
  const breedLabel = breedOpt?.label ?? '';

  const layout = useMemo(() => parseLayout(layoutParam, breedCode), [layoutParam, breedCode]);
  const boardFrogs = useMemo(() => layout.flat(), [layout]);
  // Locked Frog_IDs, tied to the breed they were set on. Locks only count for
  // frogs on the board.
  const [lockState, setLockState] = useState<{ breed: string | null; ids: Set<string> } | null>(null);
  const locked = useMemo(() => {
    const onBoard = new Set(boardFrogs);
    const ids = lockState?.breed === breedCode ? lockState.ids : new Set<string>();
    return new Set([...ids].filter(id => onBoard.has(id)));
  }, [lockState, breedCode, boardFrogs]);

  function save(nextLayout: Layout, nextLocked: Set<string>) {
    const onBoard = new Set(nextLayout.flat());
    setLockState({ breed: breedCode, ids: new Set([...nextLocked].filter(id => onBoard.has(id))) });
    update({ h: encodeLayout(nextLayout) });
  }

  // Bases and secondaries go in in table order (rainbow), so results don't
  // depend on the viewer's sort settings.
  const solver = useMemo(() => {
    if (!lookup || !pairs || !mutations || !breedCode || !lookup.breed.byCode.has(breedCode)) return null;
    const bases = [...lookup.base.byCode.keys()];
    const secs  = [...lookup.sec.byCode.keys()];
    const glassBase = [...lookup.base.byCode].find(([, o]) => o.label === 'Glass')?.[0] ?? null;
    return createWheelSolver({ breed: breedCode, bases, secs, glassBase, mode, pairs, mutations });
  }, [lookup, pairs, mutations, breedCode, mode]);

  const analysis = useMemo(() => solver?.analyze([...locked]) ?? null, [solver, locked]);
  const plan = useMemo(() => (solver && boardFrogs.length ? solver.plan(boardFrogs) : null), [solver, boardFrogs]);
  const completeCount = analysis?.complete.length ?? 0;
  const activeResult = analysis
    ? [...analysis.complete, ...analysis.nearMisses].findIndex(w => sameFrogs(w.frogs, boardFrogs))
    : -1;

  // Presets name their colours; resolve them to this breed's Frog_IDs.
  const presets = useMemo(() => {
    if (!lookup || !breedCode) return [];
    const codeOf = (part: Map<string, ComboOption>, label: string) =>
      [...part].find(([, o]) => o.label.toLowerCase() === label.toLowerCase())?.[0];
    return WHEEL_PRESETS.map(p => ({
      ...p,
      ids: p.frogs.flatMap(([base, sec]) => {
        const b = codeOf(lookup.base.byCode, base), s = codeOf(lookup.sec.byCode, sec);
        return b && s ? [`${b}:${s}:${breedCode}`] : [];
      }),
    }));
  }, [lookup, breedCode]);
  const activePreset = presets.find(p => sameFrogs(p.ids, boardFrogs)) ?? null;

  // Like choosing a wheel, except a locked frog wins over the preset's frog
  // of the same base colour.
  function applyPreset(ids: string[]) {
    const lockedBases = new Map([...locked].map(id => [baseCodeOf(id), id]));
    const frogs = ids.filter(id => (lockedBases.get(baseCodeOf(id)) ?? id) === id);
    for (const id of locked) if (!frogs.includes(id)) frogs.push(id);
    setEditor(null);
    save(applyWheel(layout, locked, frogs), locked);
  }

  const habitatOf = useMemo(() => {
    const m = new Map<string, number>();
    layout.forEach((frogs, h) => frogs.forEach(f => m.set(f, h)));
    return m;
  }, [layout]);

  const partsOf = (id: string) => {
    const [b, s] = id.split(':');
    return { base: lookup?.base.byCode.get(b)?.label ?? b, sec: lookup?.sec.byCode.get(s)?.label ?? s };
  };
  const nameOf = (id: string) => {
    const { base, sec } = partsOf(id);
    return `${base} ${sec}`;
  };
  const habitatText = (...ids: string[]) =>
    [...new Set(ids.map(id => habitatOf.get(id)).filter((h): h is number => h != null))]
      .sort((x, y) => x - y).map(h => h + 1).join(' + ');

  // ── Moving frogs ──────────────────────────────────────────────────────────
  // A frog picked up by tapping, tied to the layout it was picked from.
  const boardKey = `${breedCode}|${layoutParam ?? ''}`;
  const [heldState, setHeld] = useState<{ key: string; slot: Slot } | null>(null);
  const held = heldState?.key === boardKey ? heldState.slot : null;

  function applyMove(from: Slot, to: Slot) {
    const next = moveFrog(layout, from, to);
    setHeld(null);
    if (next) save(next, locked);
  }

  const dragProps = (slot: Slot) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const [h, i] = e.dataTransfer.getData('text/plain').split(',').map(Number);
      if (Number.isInteger(h) && Number.isInteger(i)) applyMove({ h, i }, slot);
    },
  });

  function tapFrog(slot: Slot) {
    if (!held) setHeld({ key: boardKey, slot });
    else if (held.h === slot.h && held.i === slot.i) setHeld(null);
    else applyMove(held, slot);
  }

  function toggleLock(id: string) {
    const next = new Set(locked);
    if (!next.delete(id)) next.add(id);
    save(layout, next);
  }

  // ── Editing frogs ─────────────────────────────────────────────────────────
  const [editorState, setEditor] = useState<{ key: string; editor: Editor } | null>(null);
  const editor = editorState?.key === boardKey ? editorState.editor : null;

  function openEditor(slot: Slot) {
    setHeld(null);
    const id = layout[slot.h][slot.i];
    const [b, s] = id ? id.split(':') : [];
    setEditor(prev => ({
      key: boardKey,
      editor: {
        slot,
        // The breed is the page's; the dropdowns only pick the colours.
        sel: {
          base:  (b && lookup?.base.byCode.get(b)) || null,
          sec:   (s && lookup?.sec.byCode.get(s)) || null,
          breed: breedOpt,
        },
        key: (prev?.editor.key ?? 0) + 1,
      },
    }));
  }

  // The text box takes a whole frog, so it can name another breed.
  const editSel = editor && isComplete(editor.sel) ? editor.sel : null;
  const editId = editSel && lookup ? frogId(editSel, lookup) : null;
  const wrongBreed = !!editId && editId.split(':')[2] !== breedCode;
  const editingId = editor ? layout[editor.slot.h][editor.slot.i] ?? null : null;
  const baseClash = editId && !wrongBreed
    ? boardFrogs.find(f => f !== editingId && baseCodeOf(f) === baseCodeOf(editId)) ?? null
    : null;

  // Frogs you enter are ones you have, so they're locked in.
  function saveEditor() {
    if (!editor || !editId || wrongBreed || baseClash) return;
    const next = layout.map(h => [...h]);
    const { h, i } = editor.slot;
    if (i < next[h].length) next[h][i] = editId; else next[h].push(editId);
    const nextLocked = new Set(locked);
    if (editingId) nextLocked.delete(editingId);
    nextLocked.add(editId);
    setEditor(null);
    save(next, nextLocked);
  }

  function removeEditing() {
    if (!editor || !editingId) return;
    setEditor(null);
    save(layout.map((frogs, h) => (h === editor.slot.h ? frogs.filter(f => f !== editingId) : frogs)), locked);
  }

  // ── Breeding plan views ───────────────────────────────────────────────────
  const [view, setView] = useState<'frog' | 'pair'>('frog');
  const [onlyToRecord, setOnlyToRecord] = useState(false);

  const hidePair = (row: PlanRow) => hiddenPair(row, spoilers);

  // Rows in the viewer's colour order, by base then secondary.
  const frogRows = useMemo(() => {
    if (!plan || !lookup) return [];
    const byFrog = new Map(plan.rows.map(r => [r.frog, r]));
    const rows: PlanRow[] = [];
    for (const b of baseOpts) {
      for (const s of secOpts) {
        const row = byFrog.get(`${lookup.base.code.get(b.id)}:${lookup.sec.code.get(s.id)}:${breedCode}`);
        if (row) rows.push(row);
      }
    }
    return rows;
  }, [plan, lookup, baseOpts, secOpts, breedCode]);

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
    const rows: (string | number)[][] = [['Frog_ID', 'Frog', 'Parent A', 'Parent B', 'Habitats', 'Status']];
    for (const row of frogRows) {
      const s = row.source;
      const parents = s.kind === 'pair' && !hidePair(row) ? [s.a, s.b] : ['', ''];
      const habitats = s.kind === 'pair' ? (hidePair(row) ? '' : habitatText(s.a, s.b)) : s.kind === 'wheel' ? habitatText(row.frog) : '';
      rows.push([row.frog, `${nameOf(row.frog)} ${breedLabel}`, ...parents, habitats, STATUS_TEXT[rowStatus(row)]]);
    }
    downloadCsv(`nomu-${breedLabel}-${mode}`, rows);
  }

  const loading = !lookup || !pairs || !mutations;
  const resultTitle = (index: number) =>
    (index < completeCount ? `Wheel ${index + 1}` : `Near miss ${index - completeCount + 1}`);

  return (
    <div>
      <h1>NoMu Wheels</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        A colour wheel is one frog of each base colour, all the same breed, that between them breed every
        frog of that breed for the Froggydex. Wheels here are built from verified pairs only. Near misses
        list the pairs still to record. Add frogs you already own and lock them, and the wheels found will
        keep them.
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
            if (code && code !== breedCode) update({ breed: code, h: null });
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
                onClick={() => update({ mode: m === 'nomu' ? null : m })}
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
      ) : !breedOpt || !solver || !analysis ? (
        <p className="search-hint">Choose a breed to find its wheels.</p>
      ) : (
        <>
          <div className="nomu-results">
            <div className="nomu-result-group">
              <h2>Complete wheels</h2>
              {solver.recordedPairs === 0 ? (
                <p className="search-hint">No verified {breedLabel} pairs are recorded yet.</p>
              ) : completeCount === 0 ? (
                <p className="search-hint">
                  None yet, from {solver.recordedPairs} verified {breedLabel} pairs
                  {locked.size > 0 && ` with your ${locked.size} locked frog${locked.size === 1 ? '' : 's'}`}.
                </p>
              ) : (
                <div className="nomu-result-list">
                  {analysis.complete.map((w, i) => (
                    <ResultButton secs={lookup?.sec.byCode.size ?? 16} key={i} wheel={w} title={resultTitle(i)} active={i === activeResult}
                      onSelect={() => save(applyWheel(layout, locked, w.frogs), locked)} />
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
                      <ResultButton secs={lookup?.sec.byCode.size ?? 16} key={index} wheel={w} title={resultTitle(index)} active={index === activeResult}
                        onSelect={() => save(applyWheel(layout, locked, w.frogs), locked)} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="nomu-section-head">
            <h2>
              Habitats{activeResult >= 0 ? `: ${resultTitle(activeResult)}` : activePreset ? `: ${activePreset.name}` : ''}
            </h2>
            <div className="nomu-head-actions">
              {presets.map(p => (
                <button key={p.name} type="button" className="csv-btn" onClick={() => applyPreset(p.ids)}
                  aria-pressed={activePreset?.name === p.name} title={`${p.description}. Locked frogs stay.`}>
                  {p.name}
                </button>
              ))}
              {boardFrogs.length > 0 && boardFrogs.length > locked.size && (
                  <button type="button" className="csv-btn"
                    onClick={() => save(layout.map(h => h.filter(f => locked.has(f))), locked)}>
                    Clear unlocked
                  </button>
              )}
              {boardFrogs.length > 0 && (
                <button type="button" className="csv-btn" onClick={() => { setEditor(null); setLockState(null); update({ h: null }); }}>
                  Clear all
                </button>
              )}
            </div>
          </div>
          <p className="search-hint" style={{ marginTop: 0 }}>
            Choose a wheel above or a preset to fill the habitats, or add frogs with +. Lock the frogs you own to keep them
            in every wheel; choosing a wheel replaces only unlocked frogs. Drag a frog onto another to swap them
            or onto an empty slot to move it (on touch screens, tap a frog, then tap where it should go).
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
                    const isEditing = editor?.slot.h === h && editor.slot.i === i;
                    if (!id) {
                      return (
                        <li key={`empty-${i}`}>
                          <button
                            type="button"
                            className={`nomu-slot-empty${held ? ' is-target' : ''}${isEditing ? ' is-editing' : ''}`}
                            onClick={() => (held ? applyMove(held, slot) : openEditor({ h, i: frogs.length }))}
                            aria-label={held ? `Move the picked frog to habitat ${h + 1}` : `Add a frog to habitat ${h + 1}`}
                            title={held ? 'Move here' : 'Add a frog'}
                            {...dragProps(slot)}
                          >
                            {held ? 'Move here' : '+'}
                          </button>
                        </li>
                      );
                    }
                    const { base, sec } = partsOf(id);
                    const isHeld = held?.h === h && held.i === i;
                    const isLocked = locked.has(id);
                    return (
                      <li
                        key={id}
                        className={`nomu-frog${isHeld ? ' is-held' : ''}${isLocked ? ' is-locked' : ''}${isEditing ? ' is-editing' : ''}`}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', `${h},${i}`);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        {...dragProps(slot)}
                      >
                        <button
                          type="button"
                          className="nomu-frog-main"
                          onClick={() => tapFrog(slot)}
                          aria-pressed={isHeld}
                          aria-label={`${nameOf(id)}, habitat ${h + 1}${isLocked ? ', locked' : ''}. ${
                            isHeld ? 'Picked up; select again to put it back.'
                            : held ? 'Swap with the picked frog.'
                            : 'Select to pick up and move.'}`}
                        >
                          <span>{base}</span>
                          <span>{sec}</span>
                        </button>
                        <button
                          type="button"
                          className="nomu-frog-icon is-lock"
                          onClick={() => toggleLock(id)}
                          aria-pressed={isLocked}
                          aria-label={`${isLocked ? 'Unlock' : 'Lock'} ${nameOf(id)}`}
                          title={isLocked ? 'Locked: every wheel keeps this frog. Select to unlock.' : 'Lock to keep this frog in every wheel'}
                        >
                          <IconLock open={!isLocked} />
                        </button>
                        <button
                          type="button"
                          className="nomu-frog-icon is-edit"
                          onClick={() => openEditor(slot)}
                          aria-label={`Change ${nameOf(id)}`}
                          title="Change this frog"
                        >
                          <IconPencil />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>

          {editor && (
            <div className="planner-editor">
              <FrogInputs
                key={editor.key}
                title={`${editingId ? `Edit ${nameOf(editingId)}` : `Add a ${breedLabel} Frog`} · Habitat ${editor.slot.h + 1}`}
                sel={editor.sel}
                onChange={sel => setEditor(prev => (prev ? { ...prev, editor: { ...prev.editor, sel } } : prev))}
                options={frogOptions}
                hideBreed
              >
                {wrongBreed && editSel && (
                  <p className="planner-duplicate" role="alert">
                    {frogName(editSel)} is a {editSel.breed.label} frog. Choose a {breedLabel} frog for this wheel.
                  </p>
                )}
                {baseClash && (
                  <p className="planner-duplicate" role="alert">
                    {nameOf(baseClash)} already holds this base colour. A wheel has one frog per base colour.
                  </p>
                )}
                <div className="crop-buttons">
                  <button type="button" className="csv-btn" onClick={saveEditor} disabled={!editId || wrongBreed || !!baseClash}>
                    {editingId ? 'Save' : 'Add'}
                  </button>
                  {editingId && <button type="button" className="csv-btn" onClick={removeEditing}>Remove</button>}
                  <button type="button" className="csv-btn" onClick={() => setEditor(null)}>Cancel</button>
                </div>
              </FrogInputs>
            </div>
          )}

          {plan ? (
            <>
              <div className="nomu-section-head">
                <h2>Breeding plan</h2>
                <button type="button" className="csv-btn" onClick={exportCsv}>Download CSV</button>
              </div>
              <p className="nomu-summary">
                <span>{plan.frogs.length} wheel frogs</span>
                <span>{plan.pairCount} breeding pairs</span>
                {plan.complete && <span className="nomu-status is-clear">Complete</span>}
                {plan.toRecord.length > 0 && <span className="nomu-status is-unknown">{plan.toRecord.length} pairs to record</span>}
                {plan.unobtainable > 0 && <span className="nomu-status is-missing">{plan.unobtainable} unobtainable</span>}
              </p>
              <p className="search-hint" style={{ marginTop: 0 }}>
                Each {breedLabel} frog and the pair in your habitats to breed for it, using as few pairs as possible.
                {mode === 'mutation' && !spoilers && ' Spoilers are off, so pairs that give Glass or Chroma mutations are hidden.'}
              </p>

              <div className="table-toolbar">
                <div className="settings-row nomu-view-toggle">
                  {(['frog', 'pair'] as const).map(v => (
                    <button key={v} type="button" className={`settings-theme-opt nomu-mode-btn${view === v ? ' active' : ''}`}
                      aria-pressed={view === v} onClick={() => setView(v)}>
                      {v === 'frog' ? 'By frog' : 'By pair'}
                    </button>
                  ))}
                </div>
                {(plan.toRecord.length > 0 || plan.unobtainable > 0) && (
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
          ) : (
            <p className="search-hint">Choose a wheel or add frogs to see the breeding plan.</p>
          )}
        </>
      )}
    </div>
  );
}

// Gold star: as few pairs as any wheel this size can need (204 for 23 frogs).
// Accent star: the next best (210).
function ResultButton({ wheel, title, active, secs, onSelect }: {
  wheel: WheelResult;
  title: string;
  active: boolean;
  secs: number;
  onSelect: () => void;
}) {
  const floors = pairFloors(wheel.frogs.length, secs);
  const star = wheel.pairCount <= floors.best ? 'gold' : wheel.pairCount <= floors.next ? 'accent' : null;
  return (
    <button type="button" className={`nomu-result${active ? ' active' : ''}`} aria-pressed={active} onClick={onSelect}
      title="Fill the habitats with this wheel (locked frogs stay put)">
      <strong>
        {title}
        {star && (
          <span className={`max-value-star${star === 'gold' ? ' is-gold' : ''}`}
            title={star === 'gold' ? 'Fewest breeding pairs possible' : 'Second-fewest breeding pairs possible'}>★</span>
        )}
      </strong>
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
