import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchFrogPairs, type FrogPair } from '../api/teable';
import FrogInputs from '../components/FrogInputs';
import { useFrogOptions } from '../hooks/useFrogOptions';
import {
  EMPTY_FROG, MAX_PLANNER_FROGS as MAX_FROGS, decodeFrogParam, encodeFrogParam, frogId, frogName, frogPath, isComplete,
  type CompleteFrogSel, type FrogSel,
} from '../utils/frogIds';

// Grey: no pair record, or one that isn't Verified (its data implies nothing).
// Green: Verified with no mutations. Red: Verified and produces a mutation.
type LineStatus = 'unknown' | 'clear' | 'mutation';

const STATUS_TEXT: Record<LineStatus, string> = {
  unknown:  'Not verified',
  clear:    'Verified, no mutations',
  mutation: 'Verified, produces a mutation',
};

const STATUS_MARK: Record<LineStatus, string> = { unknown: '?', clear: '✓', mutation: '✗' };

interface PlannedFrog {
  sel:  CompleteFrogSel;
  name: string;
  id:   string | null; // Frog_ID, e.g. "0:18:11"
}

interface Edge {
  key:    string;
  a:      number;
  b:      number;
  status: LineStatus;
  mark:   { x: number; y: number };
}

// An editor open for a new frog (index null) or an existing one. `key` bumps
// whenever it opens so the ComboBoxes remount with the right selection.
interface Editor {
  index: number | null;
  sel:   FrogSel;
  key:   number;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Where along its line (0–1) a mark may sit, best first.
const MARK_SPOTS = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75];
// Closest two marks may sit, in canvas percent (x is scaled by the 4:3 aspect).
const MARK_GAP = 6;
// Clear zone around the centre when several lines cross there, same units.
const CENTER_GAP = 7;
const MARK_ORDER: Record<LineStatus, number> = { mutation: 0, clear: 1, unknown: 2 };

// Board sizing (desktop): full page width, and as tall as fits on screen with
// room left below for the frog picker, between a floor and a 4:3 ceiling.
const PICKER_RESERVE = 250; // open picker (~195px, one row of dropdowns) + 20px gap + page padding
const BOARD_MIN_HEIGHT = 480;
const MOBILE_MAX_WIDTH = 640; // phones keep the CSS aspect ratio instead

// Node centres as percentages of the canvas, evenly spaced around an ellipse
// starting at the top (a lone pair sits side by side).
function nodePositions(n: number): { x: number; y: number }[] {
  if (n === 1) return [{ x: 50, y: 50 }];
  const start = n === 2 ? Math.PI : -Math.PI / 2;
  return Array.from({ length: n }, (_, i) => {
    const angle = start + (i * 2 * Math.PI) / n;
    return { x: 50 + 37 * Math.cos(angle), y: 50 + 36 * Math.sin(angle) };
  });
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  );
}

function IconMinus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18"/>
      <line x1="18" y1="6" x2="6" y2="18"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

// Height for the board element, or undefined to leave it to CSS (phones).
function useBoardHeight(el: HTMLDivElement | null): number | undefined {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    if (!el) return;
    const update = () => {
      if (window.innerWidth <= MOBILE_MAX_WIDTH) { setHeight(undefined); return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      const fits = window.innerHeight - top - PICKER_RESERVE;
      setHeight(Math.round(Math.max(BOARD_MIN_HEIGHT, Math.min(el.clientWidth * 3 / 4, fits))));
    };
    // Fires once on observe, then whenever the board's width changes.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [el]);
  return height;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MutationPlanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const frogOptions = useFrogOptions();
  const { lookup } = frogOptions;
  const { data: pairs } = useQuery({ queryKey: ['pairs'], queryFn: fetchFrogPairs });

  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeFrog, setActiveFrog] = useState<number | null>(null);
  const [activeEdge, setActiveEdge] = useState<string | null>(null);

  // The plan lives in the URL as Frog_IDs (?frogs=0-18-11_0-18-4), so a plan
  // can be shared as a link. Duplicates and anything past the cap are dropped.
  const frogs = useMemo<PlannedFrog[]>(() => {
    if (!lookup) return [];
    const seen = new Set<string>();
    return decodeFrogParam(searchParams.get('frogs'), lookup)
      .map(sel => ({ sel, name: frogName(sel), id: frogId(sel, lookup) }))
      .filter(f => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
      })
      .slice(0, MAX_FROGS);
  }, [lookup, searchParams]);

  function saveFrogs(list: CompleteFrogSel[]) {
    if (!lookup) return;
    const value = encodeFrogParam(list, lookup);
    setSearchParams(p => {
      if (value) p.set('frogs', value); else p.delete('frogs');
      return p;
    }, { replace: true });
  }

  // Pair records keyed by both Frog_IDs (either order). If a pair was somehow
  // recorded twice, the Verified record wins.
  const pairByKey = useMemo(() => {
    const m = new Map<string, FrogPair>();
    for (const p of pairs ?? []) {
      if (!p.frogATitle || !p.frogBTitle) continue;
      const k = pairKey(p.frogATitle, p.frogBTitle);
      if (!m.get(k)?.verified) m.set(k, p);
    }
    return m;
  }, [pairs]);

  const positions = useMemo(() => nodePositions(frogs.length), [frogs.length]);

  const edges = useMemo<Edge[]>(() => {
    const n = frogs.length;
    const list: Edge[] = [];
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const fa = frogs[a], fb = frogs[b];
        const pair = fa.id && fb.id ? pairByKey.get(pairKey(fa.id, fb.id)) : undefined;
        const status: LineStatus = !pair?.verified ? 'unknown' : pair.mutationCount > 0 ? 'mutation' : 'clear';
        list.push({ key: `${a}-${b}`, a, b, status, mark: { x: 0, y: 0 } });
      }
    }

    // Marks start at their line's midpoint and slide along it until clear of
    // marks already placed (lines across the circle all cross at the centre).
    // Verified lines go first so their marks get the best spots. With an even
    // count of 4+, the lines straight across all meet at the centre, so a mark
    // there would be ambiguous: keep the centre clear.
    const placed: { x: number; y: number }[] = [];
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot((p.x - q.x) * 4 / 3, p.y - q.y);
    const crossesAtCenter = n >= 4 && n % 2 === 0;
    // How much clearance a spot has, as a fraction of what it needs (≥ 1 = fits).
    const room = (p: { x: number; y: number }) => Math.min(
      Infinity,
      ...placed.map(q => dist(p, q) / MARK_GAP),
      crossesAtCenter ? dist(p, { x: 50, y: 50 }) / CENTER_GAP : Infinity,
    );
    for (const e of [...list].sort((x, y) => MARK_ORDER[x.status] - MARK_ORDER[y.status])) {
      const pa = positions[e.a], pb = positions[e.b];
      const spots = MARK_SPOTS.map(t => ({ x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t }));
      e.mark = spots.find(p => room(p) >= 1)
        ?? spots.reduce((best, p) => (room(p) > room(best) ? p : best));
      placed.push(e.mark);
    }
    return list;
  }, [frogs, pairByKey, positions]);

  // Hovering a frog lights its lines; hovering a line lights just that one.
  const focusing = activeFrog !== null || activeEdge !== null;
  const isLit = (e: Edge) => e.a === activeFrog || e.b === activeFrog || e.key === activeEdge;
  const edgeClass = (e: Edge) =>
    `is-${e.status}${focusing ? (isLit(e) ? ' is-lit' : ' is-dim') : ''}`;

  const pairHref = (e: Edge) =>
    lookup ? `/breeding?pair=${encodeFrogParam([frogs[e.a].sel, frogs[e.b].sel], lookup)}` : '/breeding';

  // ── Editing ───────────────────────────────────────────────────────────────

  const editName = editor && isComplete(editor.sel) ? frogName(editor.sel) : null;
  const duplicateOf = editName
    ? frogs.findIndex((f, i) => i !== editor?.index && f.name === editName)
    : -1;
  const canSave = !!editName && duplicateOf < 0;

  function openEditor(index: number | null) {
    setEditor(prev => ({
      index,
      sel: index === null ? EMPTY_FROG : frogs[index].sel,
      key: (prev?.key ?? 0) + 1,
    }));
  }

  function saveEditor() {
    if (!editor || !canSave || !isComplete(editor.sel)) return;
    const list = frogs.map(f => f.sel);
    if (editor.index === null) list.push(editor.sel);
    else list[editor.index] = editor.sel;
    saveFrogs(list);
    // Adding stays open (cleared) for the next frog until the plan is full;
    // an edit is a one-off.
    if (editor.index === null && list.length < MAX_FROGS) openEditor(null);
    else setEditor(null);
  }

  function removeFrog(index: number) {
    saveFrogs(frogs.filter((_, i) => i !== index).map(f => f.sel));
    setActiveFrog(null);
    setEditor(prev => {
      if (!prev || prev.index === null) return prev;
      if (prev.index === index) return null;
      return prev.index > index ? { ...prev, index: prev.index - 1 } : prev;
    });
  }

  const full = frogs.length >= MAX_FROGS;

  const [board, setBoard] = useState<HTMLDivElement | null>(null);
  const boardHeight = useBoardHeight(board);

  return (
    <div>
      <h1>Mutation Planner</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Add up to {MAX_FROGS} frogs to see which pairs are verified and which are known to produce a mutation.
        Select a line to open that pair in Breeding Pairs.
      </p>

      {!lookup ? (
        <p className="search-hint">Loading frog data…</p>
      ) : (
        <>
          <ul className="planner-legend">
            {(['clear', 'mutation', 'unknown'] as const).map(s => (
              <li key={s}>
                <span className={`planner-mark is-${s}`} aria-hidden="true">{STATUS_MARK[s]}</span>
                {STATUS_TEXT[s]}
              </li>
            ))}
          </ul>

          <div className="planner-canvas" ref={setBoard} style={{ height: boardHeight }}>
            <div className="planner-toolbar">
              {editor ? (
                <button
                  type="button"
                  className="planner-add"
                  onClick={() => setEditor(null)}
                  aria-label="Close the frog editor"
                  title="Close"
                >
                  <IconClose />
                </button>
              ) : (
                <button
                  type="button"
                  className="planner-add"
                  onClick={() => openEditor(null)}
                  disabled={full}
                  aria-label="Add a frog"
                  title={full ? `A habitat holds up to ${MAX_FROGS} frogs` : 'Add a frog'}
                >
                  <IconPlus />
                </button>
              )}
              <span className="planner-count">{frogs.length} / {MAX_FROGS}</span>
            </div>

            {frogs.length === 0 && (
              <p className="planner-empty">Add a frog to start planning.</p>
            )}

            <svg className="planner-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {edges.map(e => (
                <g
                  key={e.key}
                  className={`planner-edge ${edgeClass(e)}`}
                  onMouseEnter={() => setActiveEdge(e.key)}
                  onMouseLeave={() => setActiveEdge(null)}
                  onClick={() => navigate(pairHref(e))}
                >
                  <line className="planner-line-hit" vectorEffect="non-scaling-stroke"
                    x1={positions[e.a].x} y1={positions[e.a].y} x2={positions[e.b].x} y2={positions[e.b].y} />
                  <line className="planner-line" vectorEffect="non-scaling-stroke"
                    x1={positions[e.a].x} y1={positions[e.a].y} x2={positions[e.b].x} y2={positions[e.b].y} />
                </g>
              ))}
            </svg>

            {edges.map(e => (
              <Link
                key={e.key}
                to={pairHref(e)}
                className={`planner-mark ${edgeClass(e)}`}
                style={{ left: `${e.mark.x}%`, top: `${e.mark.y}%` }}
                onMouseEnter={() => setActiveEdge(e.key)}
                onMouseLeave={() => setActiveEdge(null)}
                onFocus={() => setActiveEdge(e.key)}
                onBlur={() => setActiveEdge(null)}
                aria-label={`${frogs[e.a].name} × ${frogs[e.b].name}: ${STATUS_TEXT[e.status]}. Open in Breeding Pairs.`}
                title={`${STATUS_TEXT[e.status]}. Open in Breeding Pairs.`}
              >
                {STATUS_MARK[e.status]}
              </Link>
            ))}

            {frogs.map((f, i) => (
              <div
                key={f.name}
                className={`planner-frog${activeFrog === i ? ' is-active' : ''}${editor?.index === i ? ' is-editing' : ''}`}
                style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
                onMouseEnter={() => setActiveFrog(i)}
                onMouseLeave={() => setActiveFrog(null)}
                onFocus={() => setActiveFrog(i)}
                onBlur={() => setActiveFrog(null)}
              >
                <button type="button" className="planner-frog-btn planner-frog-edit" onClick={() => openEditor(i)}
                  aria-label={`Edit ${f.name}`} title="Edit">
                  <IconPencil />
                </button>
                <button type="button" className="planner-frog-btn planner-frog-remove" onClick={() => removeFrog(i)}
                  aria-label={`Remove ${f.name}`} title="Remove">
                  <IconMinus />
                </button>
                {f.id ? (
                  <Link to={frogPath(f.id)} className="planner-frog-name" title={`View ${f.name}`}>
                    <span>{f.sel.base.label}</span>
                    <span>{f.sel.sec.label}</span>
                    <span>{f.sel.breed.label}</span>
                  </Link>
                ) : (
                  <span className="planner-frog-name">
                    <span>{f.sel.base.label}</span>
                    <span>{f.sel.sec.label}</span>
                    <span>{f.sel.breed.label}</span>
                  </span>
                )}
              </div>
            ))}
          </div>

          {editor && (
            <div className="planner-editor">
              <FrogInputs
                key={editor.key}
                title={editor.index === null ? 'Add a Frog' : `Edit ${frogs[editor.index]?.name ?? 'Frog'}`}
                sel={editor.sel}
                onChange={sel => setEditor(prev => (prev ? { ...prev, sel } : prev))}
                options={frogOptions}
              >
                {duplicateOf >= 0 && (
                  <p className="planner-duplicate" role="alert">
                    {editName} is already in this plan. Choose a different frog or cancel.
                  </p>
                )}
                <div className="crop-buttons">
                  <button type="button" className="csv-btn" onClick={saveEditor} disabled={!canSave}>
                    {editor.index === null ? 'Add' : 'Save'}
                  </button>
                  <button type="button" className="csv-btn" onClick={() => setEditor(null)}>Cancel</button>
                </div>
              </FrogInputs>
            </div>
          )}
        </>
      )}
    </div>
  );
}
