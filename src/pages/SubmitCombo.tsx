import { useState, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTable, fetchBreedFrogs, fetchCombos, type TeableRecord } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { breedOptionsFrom } from '../utils/breeds';
import { useBreedSort } from '../hooks/useBreedSort';
import { submitCombo } from '../api/submit';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> { fullname?: string }
interface ComboFields extends Record<string, unknown> { 'Frog 1'?: unknown; 'Frog 2'?: unknown }

interface ParentSel { base: ComboOption | null; sec: ComboOption | null; breed: ComboOption | null }
const EMPTY: ParentSel = { base: null, sec: null, breed: null };

type Variant = 'chroma' | 'glass';
const DAY = 1000 * 60 * 60 * 24;

// Pulls the linked frog record id from a Teable link field.
function linkId(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
  return null;
}

const picked = (p: ParentSel) => !!(p.base && p.sec && p.breed);
const touched = (p: ParentSel) => !!(p.base || p.sec || p.breed);
function fullName(p: ParentSel): string | null {
  return p.base && p.sec && p.breed ? `${p.base.label} ${p.sec.label} ${p.breed.label}` : null;
}
function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ── Frog selector column (mirrors the Breeding Pairs inputs) ────────────────────

function FrogInputs({
  title, hint, control, sel, onChange, baseOpts, secOpts, breedOpts,
}: {
  title: string;
  hint?: string;
  control?: ReactNode;
  sel: ParentSel;
  onChange: (s: ParentSel) => void;
  baseOpts: ComboOption[];
  secOpts: ComboOption[];
  breedOpts: ComboOption[];
}) {
  return (
    <div className="parent-group">
      <div className="parent-title-row">
        <h2 className="parent-title">{title}{hint && <span className="submit-optional"> {hint}</span>}</h2>
        {control}
      </div>
      <ComboBox label="Base Color"      options={baseOpts}  initialSelection={sel.base}  onSelect={o => onChange({ ...sel, base: o })} />
      <ComboBox label="Secondary Color" options={secOpts}   initialSelection={sel.sec}   onSelect={o => onChange({ ...sel, sec: o })} />
      <ComboBox label="Breed"           options={breedOpts} presorted initialSelection={sel.breed} onSelect={o => onChange({ ...sel, breed: o })} />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SubmitCombo() {
  const [variant, setVariant] = useState<Variant>('chroma');
  const [p1, setP1] = useState<ParentSel>(EMPTY);
  const [p2, setP2] = useState<ParentSel>(EMPTY);
  const [pResult, setPResult] = useState<ParentSel>(EMPTY);
  const [pLost, setPLost] = useState<ParentSel>(EMPTY);
  const [sourceLink, setSourceLink] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Parents are verified first, then locked; the rest of the form is gated on this.
  const [checked, setChecked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lookup tables for the pickers (small, ETag-cached, shared with other pages)
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedSort = useBreedSort();
  const breedOpts = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOpts  = useMemo<ComboOption[]>(() => bases?.map(r => ({ id: r.id, label: r.fields.BaseColors ?? r.id })) ?? [], [bases]);
  const secOpts   = useMemo<ComboOption[]>(() => secs?.map( r => ({ id: r.id, label: r.fields.Sec_Color  ?? r.id })) ?? [], [secs]);

  // Resolve each picked frog via its breed's frogs (shared 24h cache, deduped).
  const q1 = useQuery({ queryKey: ['breed-frogs', p1.breed?.id],      queryFn: () => fetchBreedFrogs<FrogFields>(p1.breed!.id),      enabled: !!p1.breed,      staleTime: DAY });
  const q2 = useQuery({ queryKey: ['breed-frogs', p2.breed?.id],      queryFn: () => fetchBreedFrogs<FrogFields>(p2.breed!.id),      enabled: !!p2.breed,      staleTime: DAY });
  const qR = useQuery({ queryKey: ['breed-frogs', pResult.breed?.id], queryFn: () => fetchBreedFrogs<FrogFields>(pResult.breed!.id), enabled: !!pResult.breed, staleTime: DAY });
  const qL = useQuery({ queryKey: ['breed-frogs', pLost.breed?.id],   queryFn: () => fetchBreedFrogs<FrogFields>(pLost.breed!.id),   enabled: !!pLost.breed,   staleTime: DAY });

  const index = useMemo(() => {
    const m = new Map<string, TeableRecord<FrogFields>>();
    for (const f of [...(q1.data ?? []), ...(q2.data ?? []), ...(qR.data ?? []), ...(qL.data ?? [])]) {
      if (f.fields.fullname) m.set(f.fields.fullname, f);
    }
    return m;
  }, [q1.data, q2.data, qR.data, qL.data]);

  const resolve = (p: ParentSel) => (picked(p) ? index.get(fullName(p)!) ?? null : null);
  const frog1 = useMemo(() => resolve(p1),      [p1, index]);
  const frog2 = useMemo(() => resolve(p2),      [p2, index]);
  const frogR = useMemo(() => resolve(pResult), [pResult, index]);
  const frogL = useMemo(() => resolve(pLost),   [pLost, index]);

  const resolving =
    (!!p1.breed && q1.isFetching) || (!!p2.breed && q2.isFetching) ||
    (!!pResult.breed && qR.isFetching) || (!!pLost.breed && qL.isFetching);

  // A fully-picked frog that doesn't resolve to a record can't be submitted.
  const unknownFrog = !resolving && (
    (picked(p1) && !frog1) || (picked(p2) && !frog2) ||
    (picked(pResult) && !frogR) || (picked(pLost) && !frogL)
  );
  // Lost frog is optional, but a half-filled picker is ambiguous.
  const lostPartial = touched(pLost) && !picked(pLost);

  const sourceTrim = sourceLink.trim();
  const sourceValid = sourceTrim === '' || isUrl(sourceTrim);

  // Existing combos, to warn about duplicate parent pairs before submitting.
  const { data: chromaCombos } = useQuery({ queryKey: ['table', 'chroma'], queryFn: () => fetchCombos<ComboFields>('chroma') });
  const { data: glassCombos  } = useQuery({ queryKey: ['table', 'glass'],  queryFn: () => fetchCombos<ComboFields>('glass')  });

  // Does this parent pair already exist in each special table? (Either order.)
  const pairIn = (combos: TeableRecord<ComboFields>[] | undefined) => {
    if (!frog1 || !frog2) return false;
    const a = frog1.id, b = frog2.id;
    return (combos ?? []).some(rec => {
      const f1 = linkId(rec.fields['Frog 1']), f2 = linkId(rec.fields['Frog 2']);
      return (f1 === a && f2 === b) || (f1 === b && f2 === a);
    });
  };
  const existsChroma = useMemo(() => pairIn(chromaCombos), [frog1, frog2, chromaCombos]);
  const existsGlass  = useMemo(() => pairIn(glassCombos),  [frog1, frog2, glassCombos]);
  const alreadyExists = variant === 'chroma' ? existsChroma : existsGlass;

  // ── Phase 1: confirm the parent pair before unlocking the rest ─────────────
  // Any base/secondary/breed selection resolves to a real frog (the pickers are
  // referential), and breeding a frog with itself is valid — so the only blocker
  // is the pairing already existing in either special table.
  const combosLoaded = !!chromaCombos && !!glassCombos;
  const pairExists = existsChroma || existsGlass;
  const canProceed = picked(p1) && picked(p2) && !!frog1 && !!frog2 && combosLoaded && !pairExists;

  // The proceed button reflects the live state of the parent pairing.
  const proceedLabel =
    (!picked(p1) || !picked(p2)) ? 'Complete both parent frogs'
    : (!frog1 || !frog2 || !combosLoaded) ? 'Checking…'
    : pairExists ? 'Duplicate found'
    : 'Proceed →';

  // ── Phase 2: the rest of the submission (only after a successful check) ─────
  const resultReady =
    picked(pResult) && !!frogR &&
    !resolving && !unknownFrog && !lostPartial && sourceValid && !alreadyExists;
  const needsScreenshot = checked && resultReady && !screenshot;
  const canSubmit = checked && resultReady && !!screenshot && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !frog1 || !frog2 || !frogR) return;
    setSubmitting(true);
    setResult(null);
    try {
      await submitCombo(
        {
          variant,
          frog1Id: frog1.id, frog2Id: frog2.id,
          frog1Name: fullName(p1)!, frog2Name: fullName(p2)!,
          resultFrogId: frogR.id, resultFrogName: fullName(pResult)!,
          lostFrogId: frogL?.id, lostFrogName: frogL ? fullName(pLost)! : undefined,
          sourceLink: sourceTrim || undefined,
        },
        screenshot,
      );
      setResult({ ok: true, message: 'Thanks! Your submission was received and is pending review.' });
      setP1(EMPTY); setP2(EMPTY); setPResult(EMPTY); setPLost(EMPTY);
      setSourceLink(''); setScreenshot(null); setChecked(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  }

  // Lock in the verified parents and reveal the rest of the form.
  function handleProceed() {
    if (!canProceed) return;
    setChecked(true);
    setResult(null);
  }

  // Unlock the parents to correct an input error (re-check required to proceed).
  function handleUnlock() {
    setChecked(false);
    setResult(null);
  }

  return (
    <div>
      <h1>Submit a Combination</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Know a Chroma or Glass pairing that isn't in the database yet? Enter the two parent
        frogs and check the pairing first — if it's new, you'll be able to add the special
        frog it produces. Submissions are reviewed before they're added.
      </p>

      {!checked ? (
        <>
          <div className="breeding-parents">
            <FrogInputs title="Parent Frog 1" sel={p1} onChange={setP1} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
            <FrogInputs title="Parent Frog 2" sel={p2} onChange={setP2} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
          </div>

          <div className="submit-actions">
            <button className="submit-btn" type="button" disabled={!canProceed} onClick={handleProceed}>
              {proceedLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="locked-parents">
            <div className="locked-parents-info">
              <span className="locked-parents-label">Parent pairing</span>
              <span className="locked-parents-names"><strong>{fullName(p1)}</strong> + <strong>{fullName(p2)}</strong></span>
            </div>
            <button className="csv-btn" type="button" onClick={handleUnlock}>Edit parents</button>
          </div>

          <div className="breeding-parents">
            <FrogInputs
              title="Result Frog"
              sel={pResult}
              onChange={setPResult}
              baseOpts={baseOpts}
              secOpts={secOpts}
              breedOpts={breedOpts}
              control={
                <div className="settings-row type-toggle">
                  {(['chroma', 'glass'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      className={`settings-theme-opt${variant === v ? ' active' : ''}`}
                      onClick={() => setVariant(v)}
                    >
                      {v === 'chroma' ? 'Chroma' : 'Glass'}
                    </button>
                  ))}
                </div>
              }
            />
            <FrogInputs title="Lost Frog" hint="(optional)" sel={pLost} onChange={setPLost} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
          </div>

          <div className="submit-extras">
            <div className="combobox-field">
              <label className="combobox-label" htmlFor="combo-source">Source link <span className="submit-optional">(optional)</span></label>
              <input
                id="combo-source"
                className="search-input"
                style={{ width: '100%' }}
                type="url"
                inputMode="url"
                value={sourceLink}
                placeholder="https://… where the combination was posted"
                onChange={e => setSourceLink(e.target.value)}
              />
            </div>
            <div className="combobox-field">
              <label className="combobox-label" htmlFor="combo-shot">Screenshot</label>
              <input
                id="combo-shot"
                ref={fileRef}
                className="submit-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {/* Inline guidance about the current selection */}
          {resolving ? (
            <p className="search-hint">Checking those frogs…</p>
          ) : unknownFrog ? (
            <p className="search-error">One of the selected base / secondary / breed combinations isn't a known frog.</p>
          ) : lostPartial ? (
            <p className="search-error">Finish or clear the Lost Frog selection.</p>
          ) : !sourceValid ? (
            <p className="search-error">The source link must be a valid http(s) URL.</p>
          ) : alreadyExists ? (
            <p className="breeding-special">This {variant === 'chroma' ? 'Chroma' : 'Glass'} pairing is already in the database — switch the type above.</p>
          ) : needsScreenshot ? (
            <p className="search-hint">Add a screenshot of the combination to submit.</p>
          ) : null}

          <div className="submit-actions">
            <button className="submit-btn" type="button" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </button>
          </div>
        </>
      )}

      {result && (
        <p className={result.ok ? 'submit-success' : 'search-error'}>{result.message}</p>
      )}
    </div>
  );
}
