import { useState, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFrogPairs } from '../api/teable';
import FrogInputs from '../components/FrogInputs';
import VerifyPairsDialog, { type VerifyPairItem } from '../components/VerifyPairsDialog';
import { IconPencil, StatusMark, VerifyMark } from '../components/PairStatus';
import { useModToken } from '../hooks/useModToken';
import { usePairByKey } from '../hooks/usePairByKey';
import { useFrogOptions } from '../hooks/useFrogOptions';
import {
  EMPTY_FROG, decodeFrogParam, encodeFrogParam, frogId, frogName, frogPath, frogSearch, isComplete,
  type CompleteFrogSel, type FrogSel,
} from '../utils/frogIds';
import { STATUS_TEXT, pairKey, pairStatusById, type LineStatus } from '../utils/pairStatus';

// One frog at the top, paired with each frog in a list below it, every pair's
// status on its branch off the trunk. Like the Mutation Planner, anyone can
// build a tree to look at; mods can switch to Verify mode and record unverified
// pairs as producing no mutations. Built for long lists, where the planner's
// 8-frog board runs out.

interface TreeFrog {
  sel:  CompleteFrogSel;
  name: string;
  id:   string | null; // Frog_ID, e.g. "18:11:0"
}

// What the frog input at the top is doing: setting the top frog or adding to
// the list (`target` null, chosen by whether there's a top frog), or editing
// the top frog or a row. `key` bumps to remount the inputs with `sel`.
interface Editor {
  target: 'root' | number | null;
  sel:    FrogSel;
  key:    number;
}

// Moves a frog into the list (the top frog's control).
function IconToList() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="15"/>
      <polyline points="6 9 12 15 18 9"/>
      <line x1="5" y1="20" x2="19" y2="20"/>
    </svg>
  );
}

// Moves a frog to the top (each row's control).
function IconToTop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="4" x2="19" y2="4"/>
      <line x1="12" y1="9" x2="12" y2="21"/>
      <polyline points="6 15 12 9 18 15"/>
    </svg>
  );
}

// The tree lives in the URL as Frog_IDs (?frog=18:11:0&with=18:4:0_18:5:0) so
// it can be shared as a link, along with any habitat dividers (&gaps=4_8, each
// the index of the row a divider sits above). Written by hand, as frogSearch
// does, so the colons aren't escaped.
function treeSearch(rootParam: string, listParam: string, gaps: number[]): string {
  const parts = [
    rootParam && `frog=${rootParam}`,
    listParam && `with=${listParam}`,
    gaps.length > 0 && `gaps=${[...gaps].sort((a, b) => a - b).join('_')}`,
  ].filter(Boolean);
  return parts.length ? `?${parts.join('&')}` : '';
}

// Drops repeats (by name), keeping the first.
function uniqueFrogs(list: CompleteFrogSel[]): CompleteFrogSel[] {
  const seen = new Set<string>();
  return list.filter(sel => {
    const name = frogName(sel);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export default function PairTree() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const frogOptions = useFrogOptions();
  const { lookup } = frogOptions;
  const { data: pairs } = useQuery({ queryKey: ['pairs'], queryFn: fetchFrogPairs });
  const queryClient = useQueryClient();
  const { idToken, isMod } = useModToken();
  const pairByKey = usePairByKey(pairs);
  const [editor, setEditor] = useState<Editor | null>(null);

  const toTreeFrog = useCallback((sel: CompleteFrogSel): TreeFrog => (
    { sel, name: frogName(sel), id: lookup ? frogId(sel, lookup) : null }
  ), [lookup]);

  const root = useMemo<TreeFrog | null>(() => {
    if (!lookup) return null;
    const [sel] = decodeFrogParam(searchParams.get('frog'), lookup);
    return sel ? toTreeFrog(sel) : null;
  }, [lookup, searchParams, toTreeFrog]);

  // A frog appears once in the whole tree: the top frog is never also in the
  // list (its self pair is the mark beside its name).
  const list = useMemo<TreeFrog[]>(() => {
    if (!lookup) return [];
    return uniqueFrogs(decodeFrogParam(searchParams.get('with'), lookup))
      .map(toTreeFrog)
      .filter(f => f.name !== root?.name);
  }, [lookup, searchParams, toTreeFrog, root]);

  // Habitat dividers: purely visual marks on the trunk, between two rows, that
  // group the list into the habitats being bred in.
  const gaps = useMemo(() => new Set(
    (searchParams.get('gaps') ?? '').split('_').map(Number)
      .filter(g => Number.isInteger(g) && g >= 1 && g < list.length),
  ), [searchParams, list.length]);

  function saveTree(nextRoot: CompleteFrogSel | null, nextList: CompleteFrogSel[], nextGaps: Iterable<number> = gaps) {
    if (!lookup) return;
    navigate({
      search: treeSearch(
        nextRoot ? encodeFrogParam([nextRoot], lookup) : '',
        encodeFrogParam(uniqueFrogs(nextList).filter(sel => !nextRoot || frogName(sel) !== frogName(nextRoot)), lookup),
        [...nextGaps],
      ),
    }, { replace: true });
  }

  // Each frog's pair with the top frog; the top frog itself gives its self pair.
  const status = (f: TreeFrog): LineStatus => pairStatusById(pairByKey, root?.id ?? null, f.id);

  // ── Verify mode ───────────────────────────────────────────────────────────
  // Tied to the tree it was started on, as on the Mutation Planner: any change
  // to the URL leaves it. The tree can't be edited while verifying.
  const [verifyPlan, setVerifyPlan] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // Keyed on the frogs only, so toggling a divider doesn't leave Verify mode.
  const treeKey = `${searchParams.get('frog') ?? ''}&${searchParams.get('with') ?? ''}`;
  const verifyMode = isMod && verifyPlan === treeKey;

  const pickKey = (f: TreeFrog) => (root?.id && f.id ? pairKey(root.id, f.id) : null);
  const pickable = (f: TreeFrog) => verifyMode && status(f) === 'unknown' && !!pickKey(f);
  const isPicked = (f: TreeFrog) => pickable(f) && picked.has(pickKey(f)!);
  const shownStatus = (f: TreeFrog): LineStatus => (isPicked(f) ? 'clear' : status(f));
  const verifyClass = (f: TreeFrog) =>
    !verifyMode ? '' : isPicked(f) ? ' is-picked' : pickable(f) ? '' : ' is-locked';

  function togglePick(f: TreeFrog) {
    const key = pickKey(f);
    if (!key || !pickable(f)) return;
    setPicked(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const paired = root ? [root, ...list] : list; // every pair in the tree, self pair first
  const pickableKeys = verifyMode ? paired.filter(pickable).map(f => pickKey(f)!) : [];
  const allPicked = pickableKeys.length > 0 && pickableKeys.every(k => picked.has(k));

  const pickedItems = useMemo<VerifyPairItem[]>(() => {
    if (!verifyMode || !root?.id) return [];
    return [root, ...list].flatMap(f => {
      const key = f.id ? pairKey(root.id!, f.id) : null;
      if (!key || !picked.has(key) || pairStatusById(pairByKey, root.id, f.id) !== 'unknown') return [];
      return [{ key, frogA: root.id!, frogB: f.id!, label: `${root.name} × ${f.name}` }];
    });
  }, [verifyMode, root, list, picked, pairByKey]);

  function startVerify() {
    setEditor(null);
    setPicked(new Set());
    setConfirming(false);
    setVerifyPlan(treeKey);
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

  // ── Editing ───────────────────────────────────────────────────────────────

  const draft = editor ?? { target: null, sel: EMPTY_FROG, key: 0 };
  const target = draft.target ?? (root ? 'add' : 'root');
  const inputRef = useRef<HTMLDivElement>(null);

  const draftName = isComplete(draft.sel) ? frogName(draft.sel) : null;
  // No frog may appear twice anywhere in the tree (the frog being edited aside).
  const duplicate = !!draftName && (
    list.some((f, i) => i !== target && f.name === draftName)
    || (target !== 'root' && root?.name === draftName)
  );
  const canSave = !!draftName && !duplicate;

  function openEditor(target: Editor['target'], sel: FrogSel = EMPTY_FROG) {
    setEditor(prev => ({ target, sel, key: (prev?.key ?? 0) + 1 }));
    inputRef.current?.scrollIntoView({ block: 'nearest' });
  }

  // Back to a cleared input for the next frog.
  const resetEditor = () => openEditor(null);

  function saveDraft() {
    const sel = draft.sel;
    if (!canSave || !isComplete(sel)) return;
    const sels = list.map(f => f.sel);
    if (target === 'root') saveTree(sel, sels);
    else if (target === 'add') saveTree(root?.sel ?? null, [...sels, sel]);
    else saveTree(root?.sel ?? null, sels.map((s, i) => (i === target ? sel : s)));
    resetEditor();
  }

  // Dividers below the removed row move up with the rows they sit between.
  function removeRow(index: number) {
    saveTree(root?.sel ?? null, list.filter((_, i) => i !== index).map(f => f.sel),
      [...gaps].map(g => (g > index ? g - 1 : g)));
    resetEditor();
  }

  function toggleGap(index: number) {
    const next = new Set(gaps);
    if (!next.delete(index)) next.add(index);
    saveTree(root?.sel ?? null, list.map(f => f.sel), next);
  }

  // A row's arrow: it becomes the top frog, and the old top frog takes its place.
  function swapToTop(index: number) {
    const sels = list.map(f => f.sel);
    const row = sels[index];
    if (root) sels[index] = root.sel;
    else sels.splice(index, 1);
    saveTree(row, sels);
    resetEditor();
  }

  // The top frog's arrow: it joins the end of the list, leaving the top empty
  // for a new frog.
  function moveRootToList() {
    if (!root) return;
    saveTree(null, [...list.map(f => f.sel), root.sel]);
    resetEditor();
    requestAnimationFrame(() => inputRef.current?.querySelector('input')?.focus());
  }

  const editorTitle = target === 'root' ? (root && draft.target === 'root' ? `Edit ${root.name}` : 'Top Frog')
    : target === 'add' ? 'Add a Frog'
    : `Edit ${list[target]?.name ?? 'Frog'}`;

  const counts = useMemo(() => {
    const c: Record<LineStatus, number> = { clear: 0, mutation: 0, unknown: 0 };
    for (const f of root ? [root, ...list] : list) c[pairStatusById(pairByKey, root?.id ?? null, f.id)]++;
    return c;
  }, [list, root, pairByKey]);

  const pairHref = (f: TreeFrog) =>
    root && lookup ? `/breeding${frogSearch('pair', encodeFrogParam([root.sel, f.sel], lookup))}` : '/breeding';

  return (
    <div>
      <h1>Pair Tree</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        {verifyMode ? (
          <>
            Verify mode: select each unverified branch whose pair with the top frog produces no mutations
            (or the mark beside the top frog for its self-breeding), then Confirm. Pairs that produce a mutation are submitted as a combination instead.
          </>
        ) : (
          <>
            Pair one frog with as many others as you like to see which pairs have verified breeding results.
            The mark beside the top frog is its self-breeding.
            Use <span className="tree-hint-icon"><IconToTop /></span> to move a frog to the top, swapping it with the frog there, or <span className="tree-hint-icon"><IconToList /></span> to
            move the top frog into the list.
          </>
        )}
      </p>

      {!lookup ? (
        <p className="search-hint">Loading frog data…</p>
      ) : (
        <>
          {!verifyMode && (
            <div className="tree-editor" ref={inputRef}>
              <FrogInputs
                key={draft.key}
                title={editorTitle}
                sel={draft.sel}
                onChange={sel => setEditor(prev => ({ ...(prev ?? draft), sel }))}
                options={frogOptions}
              >
                {duplicate && (
                  <p className="planner-duplicate" role="alert">
                    {draftName} is already in the tree. Choose a different frog.
                  </p>
                )}
                <div className="crop-buttons">
                  <button type="button" className="csv-btn" onClick={saveDraft} disabled={!canSave}>
                    {draft.target === null ? (target === 'root' ? 'Set' : 'Add') : 'Save'}
                  </button>
                  {typeof draft.target === 'number' && (
                    <button type="button" className="csv-btn" onClick={() => removeRow(draft.target as number)}>Remove</button>
                  )}
                  {draft.target !== null && (
                    <button type="button" className="csv-btn" onClick={resetEditor}>Cancel</button>
                  )}
                </div>
              </FrogInputs>
            </div>
          )}

          <div className="planner-header">
            <ul className="planner-legend">
              {(['clear', 'mutation', 'unknown'] as const).map(s => (
                <li key={s}>
                  <span className={`planner-mark is-${s}`} aria-hidden="true"><StatusMark status={s} /></span>
                  {STATUS_TEXT[s]}{root && ` (${counts[s]})`}
                </li>
              ))}
            </ul>
            {isMod && (
              <div className="planner-verify-actions">
                {verifyMode ? (
                  <>
                    <button type="button" className="csv-btn" disabled={pickableKeys.length === 0}
                      onClick={() => setPicked(allPicked ? new Set() : new Set(pickableKeys))}>
                      {allPicked ? 'Select none' : 'Select all'}
                    </button>
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
                    disabled={!pairs || !root}
                    title="Mark unverified pairs as producing no mutations"
                  >
                    Verify
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`tree${verifyMode ? ' is-verifying' : ''}`}>
            <div className={`tree-root${draft.target === 'root' && !verifyMode ? ' is-editing' : ''}`}>
              {root ? (
                <>
                  {verifyMode ? (
                    <VerifyMark className={`planner-mark tree-self is-${shownStatus(root)}${verifyClass(root)}`}
                      status={shownStatus(root)} pickable={pickable(root)} picked={isPicked(root)}
                      label={`${root.name} with itself`} onToggle={() => togglePick(root)} />
                  ) : (
                    <Link to={pairHref(root)} className={`planner-mark tree-self is-${status(root)}`}
                      aria-label={`${root.name} with itself: ${STATUS_TEXT[status(root)]}. Open in Breeding Pairs.`}
                      title={`Self-breeding: ${STATUS_TEXT[status(root)]}. Open in Breeding Pairs.`}>
                      <StatusMark status={status(root)} />
                    </Link>
                  )}
                  {root.id && !verifyMode
                    ? <Link to={frogPath(root.id)} className="tree-name" title={`View ${root.name}`}>{root.name}</Link>
                    : <span className="tree-name">{root.name}</span>}
                  {!verifyMode && (
                    <>
                      <button type="button" className="tree-btn" onClick={() => openEditor('root', root.sel)}
                        aria-label={`Edit ${root.name}`} title="Edit">
                        <IconPencil />
                      </button>
                      <button type="button" className="tree-btn tree-move" onClick={moveRootToList}
                        aria-label={`Move ${root.name} into the list`} title="Move into the list">
                        <IconToList />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <span className="tree-name is-empty">Enter a top frog</span>
              )}
            </div>

            {list.length === 0 ? (
              <p className="tree-empty">Add frogs to pair with the top frog.</p>
            ) : (
              <ul className="tree-list">
                {list.map((f, i) => {
                  const shown = shownStatus(f);
                  const label = root ? `${root.name} × ${f.name}` : f.name;
                  const className = `planner-mark is-${shown}${verifyClass(f)}`;
                  return (
                    <li key={f.name} className={`tree-row${draft.target === i && !verifyMode ? ' is-editing' : ''}`}>
                      {i > 0 && (
                        <button type="button" className={`tree-gap${gaps.has(i) ? ' is-on' : ''}`} onClick={() => toggleGap(i)}
                          aria-pressed={gaps.has(i)}
                          aria-label={`Habitat divider between ${list[i - 1].name} and ${f.name}`}
                          title={gaps.has(i) ? 'Remove habitat divider' : 'Add habitat divider'} />
                      )}
                      <span className={`tree-branch is-${shown}${verifyClass(f)}`}>
                        {verifyMode ? (
                          <VerifyMark className={className} status={shown} pickable={pickable(f)} picked={isPicked(f)}
                            label={label} onToggle={() => togglePick(f)} />
                        ) : root ? (
                          <Link to={pairHref(f)} className={className}
                            aria-label={`${label}: ${STATUS_TEXT[shown]}. Open in Breeding Pairs.`}
                            title={`${STATUS_TEXT[shown]}. Open in Breeding Pairs.`}>
                            <StatusMark status={shown} />
                          </Link>
                        ) : (
                          <span className={className} aria-hidden="true"><StatusMark status={shown} /></span>
                        )}
                      </span>
                      {f.id && !verifyMode
                        ? <Link to={frogPath(f.id)} className="tree-name" title={`View ${f.name}`}>{f.name}</Link>
                        : <span className="tree-name">{f.name}</span>}
                      {!verifyMode && (
                        <>
                          <button type="button" className="tree-btn" onClick={() => openEditor(i, f.sel)}
                            aria-label={`Edit ${f.name}`} title="Edit or remove">
                            <IconPencil />
                          </button>
                          <button type="button" className="tree-btn tree-move" onClick={() => swapToTop(i)}
                            aria-label={`Move ${f.name} to the top`}
                            title={root ? `Swap with ${root.name}` : 'Move to the top'}>
                            <IconToTop />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
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
        </>
      )}
    </div>
  );
}
