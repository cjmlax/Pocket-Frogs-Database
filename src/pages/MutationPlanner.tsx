import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFrogPairs, type FrogPair } from '../api/teable';
import FrogInputs from '../components/FrogInputs';
import VerifyPairsDialog, { type VerifyPairItem } from '../components/VerifyPairsDialog';
import { IconPencil, StatusMark, VerifyMark } from '../components/PairStatus';
import { useModToken } from '../hooks/useModToken';
import { usePairByKey } from '../hooks/usePairByKey';
import { useFrogOptions } from '../hooks/useFrogOptions';
import {
  EMPTY_FROG, MAX_PLANNER_FROGS as MAX_FROGS, decodeFrogParam, encodeFrogParam, frogId, frogName, frogPath, frogSearch, isComplete,
  type CompleteFrogSel, type FrogSel,
} from '../utils/frogIds';
import { STATUS_TEXT, pairKey, pairStatusById, type LineStatus } from '../utils/pairStatus';

interface PlannedFrog {
  sel:  CompleteFrogSel;
  name: string;
  id:   string | null; // Frog_ID, e.g. "18:11:0"
}

// A frog's own controls sit on the outer edge of its bubble, away from the
// lines (which all head inward): the self-breeding mark points straight out
// from the board's centre, flanked by edit and remove this many radians either side.
const CONTROL_SPREAD = 0.73; // ≈ 42°

type Offset = { x: number; y: number };

// Point on an ellipse (half-axes a, b) in screen direction `angle`.
function ellipseEdge(a: number, b: number, angle: number): Offset {
  const t = Math.atan2(a * Math.sin(angle), b * Math.cos(angle));
  return { x: a * Math.cos(t), y: b * Math.sin(t) };
}

// Offsets from a frog's centre for its three controls. Edit and remove follow
// reading order — edit is the left slot (or the upper one when the two are
// stacked), remove the right/lower one — so they never swap sides around the wheel.
function frogControls(outward: number, a: number, b: number): { self: Offset; edit: Offset; remove: Offset } {
  const self = ellipseEdge(a, b, outward);
  const one = ellipseEdge(a, b, outward - CONTROL_SPREAD);
  const two = ellipseEdge(a, b, outward + CONTROL_SPREAD);
  const oneFirst = Math.abs(one.x - two.x) > 4 ? one.x < two.x : one.y < two.y;
  return { self, edit: oneFirst ? one : two, remove: oneFirst ? two : one };
}

const at = (o: Offset) => ({ left: `calc(50% + ${o.x}px)`, top: `calc(50% + ${o.y}px)` });

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

function pairStatus(pairByKey: Map<string, FrogPair>, fa: PlannedFrog, fb: PlannedFrog): LineStatus {
  return pairStatusById(pairByKey, fa.id, fb.id);
}

// Mark placement, in board pixels. Each mark takes the spot along its own line
// nearest the midpoint that keeps clear of other marks, every other line (so it
// never sits on a crossing or where two lines run close) and the frogs.
// Candidate spots along a line (0–1), nearest the midpoint first.
const MARK_SPOTS = Array.from({ length: 57 }, (_, k) => 0.15 + k * 0.0125)
  .sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
// Clearances: centre to centre between marks, mark centre to any other line,
// and beyond a frog's outline. Phones use smaller marks (18px vs 22px) and frogs.
const GAPS = {
  desktop: { mark: 30, line: 17, frog: 12, frogX: 66, frogY: 46 },
  mobile:  { mark: 24, line: 13, frog: 10, frogX: 43, frogY: 31 },
};
const MARK_ORDER: Record<LineStatus, number> = { mutation: 0, clear: 1, unknown: 2 };

type Pt = { x: number; y: number };

// Distance from p to the segment a–b.
function segmentDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

// Places each edge's mark (returned in board percent). Verified lines go first
// so their marks get the best spots; if a line has no fully clear spot, its
// mark takes the one with the most room.
function placeMarks(edges: Edge[], positions: Pt[], size: BoardSize): void {
  const px = positions.map(p => ({ x: (p.x / 100) * size.width, y: (p.y / 100) * size.height }));
  const gap = size.mobile ? GAPS.mobile : GAPS.desktop;
  const placed: Pt[] = [];
  // Clearance at p as a fraction of what's needed (≥ 1 means it fits).
  const room = (p: Pt, own: Edge) => Math.min(
    ...placed.map(q => Math.hypot(p.x - q.x, p.y - q.y) / gap.mark),
    ...edges.filter(e => e !== own).map(e => segmentDist(p, px[e.a], px[e.b]) / gap.line),
    ...px.map(c => Math.hypot((p.x - c.x) / (gap.frogX + gap.frog), (p.y - c.y) / (gap.frogY + gap.frog))),
  );
  for (const e of [...edges].sort((x, y) => MARK_ORDER[x.status] - MARK_ORDER[y.status])) {
    const a = px[e.a], b = px[e.b];
    const spots = MARK_SPOTS.map(t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
    const rooms = spots.map(p => room(p, e));
    const fit = rooms.findIndex(r => r >= 1);
    const best = fit >= 0 ? fit : rooms.indexOf(Math.max(...rooms));
    placed.push(spots[best]);
    e.mark = { x: (spots[best].x / size.width) * 100, y: (spots[best].y / size.height) * 100 };
  }
}

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

interface BoardSize {
  width:  number;
  height: number;
  mobile: boolean; // phones size the board by CSS aspect ratio (3:4)
}

// The board's pixel size. On desktop the height is chosen here; on phones it
// follows from the CSS aspect ratio.
function useBoardSize(el: HTMLDivElement | null): BoardSize {
  const [size, setSize] = useState<BoardSize>({ width: 1000, height: 600, mobile: false });
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const mobile = window.innerWidth <= MOBILE_MAX_WIDTH;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const fits = window.innerHeight - top - PICKER_RESERVE;
      const height = Math.round(mobile
        ? width * 4 / 3
        : Math.max(BOARD_MIN_HEIGHT, Math.min(width * 3 / 4, fits)));
      // Keep the same object when nothing changed so marks aren't re-placed.
      setSize(prev => (prev.width === width && prev.height === height && prev.mobile === mobile
        ? prev
        : { width, height, mobile }));
    };
    // Fires once on observe, then whenever the board's width changes or the
    // layout around it does: a site alert appearing above the board grows the
    // page, and one being dismissed grows <main> (it stretches to fill the
    // window), both moving the board without resizing the window.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    ro.observe(document.body);
    const main = el.closest('main');
    if (main) ro.observe(main);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [el]);
  return size;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MutationPlanner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const frogOptions = useFrogOptions();
  const { lookup } = frogOptions;
  const { data: pairs } = useQuery({ queryKey: ['pairs'], queryFn: fetchFrogPairs });
  const queryClient = useQueryClient();

  const { idToken, isMod } = useModToken();

  // Verify mode (mods): unverified pairs are picked as having no mutations, and
  // everything else on the board is locked. `picked` holds pair keys of Frog_IDs.
  // It's tied to the plan it was started on: any change to the plan's URL
  // (back/forward, a pasted link) leaves it, so the page always opens in the
  // normal view. Verify mode itself never edits the plan.
  const frogsParam = searchParams.get('frogs') ?? '';
  const [verifyPlan, setVerifyPlan] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const verifyMode = isMod && verifyPlan === frogsParam;

  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeFrog, setActiveFrog] = useState<number | null>(null);
  const [activeEdge, setActiveEdge] = useState<string | null>(null);

  // The plan lives in the URL as Frog_IDs (?frogs=18:11:0_18:4:0), so a plan
  // can be shared as a link. Duplicates and anything past the cap are dropped
  // (a frog's pairing with itself is shown on its own bubble instead).
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
    navigate({ search: frogSearch('frogs', encodeFrogParam(list, lookup)) }, { replace: true });
  }

  const pairByKey = usePairByKey(pairs);

  const positions = useMemo(() => nodePositions(frogs.length), [frogs.length]);

  const [board, setBoard] = useState<HTMLDivElement | null>(null);
  const boardSize = useBoardSize(board);

  const edges = useMemo<Edge[]>(() => {
    const n = frogs.length;
    const list: Edge[] = [];
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        list.push({ key: `${a}-${b}`, a, b, status: pairStatus(pairByKey, frogs[a], frogs[b]), mark: { x: 0, y: 0 } });
      }
    }
    placeMarks(list, positions, boardSize);
    return list;
  }, [frogs, pairByKey, positions, boardSize]);

  // Each frog's controls, on the side of its bubble facing away from the
  // board's centre (a lone frog, sitting at the centre, faces up).
  const controls = useMemo(() => {
    const r = boardSize.mobile ? GAPS.mobile : GAPS.desktop;
    return positions.map(p => {
      const dx = ((p.x - 50) / 100) * boardSize.width, dy = ((p.y - 50) / 100) * boardSize.height;
      const outward = dx === 0 && dy === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
      return frogControls(outward, r.frogX, r.frogY);
    });
  }, [positions, boardSize]);

  // Hovering a frog lights its lines; hovering a line lights just that one.
  const focusing = activeFrog !== null || activeEdge !== null;
  const isLit = (e: Edge) => e.a === activeFrog || e.b === activeFrog || e.key === activeEdge;
  const focusClass = (e: Edge) => (focusing ? (isLit(e) ? ' is-lit' : ' is-dim') : '');

  // ── Verify mode ───────────────────────────────────────────────────────────
  // Only pairs not yet Verified can be picked. A picked pair shows as clear.

  const pickKey = (fa: PlannedFrog, fb: PlannedFrog) => (fa.id && fb.id ? pairKey(fa.id, fb.id) : null);
  const pickable = (fa: PlannedFrog, fb: PlannedFrog, status: LineStatus) =>
    verifyMode && status === 'unknown' && !!pickKey(fa, fb);
  const isPicked = (fa: PlannedFrog, fb: PlannedFrog, status: LineStatus) =>
    pickable(fa, fb, status) && picked.has(pickKey(fa, fb)!);
  const shownStatus = (fa: PlannedFrog, fb: PlannedFrog, status: LineStatus): LineStatus =>
    isPicked(fa, fb, status) ? 'clear' : status;
  const verifyClass = (fa: PlannedFrog, fb: PlannedFrog, status: LineStatus) =>
    !verifyMode ? '' : isPicked(fa, fb, status) ? ' is-picked' : pickable(fa, fb, status) ? '' : ' is-locked';

  function togglePick(fa: PlannedFrog, fb: PlannedFrog, status: LineStatus) {
    const key = pickKey(fa, fb);
    if (!key || !pickable(fa, fb, status)) return;
    setPicked(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const edgeClass = (e: Edge) => {
    const fa = frogs[e.a], fb = frogs[e.b];
    return `is-${shownStatus(fa, fb, e.status)}${verifyClass(fa, fb, e.status)}${focusClass(e)}`;
  };

  // Every picked pair on the board, self-pairs included, for the confirmation.
  const pickedItems = useMemo<VerifyPairItem[]>(() => {
    if (!verifyMode) return [];
    const list: VerifyPairItem[] = [];
    for (let a = 0; a < frogs.length; a++) {
      for (let b = a; b < frogs.length; b++) {
        const fa = frogs[a], fb = frogs[b];
        const key = fa.id && fb.id ? pairKey(fa.id, fb.id) : null;
        if (!key || !picked.has(key) || pairStatus(pairByKey, fa, fb) !== 'unknown') continue;
        list.push({ key, frogA: fa.id!, frogB: fb.id!, label: `${fa.name} × ${fb.name}` });
      }
    }
    return list;
  }, [verifyMode, frogs, picked, pairByKey]);

  function startVerify() {
    setEditor(null);
    setPicked(new Set());
    setConfirming(false);
    setVerifyPlan(frogsParam);
  }

  const finishVerify = useCallback(() => {
    setVerifyPlan(null);
    setPicked(new Set());
    setConfirming(false);
  }, []);
  const unpick = useCallback((key: string) => setPicked(prev => {
    const next = new Set(prev);
    next.delete(key);
    return next;
  }), []);
  const refreshPairs = useCallback(() => queryClient.invalidateQueries({ queryKey: ['pairs'] }), [queryClient]);

  const pairHref = (fa: PlannedFrog, fb: PlannedFrog) =>
    lookup ? `/breeding${frogSearch('pair', encodeFrogParam([fa.sel, fb.sel], lookup))}` : '/breeding';

  // ── Editing ───────────────────────────────────────────────────────────────

  const editName = editor && isComplete(editor.sel) ? frogName(editor.sel) : null;
  const duplicate = !!editName && frogs.some((f, i) => i !== editor?.index && f.name === editName);
  const canSave = !!editName && !duplicate;

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


  return (
    <div>
      <h1>Mutation Planner</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        {verifyMode ? (
          <>
            Verify mode: select each unverified line, or a frog's self-breeding mark, whose pair produces
            no mutations, then Confirm. Pairs that produce a mutation are submitted as a combination instead.
          </>
        ) : (
          <>
            Add up to {MAX_FROGS} frogs to see which frog combinations have verified breeding results.
            Select a line to open that pair in Breeding Pairs, or a frog name to open its Frog page.
            Add frogs at the bottom, edit or remove frogs from their bubble.
          </>
        )}
      </p>

      {!lookup ? (
        <p className="search-hint">Loading frog data…</p>
      ) : (
        <>
          <div className="planner-header">
            <ul className="planner-legend">
              {(['clear', 'mutation', 'unknown'] as const).map(s => (
                <li key={s}>
                  <span className={`planner-mark is-${s}`} aria-hidden="true"><StatusMark status={s} /></span>
                  {STATUS_TEXT[s]}
                </li>
              ))}
            </ul>
            {isMod && (
              <div className="planner-verify-actions">
                {verifyMode ? (
                  <>
                    <button type="button" className="csv-btn" onClick={() => setConfirming(true)} disabled={pickedItems.length === 0}>
                      Confirm{pickedItems.length > 0 && ` (${pickedItems.length})`}
                    </button>
                    <button type="button" className="csv-btn" onClick={finishVerify}>Cancel</button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="csv-btn"
                    onClick={startVerify}
                    disabled={!pairs || frogs.length === 0}
                    title="Mark unverified pairs as producing no mutations"
                  >
                    Verify
                  </button>
                )}
              </div>
            )}
          </div>

          <div
            className={`planner-canvas${verifyMode ? ' is-verifying' : ''}`}
            ref={setBoard}
            style={{ height: boardSize.mobile ? undefined : boardSize.height }}
          >
            <div className="planner-toolbar">
              {verifyMode ? null : editor ? (
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
              {!verifyMode && <span className="planner-count">{frogs.length} / {MAX_FROGS}</span>}
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
                  onClick={() => (verifyMode
                    ? togglePick(frogs[e.a], frogs[e.b], e.status)
                    : navigate(pairHref(frogs[e.a], frogs[e.b])))}
                >
                  <line className="planner-line-hit" vectorEffect="non-scaling-stroke"
                    x1={positions[e.a].x} y1={positions[e.a].y} x2={positions[e.b].x} y2={positions[e.b].y} />
                  <line className="planner-line" vectorEffect="non-scaling-stroke"
                    x1={positions[e.a].x} y1={positions[e.a].y} x2={positions[e.b].x} y2={positions[e.b].y} />
                </g>
              ))}
            </svg>

            {edges.map(e => {
              const fa = frogs[e.a], fb = frogs[e.b];
              const hover = {
                onMouseEnter: () => setActiveEdge(e.key),
                onMouseLeave: () => setActiveEdge(null),
                onFocus:      () => setActiveEdge(e.key),
                onBlur:       () => setActiveEdge(null),
              };
              const className = `planner-mark ${edgeClass(e)}`;
              const style = { left: `${e.mark.x}%`, top: `${e.mark.y}%` };
              return verifyMode ? (
                <VerifyMark key={e.key} className={className} style={style} {...hover}
                  status={shownStatus(fa, fb, e.status)} pickable={pickable(fa, fb, e.status)} picked={isPicked(fa, fb, e.status)}
                  label={`${fa.name} × ${fb.name}`} onToggle={() => togglePick(fa, fb, e.status)} />
              ) : (
                <Link key={e.key} to={pairHref(fa, fb)} className={className} style={style} {...hover}
                  aria-label={`${fa.name} × ${fb.name}: ${STATUS_TEXT[e.status]}. Open in Breeding Pairs.`}
                  title={`${STATUS_TEXT[e.status]}. Open in Breeding Pairs.`}
                >
                  <StatusMark status={e.status} />
                </Link>
              );
            })}

            {frogs.map((f, i) => {
              const self = pairStatus(pairByKey, f, f);
              return (
              <div
                key={f.name}
                className={`planner-frog${activeFrog === i ? ' is-active' : ''}${editor?.index === i ? ' is-editing' : ''}`}
                style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
                onMouseEnter={() => setActiveFrog(i)}
                onMouseLeave={() => setActiveFrog(null)}
                onFocus={() => setActiveFrog(i)}
                onBlur={() => setActiveFrog(null)}
              >
                {!verifyMode && (
                  <button type="button" className="planner-frog-btn" style={at(controls[i].edit)} onClick={() => openEditor(i)}
                    aria-label={`Edit ${f.name}`} title="Edit">
                    <IconPencil />
                  </button>
                )}
                {verifyMode ? (
                  <VerifyMark
                    className={`planner-mark planner-self is-${shownStatus(f, f, self)}${verifyClass(f, f, self)}`}
                    style={at(controls[i].self)}
                    status={shownStatus(f, f, self)} pickable={pickable(f, f, self)} picked={isPicked(f, f, self)}
                    label={`${f.name} with itself`} onToggle={() => togglePick(f, f, self)}
                  />
                ) : (
                  <Link
                    to={pairHref(f, f)}
                    className={`planner-mark planner-self is-${self}`}
                    style={at(controls[i].self)}
                    aria-label={`${f.name} with itself: ${STATUS_TEXT[self]}. Open in Breeding Pairs.`}
                    title={`Self-breeding: ${STATUS_TEXT[self]}. Open in Breeding Pairs.`}
                  >
                    <StatusMark status={self} />
                  </Link>
                )}
                {!verifyMode && (
                  <button type="button" className="planner-frog-btn" style={at(controls[i].remove)} onClick={() => removeFrog(i)}
                    aria-label={`Remove ${f.name}`} title="Remove">
                    <IconMinus />
                  </button>
                )}
                {f.id && !verifyMode ? (
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
              );
            })}
          </div>

          {confirming && verifyMode && idToken && (
            <VerifyPairsDialog
              items={pickedItems}
              idToken={idToken}
              onClose={() => setConfirming(false)}
              onVerified={unpick}
              onSent={refreshPairs}
              onEmpty={finishVerify}
            />
          )}

          {editor && !verifyMode && (
            <div className="planner-editor">
              <FrogInputs
                key={editor.key}
                title={editor.index === null ? 'Add a Frog' : `Edit ${frogs[editor.index]?.name ?? 'Frog'}`}
                sel={editor.sel}
                onChange={sel => setEditor(prev => (prev ? { ...prev, sel } : prev))}
                options={frogOptions}
              >
                {duplicate && (
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
