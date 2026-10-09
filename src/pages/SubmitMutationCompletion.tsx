import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { get, set } from 'idb-keyval';
import { fetchMutations, fetchFrogByFrogId, type Mutation } from '../api/teable';
import {
  submitMutationCompletions, fetchPendingMutationCompletionIds, type MutationCompletionSubmission,
} from '../api/submit';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import FrogTextInput from '../components/FrogTextInput';
import { useFrogOptions } from '../hooks/useFrogOptions';
import { useFrogEntry } from '../hooks/useFrogEntry';
import {
  decodeFrogParam, frogId, frogName, isComplete, EMPTY_FROG, type CompleteFrogSel, type FrogIdLookup,
} from '../utils/frogIds';

// ── Interfaces ────────────────────────────────────────────────────────────────

type Variant = 'Glass' | 'Chroma';
const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// The worker's default per-file upload limit (UPLOAD_MAX_BYTES).
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

// One recorded mutation that's missing its Lost Frog and/or its pair's
// screenshot, with its frogs decoded from their Frog_ID titles.
interface Row {
  id: string;
  variant: Variant;
  frog1: CompleteFrogSel;
  frog2: CompleteFrogSel;
  result: CompleteFrogSel;
  label: string;                  // "A × B → Result", for lists and messages
  candidates: CompleteFrogSel[];  // the lost frogs the parents allow
  knownLost: CompleteFrogSel | null;
}

// What the user has entered for one mutation: the lost frog's Frog_ID and the
// screenshot. The label rides along so the review can still describe an entry
// whose mutation has since been completed.
interface Draft { label: string; lost?: string; shot?: Blob }
type Drafts = Record<string, Draft>;

// Drafts live in IndexedDB rather than localStorage so the screenshots survive
// an accidental navigation along with the rest of the entry.
const DRAFT_KEY = 'mutationCompletionDraft';

// ── Helpers ───────────────────────────────────────────────────────────────────

function decode(code: string | null, lk: FrogIdLookup): CompleteFrogSel | null {
  return decodeFrogParam(code, lk)[0] ?? null;
}

// The mutation swaps one color — base for Glass, secondary for Chroma — so the
// lost frog is the result with that color taken from one of the parents.
function lostCandidates(variant: Variant, f1: CompleteFrogSel, f2: CompleteFrogSel, result: CompleteFrogSel): CompleteFrogSel[] {
  const key = variant === 'Glass' ? 'base' : 'sec';
  const colors = [f1[key], f2[key]].filter((c, i, all) => c.label !== variant && all.findIndex(o => o.id === c.id) === i);
  return colors.map(c => ({ ...result, [key]: c }));
}

const hasInput = (d: Draft | undefined) => !!(d?.lost || d?.shot);

// The lost frog an entry stands for: one already recorded, the one entered, or
// the only one the parents allow.
function effectiveLost(row: Row, draft: Draft | undefined, lk: FrogIdLookup): CompleteFrogSel | null {
  if (row.knownLost) return row.knownLost;
  if (draft?.lost) return decode(draft.lost, lk);
  return row.candidates.length === 1 ? row.candidates[0] : null;
}

const sameFrog = (a: CompleteFrogSel, b: CompleteFrogSel) =>
  a.base.id === b.base.id && a.sec.id === b.sec.id && a.breed.id === b.breed.id;

type Evaluated =
  | { ok: true;  id: string; label: string; lost: CompleteFrogSel; shot: Blob; row: Row }
  | { ok: false; id: string; label: string; reason: string };

function evaluate(id: string, draft: Draft, row: Row | undefined, lk: FrogIdLookup): Evaluated {
  const label = row?.label ?? draft.label;
  if (!row) {
    return { ok: false, id, label, reason: `${label} cannot be submitted since it's already complete or pending review.` };
  }
  const lost = effectiveLost(row, draft, lk);
  const problems: string[] = [];
  if (!lost) problems.push('no lost frog was chosen');
  else if (!row.candidates.some(c => sameFrog(c, lost))) problems.push(`${frogName(lost)} can't be its lost frog`);
  if (!draft.shot) problems.push('no screenshot was added');
  if (problems.length || !lost || !draft.shot) {
    return { ok: false, id, label, reason: `${label} cannot be submitted since ${problems.join(', and ')}.` };
  }
  return { ok: true, id, label, lost, shot: draft.shot, row };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubmitMutationCompletion() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const frogOptions = useFrogOptions();
  const { breedOpts, baseOpts, secOpts, lookup } = frogOptions;

  const [variant, setVariant] = useState<Variant | null>(null);
  const [breed, setBreed] = useState<ComboOption | null>(null);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; refused?: string[] } | null>(null);

  useEffect(() => {
    get(DRAFT_KEY)
      .then(saved => setDrafts((saved as Drafts | undefined) ?? {}))
      .catch(() => setDrafts({}));
  }, []);
  useEffect(() => {
    if (drafts) set(DRAFT_KEY, drafts).catch(() => { /* storage unavailable */ });
  }, [drafts]);

  const { data: mutations, isLoading, error } = useQuery({ queryKey: ['mutations'], queryFn: fetchMutations });
  const { data: pendingIds } = useQuery({
    queryKey: ['mutation-completions-pending'],
    queryFn: fetchPendingMutationCompletionIds,
  });

  // Verified mutations still missing a lost frog or a screenshot, with nothing
  // pending review. Ordered like the frog pickers (the settings' breed and color
  // sorts) by the result frog.
  const rows = useMemo<Row[]>(() => {
    if (!lookup || !mutations) return [];
    const pending = new Set(pendingIds ?? []);
    const rankOf = (opts: ComboOption[]) => new Map(opts.map((o, i) => [o.id, i]));
    const breedRank = rankOf(breedOpts), baseRank = rankOf(baseOpts), secRank = rankOf(secOpts);
    const incomplete = (m: Mutation) => m.verified && (!m.lostId || m.screenshotCount === 0) && !pending.has(m.id);
    return mutations.filter(incomplete).flatMap(m => {
      const frog1 = decode(m.frogATitle, lookup), frog2 = decode(m.frogBTitle, lookup);
      const result = decode(m.resultTitle, lookup);
      if (!frog1 || !frog2 || !result) return [];
      return [{
        id: m.id,
        variant: m.type,
        frog1, frog2, result,
        label: `${frogName(frog1)} × ${frogName(frog2)} → ${frogName(result)}`,
        candidates: lostCandidates(m.type, frog1, frog2, result),
        knownLost: decode(m.lostTitle, lookup),
      }];
    }).sort((a, b) =>
      (breedRank.get(a.result.breed.id) ?? 0) - (breedRank.get(b.result.breed.id) ?? 0) ||
      (baseRank.get(a.result.base.id) ?? 0) - (baseRank.get(b.result.base.id) ?? 0) ||
      (secRank.get(a.result.sec.id) ?? 0) - (secRank.get(b.result.sec.id) ?? 0) ||
      a.label.localeCompare(b.label));
  }, [mutations, pendingIds, lookup, breedOpts, baseOpts, secOpts]);
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);

  const ofVariant = useMemo(() => (variant ? rows.filter(r => r.variant === variant) : rows), [rows, variant]);
  const visible = useMemo(
    () => (breed ? ofVariant.filter(r => r.result.breed.id === breed.id) : ofVariant),
    [ofVariant, breed],
  );
  const breedFilterOpts = useMemo(() => {
    const ids = new Set(ofVariant.map(r => r.result.breed.id));
    return breedOpts.filter(o => ids.has(o.id));
  }, [breedOpts, ofVariant]);

  // ── Entries ────────────────────────────────────────────────────────────────
  function updateDraft(row: Row, change: Partial<Draft>) {
    setDrafts(d => {
      const next: Draft = { ...d?.[row.id], label: row.label, ...change };
      const out = { ...d };
      if (hasInput(next)) out[row.id] = next; else delete out[row.id];
      return out;
    });
  }

  const enteredIds = useMemo(() => Object.keys(drafts ?? {}).filter(id => hasInput(drafts![id])), [drafts]);

  const evaluated = useMemo(() => {
    if (!lookup || !drafts) return [];
    const order = new Map(rows.map((r, i) => [r.id, i]));
    const pos = (e: Evaluated) => order.get(e.id) ?? Number.MAX_SAFE_INTEGER;
    return enteredIds
      .map(id => evaluate(id, drafts[id], byId.get(id), lookup))
      .sort((a, b) => pos(a) - pos(b) || a.label.localeCompare(b.label));
  }, [enteredIds, drafts, byId, rows, lookup]);
  const ready    = evaluated.filter((e): e is Extract<Evaluated, { ok: true }>  => e.ok);
  const excluded = evaluated.filter((e): e is Extract<Evaluated, { ok: false }> => !e.ok);

  function clearDrafts() {
    if (window.confirm(`Clear what you've entered for ${enteredIds.length} mutation${enteredIds.length === 1 ? '' : 's'}?`)) {
      setDrafts({});
    }
  }

  async function handleSubmit() {
    if (!ready.length || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      // The lost frogs are entered by their parts; the worker links records.
      const refused: string[] = [];
      const items: { entry: typeof ready[number]; payload: MutationCompletionSubmission; screenshot: Blob }[] = [];
      for (const r of ready) {
        const code = frogId(r.lost, lookup!);
        const record = code
          ? await queryClient.fetchQuery({
              queryKey: ['frog-by-code', code],
              queryFn: () => fetchFrogByFrogId(code),
              staleTime: Infinity,
            })
          : null;
        if (!record) { refused.push(`${r.label}: ${frogName(r.lost)} isn't a known frog.`); continue; }
        items.push({
          entry: r,
          screenshot: r.shot,
          payload: {
            mutationId: r.id,
            variant: r.row.variant,
            frog1Name: frogName(r.row.frog1),
            frog2Name: frogName(r.row.frog2),
            resultFrogName: frogName(r.row.result),
            lostFrogId: record.id,
            lostFrogName: frogName(r.lost),
          },
        });
      }

      const { results, error: requestError } = items.length
        ? await submitMutationCompletions(items, auth.user?.id_token)
        : { results: [] };
      const acceptedIds = new Set<string>();
      for (const res of results) {
        const item = items[res.index];
        if (!item) continue;
        if (res.ok) acceptedIds.add(item.entry.id);
        else refused.push(res.error.includes(item.payload.frog1Name) ? res.error : `${item.entry.label}: ${res.error}`);
      }
      if (requestError) refused.push(requestError);

      // Accepted entries are done; refused ones stay in the draft to revisit.
      setDrafts(d => {
        const out = { ...d };
        for (const id of acceptedIds) delete out[id];
        return out;
      });
      void queryClient.invalidateQueries({ queryKey: ['mutation-completions-pending'] });

      const n = acceptedIds.size;
      setResult({
        ok: n > 0,
        message: n > 0
          ? `Thanks! ${n} mutation${n === 1 ? ' was' : 's were'} submitted and ${n === 1 ? 'is' : 'are'} pending review.`
          : 'None of the mutations could be submitted.',
        refused,
      });
      setReviewing(false);
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const resultBlock = result && (
    <>
      <p className={result.ok ? 'submit-success' : 'search-error'}>{result.message}</p>
      {!!result.refused?.length && (
        <div className="stats-excluded">
          <p className="stats-excluded-title">These weren't accepted and are still in your entries:</p>
          <ul>{result.refused.map(r => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </>
  );

  if (reviewing) {
    return (
      <div>
        <h1>Review Mutation Details</h1>
        <p className="search-hint" style={{ marginTop: 0 }}>
          Check the lost frogs and screenshots below before submitting. Each mutation is reviewed individually
          before it's added to the database.
        </p>

        {excluded.length > 0 && (
          <div className="stats-excluded">
            <p className="stats-excluded-title">
              {excluded.length} mutation{excluded.length === 1 ? '' : 's'} won't be submitted:
            </p>
            <ul>{excluded.map(e => <li key={e.id}>{e.reason}</li>)}</ul>
          </div>
        )}

        <h2>Ready to submit <span className="breed-weekly-count">({ready.length})</span></h2>
        {ready.length === 0 ? (
          <p className="search-hint">None of your entries have both a lost frog and a screenshot yet.</p>
        ) : (
          <div className="completion-list">
            {ready.map(r => (
              <div key={r.id} className="completion-card">
                <PairHeading row={r.row} />
                <p className="completion-lost">
                  Lost frog: <strong className={r.row.knownLost ? 'stat-existing' : undefined}>{frogName(r.lost)}</strong>
                </p>
                <ShotPreview blob={r.shot} className="completion-review-shot" />
              </div>
            ))}
          </div>
        )}

        <div className="submit-actions stats-actions">
          <button className="csv-btn" type="button" disabled={submitting} onClick={() => setReviewing(false)}>
            ← Back to editing
          </button>
          <button className="submit-btn" type="button" disabled={!ready.length || submitting} onClick={handleSubmit}>
            {submitting ? 'Submitting…' : `Submit ${ready.length} for review`}
          </button>
        </div>

        {resultBlock}
      </div>
    );
  }

  const loading = isLoading || !lookup || !drafts;

  return (
    <div>
      <h1>Mutation Detail Submissions</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        These verified mutations are missing the frog they replaced, a screenshot, or both. For each one you
        can fill in, pick the lost frog and add a screenshot of the breeding result — both are needed for a
        mutation to be submitted. Your entries are kept as you change filters. When you're done, review and
        submit them; all submissions are reviewed manually before being added to the database.
        If you would like credit for your submissions, make sure you're logged in under the site settings.
      </p>

      {resultBlock}

      <div className="filter-grid">
        <div className="combobox-field">
          <span className="combobox-label">Mutation Type</span>
          <div className="settings-row type-toggle">
            {([null, 'Glass', 'Chroma'] as const).map(v => (
              <button
                key={v ?? 'all'}
                type="button"
                className={`settings-theme-opt${variant === v ? ' active' : ''}`}
                onClick={() => { setVariant(v); setBreed(null); }}
              >
                {v ?? 'All'}
              </button>
            ))}
          </div>
        </div>
        <ComboBox
          key={`breed-${variant ?? 'all'}`}
          label="Result Breed"
          options={breedFilterOpts}
          presorted
          initialSelection={breed}
          onSelect={setBreed}
        />
      </div>

      {error && <p className="search-error">Error: {String(error)}</p>}

      {loading ? (
        <p className="search-hint">Loading mutations…</p>
      ) : rows.length === 0 ? (
        <p className="search-hint">Every verified mutation is complete or pending review. 🎉</p>
      ) : (
        <>
          <div className="completion-list">
            {visible.map(row => (
              <CompletionCard
                key={row.id}
                row={row}
                draft={drafts[row.id]}
                lookup={lookup}
                lostOpts={row.variant === 'Glass' ? baseOpts : secOpts}
                onChange={change => updateDraft(row, change)}
              />
            ))}
          </div>

          <div className="table-pagination">
            <span>
              {enteredIds.length} mutation{enteredIds.length === 1 ? '' : 's'} with entries
              {enteredIds.length > 0 && (
                <> · <button className="link-btn" type="button" onClick={clearDrafts}>Clear entries</button></>
              )}
            </span>
            <span className="pagination-count">
              {visible.length} mutation{visible.length === 1 ? '' : 's'} missing details
            </span>
          </div>
        </>
      )}

      <div className="submit-actions">
        <button
          className="submit-btn"
          type="button"
          disabled={enteredIds.length === 0}
          onClick={() => { setResult(null); setReviewing(true); }}
        >
          {enteredIds.length ? `Review ${enteredIds.length} →` : 'Review →'}
        </button>
      </div>
    </div>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function PairHeading({ row }: { row: Row }) {
  return (
    <div className="completion-heading">
      <span className="mutation-tag">{row.variant}</span>
      <span className="completion-parents">
        <strong>{frogName(row.frog1)}</strong> × <strong>{frogName(row.frog2)}</strong>
      </span>
      <span className="completion-result">→ {frogName(row.result)}</span>
    </div>
  );
}

// One mutation's entry: its pair and result for context, then the lost frog
// (entered per the Frog Entry setting) and the screenshot.
function CompletionCard({
  row, draft, lookup, lostOpts, onChange,
}: {
  row: Row;
  draft: Draft | undefined;
  lookup: FrogIdLookup;
  lostOpts: ComboOption[];
  onChange: (change: Partial<Draft>) => void;
}) {
  const { entry } = useFrogEntry();
  const lost = effectiveLost(row, draft, lookup);
  const lostValid = !lost || row.candidates.some(c => sameFrog(c, lost));
  const colorKey = row.variant === 'Glass' ? 'base' : 'sec';
  // The lost color can only be one of the parents', in the settings' order.
  const colorOpts = useMemo(
    () => lostOpts.filter(o => row.candidates.some(c => c[colorKey].id === o.id)),
    [lostOpts, row.candidates, colorKey],
  );

  function setLost(sel: CompleteFrogSel | null) {
    onChange({ lost: sel ? frogId(sel, lookup) ?? undefined : undefined });
  }

  return (
    <div className={`completion-card${hasInput(draft) ? ' is-entered' : ''}`}>
      <PairHeading row={row} />

      <div className="completion-fields">
        <div className="completion-lost-field">
          {row.knownLost ? (
            <div className="combobox-field">
              <span className="combobox-label">Lost Frog</span>
              <span className="stat-existing" title="Already recorded">{frogName(row.knownLost)}</span>
            </div>
          ) : entry === 'text' ? (
            <FrogTextInput
              label="Lost Frog"
              sel={lost ?? EMPTY_FROG}
              lookup={lookup}
              onChange={s => setLost(isComplete(s) ? s : null)}
            />
          ) : (
            <ComboBox
              label={`Lost ${row.variant === 'Glass' ? 'Base' : 'Secondary'} Color`}
              options={colorOpts}
              presorted
              initialSelection={lost?.[colorKey] ?? null}
              placeholder="Choose the color it replaced…"
              onSelect={o => setLost(o ? { ...row.result, [colorKey]: o } : null)}
            />
          )}
          {!row.knownLost && lost && (
            lostValid
              ? entry !== 'text' && <p className="search-hint completion-hint">→ {frogName(lost)}</p>
              : <p className="search-error completion-hint">
                  The lost frog must be {frogName(row.result)} with its {row.variant === 'Glass' ? 'base' : 'secondary'} color
                  from a parent: {row.candidates.map(frogName).join(' or ')}.
                </p>
          )}
        </div>

        <ShotPicker blob={draft?.shot} onPick={shot => onChange({ shot })} />
      </div>
    </div>
  );
}

// A dashed drop box that becomes a preview once a screenshot is set.
function ShotPicker({ blob, onPick }: { blob: Blob | undefined; onPick: (b: Blob | undefined) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Nothing (a cancelled picker) keeps the current one.
  function accept(file: File | null) {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    if (!SCREENSHOT_TYPES.includes(file.type)) { setFileError('Only PNG, JPEG, WebP, or GIF images are allowed.'); return; }
    if (file.size > MAX_SCREENSHOT_BYTES) { setFileError('That screenshot is too large (5 MB max).'); return; }
    setFileError(null);
    onPick(file);
  }

  return (
    <div className="completion-shot">
      <label
        className={`screenshot-drop${blob ? ' has-image' : ''}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); accept(e.dataTransfer.files[0] ?? null); }}
      >
        <input
          ref={fileRef}
          className="screenshot-input"
          type="file"
          accept={SCREENSHOT_TYPES.join(',')}
          onChange={e => accept(e.target.files?.[0] ?? null)}
        />
        {blob ? <ShotPreview blob={blob} /> : <span>Click or drop a screenshot here</span>}
      </label>
      {blob && (
        <button className="link-btn" type="button" onClick={() => onPick(undefined)}>Remove screenshot</button>
      )}
      {fileError && <p className="search-error completion-hint">{fileError}</p>}
    </div>
  );
}

function ShotPreview({ blob, className }: { blob: Blob; className?: string }) {
  // The object URL is made and released by the effect, so it never outlives it.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    if (imgRef.current) imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={imgRef} alt="Selected screenshot" className={className} />;
}
