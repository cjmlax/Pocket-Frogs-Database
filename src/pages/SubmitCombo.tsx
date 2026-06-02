import { useState, useMemo, useRef } from 'react';
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
  title, hint, sel, onChange, baseOpts, secOpts, breedOpts,
}: {
  title: string;
  hint?: string;
  sel: ParentSel;
  onChange: (s: ParentSel) => void;
  baseOpts: ComboOption[];
  secOpts: ComboOption[];
  breedOpts: ComboOption[];
}) {
  return (
    <div className="parent-group">
      <h2 className="parent-title">{title}{hint && <span className="submit-optional"> {hint}</span>}</h2>
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

  const requiredPicked = picked(p1) && picked(p2) && picked(pResult);
  // A fully-picked frog that doesn't resolve to a record can't be submitted.
  const unknownFrog = !resolving && (
    (picked(p1) && !frog1) || (picked(p2) && !frog2) ||
    (picked(pResult) && !frogR) || (picked(pLost) && !frogL)
  );
  // Lost frog is optional, but a half-filled picker is ambiguous.
  const lostPartial = touched(pLost) && !picked(pLost);
  const sameParents = !!(frog1 && frog2 && frog1.id === frog2.id);

  const sourceTrim = sourceLink.trim();
  const sourceValid = sourceTrim === '' || isUrl(sourceTrim);

  // Existing combos, to warn about duplicate parent pairs before submitting.
  const { data: chromaCombos } = useQuery({ queryKey: ['table', 'chroma'], queryFn: () => fetchCombos<ComboFields>('chroma') });
  const { data: glassCombos  } = useQuery({ queryKey: ['table', 'glass'],  queryFn: () => fetchCombos<ComboFields>('glass')  });

  const alreadyExists = useMemo(() => {
    if (!frog1 || !frog2) return false;
    const combos = variant === 'chroma' ? chromaCombos : glassCombos;
    const a = frog1.id, b = frog2.id;
    return (combos ?? []).some(rec => {
      const f1 = linkId(rec.fields['Frog 1']), f2 = linkId(rec.fields['Frog 2']);
      return (f1 === a && f2 === b) || (f1 === b && f2 === a);
    });
  }, [frog1, frog2, variant, chromaCombos, glassCombos]);

  const canSubmit =
    requiredPicked && !!frog1 && !!frog2 && !!frogR &&
    !resolving && !unknownFrog && !sameParents && !lostPartial && sourceValid &&
    !alreadyExists && !submitting;

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
      setSourceLink(''); setScreenshot(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>Submit a Combination</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Know a Chroma or Glass pairing that isn't in the database yet? Enter the two parent
        frogs and the special frog they produce. Submissions are reviewed before they're added.
      </p>

      <div className="combobox-field" style={{ maxWidth: 280 }}>
        <label className="combobox-label">Type</label>
        <div className="settings-row">
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
      </div>

      <div className="breeding-parents">
        <FrogInputs title="Parent Frog 1" sel={p1} onChange={setP1} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
        <FrogInputs title="Parent Frog 2" sel={p2} onChange={setP2} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
      </div>

      <div className="breeding-parents">
        <FrogInputs title="Result Frog" sel={pResult} onChange={setPResult} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
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
          <label className="combobox-label" htmlFor="combo-shot">Screenshot <span className="submit-optional">(optional)</span></label>
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
      ) : sameParents ? (
        <p className="search-error">Both parents are the same frog — pick two different ones.</p>
      ) : unknownFrog ? (
        <p className="search-error">One of the selected base / secondary / breed combinations isn't a known frog.</p>
      ) : lostPartial ? (
        <p className="search-error">Finish or clear the Lost Frog selection.</p>
      ) : !sourceValid ? (
        <p className="search-error">The source link must be a valid http(s) URL.</p>
      ) : alreadyExists ? (
        <p className="breeding-special">✓ This {variant === 'chroma' ? 'Chroma' : 'Glass'} pairing is already in the database — no need to submit it.</p>
      ) : null}

      <div className="submit-actions">
        <button className="submit-btn" type="button" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>

      {result && (
        <p className={result.ok ? 'submit-success' : 'search-error'}>{result.message}</p>
      )}
    </div>
  );
}
