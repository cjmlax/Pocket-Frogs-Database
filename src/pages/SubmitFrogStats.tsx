import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { fetchTable, fetchIncompleteFrogs, type TeableRecord } from '../api/teable';
import { submitFrogStats, fetchPendingFrogStatIds, type FrogStatsSubmission } from '../api/submit';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { breedOptionsFrom } from '../utils/breeds';
import { colorOptionsFrom } from '../utils/colors';
import { useBreedSort } from '../hooks/useBreedSort';
import { useColorSort } from '../hooks/useColorSort';
import { formatNum } from '../utils/format';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  fullname?:    string;
  Breed?:       unknown;
  Primary?:     unknown;
  Secondary?:   unknown;
  Breed_Level?: unknown;
  Value?:       number;
  Speed?:       number;
  Stamina?:     number;
}
type Frog = TeableRecord<FrogFields>;

type StatKey = 'value' | 'speed' | 'stamina';
const STATS: { key: StatKey; label: string; field: 'Value' | 'Speed' | 'Stamina' }[] = [
  { key: 'value',   label: 'Value',   field: 'Value' },
  { key: 'speed',   label: 'Speed',   field: 'Speed' },
  { key: 'stamina', label: 'Stamina', field: 'Stamina' },
];

// What the user has typed for one frog. The name rides along so the review can
// still describe an entry whose frog has since dropped out of the missing list.
interface Entry { name: string; value?: string; speed?: string; stamina?: string }
type Drafts = Record<string, Entry>;

// Entries are kept in localStorage so an accidental navigation doesn't lose a
// long data-entry session.
const DRAFT_KEY = 'frogStatsDraft';
function loadDrafts(): Drafts {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as Drafts;
  } catch { /* ignore malformed / unavailable storage */ }
  return {};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Link fields arrive as { id, title } (or a one-element array of them).
function link(val: unknown): { id: string; title: string } | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) {
    const f = first as { id: unknown; title?: unknown };
    return { id: String(f.id), title: String(f.title ?? '') };
  }
  return null;
}

function level(f: Frog): number {
  const n = parseInt(link(f.fields.Breed_Level)?.title ?? '', 10);
  return Number.isNaN(n) ? Infinity : n;
}

function existing(f: Frog | undefined, field: 'Value' | 'Speed' | 'Stamina'): number | null {
  const v = f?.fields[field];
  return typeof v === 'number' ? v : null;
}

// Record IDs of the breeds / colors present among a set of frogs.
function idsOf(frogs: Frog[], key: 'Breed' | 'Primary' | 'Secondary'): Set<string> {
  return new Set(frogs.map(f => link(f.fields[key])?.id).filter((id): id is string => !!id));
}

const hasInput = (e: Entry) => STATS.some(s => (e[s.key] ?? '').trim() !== '');

// "Value", "Speed and Stamina", "Value, Speed, and Stamina"
function joinWords(words: string[]): string {
  if (words.length <= 2) return words.join(' and ');
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
}

type Evaluated =
  | { ok: true;  id: string; name: string; payload: FrogStatsSubmission; prefilled: Set<StatKey> }
  | { ok: false; id: string; name: string; reason: string };

// Decides whether one entered frog can be submitted. Stats the database already
// has count as filled; every other stat must be a whole number.
function evaluate(id: string, entry: Entry, frog: Frog | undefined): Evaluated {
  const name = frog?.fields.fullname ?? entry.name;
  if (!frog) {
    return { ok: false, id, name, reason: `${name} cannot be submitted since its stats have already been recorded or are pending review.` };
  }

  const blank: string[] = [];
  const invalid: string[] = [];
  const nums: Partial<Record<StatKey, number>> = {};
  const prefilled = new Set<StatKey>();

  for (const s of STATS) {
    const known = existing(frog, s.field);
    if (known !== null) { nums[s.key] = known; prefilled.add(s.key); continue; }
    const raw = (entry[s.key] ?? '').trim();
    if (!raw) { blank.push(s.label); continue; }
    const cleaned = raw.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(cleaned)) { invalid.push(`${s.label} ("${raw}")`); continue; }
    nums[s.key] = Number(cleaned);
  }

  const problems: string[] = [];
  if (blank.length) {
    problems.push(`the ${joinWords(blank)} value${blank.length > 1 ? 's were' : ' was'} left blank`);
  }
  if (invalid.length) {
    problems.push(`the ${joinWords(invalid)} ${invalid.length > 1 ? "aren't whole numbers" : "isn't a whole number"}`);
  }
  if (problems.length) {
    return { ok: false, id, name, reason: `${name} cannot be submitted since ${problems.join(', and ')}.` };
  }

  return {
    ok: true, id, name, prefilled,
    payload: { frogId: id, frogName: name, value: nums.value!, speed: nums.speed!, stamina: nums.stamina! },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubmitFrogStats() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [breed, setBreed] = useState<ComboOption | null>(null);
  const [base,  setBase]  = useState<ComboOption | null>(null);
  const [sec,   setSec]   = useState<ComboOption | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(loadDrafts);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; refused?: string[] } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch { /* storage unavailable */ }
  }, [drafts]);

  // Lookup tables for the pickers (small, ETag-cached, shared with other pages)
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const { data: incomplete, isLoading, error } = useQuery({
    queryKey: ['incomplete-frogs'],
    queryFn: () => fetchIncompleteFrogs<FrogFields>(),
  });
  const { data: pendingIds } = useQuery({
    queryKey: ['frog-stats-pending'],
    queryFn: fetchPendingFrogStatIds,
  });

  // Rows follow the breed and color sort chosen in the settings menu: breed
  // first, then base color, then secondary. Each rank is the item's position in
  // the same option lists the pickers use, so table and dropdowns always agree.
  const breedSort = useBreedSort();
  const colorSort = useColorSort();
  const compareFrogs = useMemo(() => {
    const rankOf = (opts: ComboOption[]) => new Map(opts.map((o, i) => [o.id, i]));
    const breedRank = rankOf(breedOptionsFrom(breeds, breedSort));
    const baseRank  = rankOf(colorOptionsFrom(bases, 'BaseColors', colorSort));
    const secRank   = rankOf(colorOptionsFrom(secs,  'Sec_Color',  colorSort));
    const rank = (m: Map<string, number>, val: unknown) => m.get(link(val)?.id ?? '') ?? Number.MAX_SAFE_INTEGER;
    return (a: Frog, b: Frog) =>
      rank(breedRank, a.fields.Breed)   - rank(breedRank, b.fields.Breed) ||
      rank(baseRank, a.fields.Primary)  - rank(baseRank, b.fields.Primary) ||
      rank(secRank, a.fields.Secondary) - rank(secRank, b.fields.Secondary) ||
      (a.fields.fullname ?? '').localeCompare(b.fields.fullname ?? '');
  }, [breeds, bases, secs, breedSort, colorSort]);

  // Frogs still open for submission: missing a stat, with nothing pending review.
  const available = useMemo(() => {
    const pending = new Set(pendingIds ?? []);
    return (incomplete ?? []).filter(f => !pending.has(f.id)).sort(compareFrogs);
  }, [incomplete, pendingIds, compareFrogs]);
  const byId = useMemo(() => new Map(available.map(f => [f.id, f])), [available]);
  const pendingCount = (incomplete ?? []).length - available.length;

  // ── Cascading filters: Breed → Base Color → Secondary Color ────────────────
  // Each picker only offers values that still have frogs left at that step.

  const inBreed = useMemo(
    () => (breed ? available.filter(f => link(f.fields.Breed)?.id === breed.id) : available),
    [available, breed],
  );
  const inBase = useMemo(
    () => (base ? inBreed.filter(f => link(f.fields.Primary)?.id === base.id) : inBreed),
    [inBreed, base],
  );
  const visible = useMemo(
    () => (sec ? inBase.filter(f => link(f.fields.Secondary)?.id === sec.id) : inBase),
    [inBase, sec],
  );

  const breedOpts = useMemo<ComboOption[]>(() => {
    const ids = idsOf(available, 'Breed');
    return breedOptionsFrom(breeds?.filter(r => ids.has(r.id)), breedSort);
  }, [breeds, available, breedSort]);
  const baseOpts = useMemo<ComboOption[]>(() => {
    const ids = idsOf(inBreed, 'Primary');
    return colorOptionsFrom(bases?.filter(r => ids.has(r.id)), 'BaseColors', colorSort);
  }, [bases, inBreed, colorSort]);
  const secOpts = useMemo<ComboOption[]>(() => {
    const ids = idsOf(inBase, 'Secondary');
    return colorOptionsFrom(secs?.filter(r => ids.has(r.id)), 'Sec_Color', colorSort);
  }, [secs, inBase, colorSort]);

  // Changing an earlier filter clears the ones after it.
  function pickBreed(o: ComboOption | null) { setBreed(o); setBase(null); setSec(null); }
  function pickBase(o: ComboOption | null)  { setBase(o); setSec(null); }

  // ── Entries ────────────────────────────────────────────────────────────────
  function setStat(frog: Frog, key: StatKey, val: string) {
    setDrafts(d => {
      const next: Entry = { ...d[frog.id], name: frog.fields.fullname ?? frog.id, [key]: val };
      const out = { ...d };
      if (hasInput(next)) out[frog.id] = next; else delete out[frog.id];
      return out;
    });
  }

  const enteredIds = useMemo(() => Object.keys(drafts).filter(id => hasInput(drafts[id])), [drafts]);

  // Same order as the entry table; entries whose frog is no longer listed go last.
  const evaluated = useMemo(() => {
    const order = new Map(available.map((f, i) => [f.id, i]));
    const pos = (e: Evaluated) => order.get(e.id) ?? Number.MAX_SAFE_INTEGER;
    return enteredIds
      .map(id => evaluate(id, drafts[id], byId.get(id)))
      .sort((a, b) => pos(a) - pos(b) || a.name.localeCompare(b.name));
  }, [enteredIds, drafts, byId, available]);
  const ready    = evaluated.filter((e): e is Extract<Evaluated, { ok: true }>  => e.ok);
  const excluded = evaluated.filter((e): e is Extract<Evaluated, { ok: false }> => !e.ok);

  function clearDrafts() {
    if (window.confirm(`Clear the stats you've entered for ${enteredIds.length} frog${enteredIds.length === 1 ? '' : 's'}?`)) {
      setDrafts({});
    }
  }

  async function handleSubmit() {
    if (!ready.length || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const results = await submitFrogStats(ready.map(r => r.payload), auth.user?.id_token);
      const acceptedIds = new Set<string>();
      const refused: string[] = [];
      for (const r of results) {
        const item = ready[r.index];
        if (!item) continue;
        if (r.ok) acceptedIds.add(item.id);
        else refused.push(r.error.includes(item.name) ? r.error : `${item.name}: ${r.error}`);
      }

      // Accepted entries are done; refused ones stay in the draft to revisit.
      setDrafts(d => {
        const out = { ...d };
        for (const id of acceptedIds) delete out[id];
        return out;
      });
      void queryClient.invalidateQueries({ queryKey: ['frog-stats-pending'] });
      void queryClient.invalidateQueries({ queryKey: ['incomplete-frogs'] });

      const n = acceptedIds.size;
      setResult({
        ok: n > 0,
        message: n > 0
          ? `Thanks! ${n} frog${n === 1 ? ' was' : 's were'} submitted and ${n === 1 ? 'is' : 'are'} pending review.`
          : 'None of the frogs could be submitted.',
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
          <p className="stats-excluded-title">These frogs weren't accepted and are still in your entries:</p>
          <ul>{result.refused.map(r => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </>
  );

  if (reviewing) {
    return (
      <div>
        <h1>Review Frog Stats</h1>
        <p className="search-hint" style={{ marginTop: 0 }}>
          Check the stats below before submitting. Each frog is reviewed individually before it's added to the database.
        </p>

        {excluded.length > 0 && (
          <div className="stats-excluded">
            <p className="stats-excluded-title">
              {excluded.length} frog{excluded.length === 1 ? '' : 's'} won't be submitted:
            </p>
            <ul>{excluded.map(e => <li key={e.id}>{e.reason}</li>)}</ul>
          </div>
        )}

        <h2>Ready to submit <span className="breed-weekly-count">({ready.length})</span></h2>
        {ready.length === 0 ? (
          <p className="search-hint">None of your entered frogs have all three stats filled in yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Frog</th>{STATS.map(s => <th key={s.key}>{s.label}</th>)}</tr>
              </thead>
              <tbody>
                {ready.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    {STATS.map(s => (
                      <td
                        key={s.key}
                        className={r.prefilled.has(s.key) ? 'stat-existing stat-existing-cell' : undefined}
                        title={r.prefilled.has(s.key) ? 'Already recorded' : undefined}
                      >
                        {formatNum(r.payload[s.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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

  return (
    <div>
      <h1>Frog Stat Submissions</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        These frogs are missing their Value, Speed, or Stamina. Narrow the list by Breed, then Base Color,
        then Secondary Color, and fill in any frogs you know — all three stats are needed for a frog to be
        submitted. Your entries are kept as you change filters. When you're done, review and submit them;
        all submissions are reviewed manually before being added to the database.
        If you would like credit for your submissions, make sure you're logged in under the site settings.
      </p>

      {resultBlock}

      <div className="filter-grid">
        <ComboBox
          label="Breed"
          options={breedOpts}
          presorted
          initialSelection={breed}
          onSelect={pickBreed}
        />
        <ComboBox
          key={`base-${breed?.id ?? ''}`}
          label="Base Color"
          options={baseOpts}
          presorted
          disabled={!breed}
          placeholder={breed ? undefined : 'Choose a breed first'}
          initialSelection={base}
          onSelect={pickBase}
        />
        <ComboBox
          key={`sec-${breed?.id ?? ''}-${base?.id ?? ''}`}
          label="Secondary Color"
          options={secOpts}
          presorted
          disabled={!base}
          placeholder={base ? undefined : 'Choose a base color first'}
          initialSelection={sec}
          onSelect={setSec}
        />
      </div>

      {error && <p className="search-error">Error: {String(error)}</p>}

      {/* Wait for the lookups too, so rows don't reshuffle once the sort order arrives */}
      {isLoading || !breeds || !bases || !secs ? (
        <p className="search-hint">Loading frogs…</p>
      ) : available.length === 0 ? (
        <p className="search-hint">
          Every frog has its stats recorded{pendingCount > 0 ? ' or pending review' : ''}. 🎉
        </p>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Frog</th><th>Level</th>{STATS.map(s => <th key={s.key}>{s.label}</th>)}</tr>
              </thead>
              <tbody>
                {visible.map(f => {
                  const entry = drafts[f.id];
                  const lvl = level(f);
                  return (
                    <tr key={f.id} className={entry ? 'stats-row-entered' : undefined}>
                      <td>{f.fields.fullname}</td>
                      <td>{Number.isFinite(lvl) ? lvl : '—'}</td>
                      {STATS.map(s => {
                        const known = existing(f, s.field);
                        return (
                          <td key={s.key} className={known !== null ? 'stat-existing-cell' : undefined}>
                            {known !== null ? (
                              <span className="stat-existing" title="Already recorded">{formatNum(known)}</span>
                            ) : (
                              <input
                                className="search-input stat-input"
                                type="text"
                                inputMode="numeric"
                                aria-label={`${f.fields.fullname} ${s.label}`}
                                value={entry?.[s.key] ?? ''}
                                onChange={e => setStat(f, s.key, e.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-pagination">
            <span>
              {enteredIds.length} frog{enteredIds.length === 1 ? '' : 's'} with entries
              {enteredIds.length > 0 && (
                <> · <button className="link-btn" type="button" onClick={clearDrafts}>Clear entries</button></>
              )}
            </span>
            <span className="pagination-count">
              {visible.length} frog{visible.length === 1 ? '' : 's'} missing stats
              {pendingCount > 0 && ` · ${pendingCount} more pending review`}
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
