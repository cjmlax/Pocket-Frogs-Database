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

// Pulls the linked frog record id from a Teable link field.
function linkId(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
  return null;
}

function fullName(p: ParentSel): string | null {
  return p.base && p.sec && p.breed ? `${p.base.label} ${p.sec.label} ${p.breed.label}` : null;
}

// ── Parent selector column (mirrors the Breeding Pairs inputs) ──────────────────

function ParentInputs({
  title, sel, onChange, baseOpts, secOpts, breedOpts,
}: {
  title: string;
  sel: ParentSel;
  onChange: (s: ParentSel) => void;
  baseOpts: ComboOption[];
  secOpts: ComboOption[];
  breedOpts: ComboOption[];
}) {
  return (
    <div className="parent-group">
      <h2 className="parent-title">{title}</h2>
      <ComboBox label="Base Color"      options={baseOpts}  initialSelection={sel.base}  onSelect={o => onChange({ ...sel, base: o })} />
      <ComboBox label="Secondary Color" options={secOpts}   initialSelection={sel.sec}   onSelect={o => onChange({ ...sel, sec: o })} />
      <ComboBox label="Breed"           options={breedOpts} presorted initialSelection={sel.breed} onSelect={o => onChange({ ...sel, breed: o })} />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SubmitCombo() {
  const [variant, setVariant] = useState<Variant>('chroma');
  const [pa, setPa] = useState<ParentSel>(EMPTY);
  const [pb, setPb] = useState<ParentSel>(EMPTY);
  const [note, setNote] = useState('');
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

  // Resolve each picked combination to a real frog record (shared 24h cache).
  const breedAQuery = useQuery({
    queryKey: ['breed-frogs', pa.breed?.id], queryFn: () => fetchBreedFrogs<FrogFields>(pa.breed!.id),
    enabled: !!pa.breed, staleTime: 1000 * 60 * 60 * 24,
  });
  const breedBQuery = useQuery({
    queryKey: ['breed-frogs', pb.breed?.id], queryFn: () => fetchBreedFrogs<FrogFields>(pb.breed!.id),
    enabled: !!pb.breed, staleTime: 1000 * 60 * 60 * 24,
  });

  const index = useMemo(() => {
    const m = new Map<string, TeableRecord<FrogFields>>();
    for (const f of [...(breedAQuery.data ?? []), ...(breedBQuery.data ?? [])]) {
      if (f.fields.fullname) m.set(f.fields.fullname, f);
    }
    return m;
  }, [breedAQuery.data, breedBQuery.data]);

  const nameA = fullName(pa), nameB = fullName(pb);
  const frogA = useMemo(() => (nameA ? index.get(nameA) ?? null : null), [nameA, index]);
  const frogB = useMemo(() => (nameB ? index.get(nameB) ?? null : null), [nameB, index]);

  const bothPicked = !!(nameA && nameB);
  const resolving = (!!pa.breed && breedAQuery.isFetching) || (!!pb.breed && breedBQuery.isFetching);
  // A combination that doesn't resolve to a record can't be submitted.
  const unknownFrog = bothPicked && !resolving && (!frogA || !frogB);
  const samefrog = !!(frogA && frogB && frogA.id === frogB.id);

  // Existing combos, to warn about duplicates before someone submits one.
  const { data: chromaCombos } = useQuery({ queryKey: ['table', 'chroma'], queryFn: () => fetchCombos<ComboFields>('chroma') });
  const { data: glassCombos  } = useQuery({ queryKey: ['table', 'glass'],  queryFn: () => fetchCombos<ComboFields>('glass')  });

  const alreadyExists = useMemo(() => {
    if (!frogA || !frogB) return false;
    const combos = variant === 'chroma' ? chromaCombos : glassCombos;
    const a = frogA.id, b = frogB.id;
    return (combos ?? []).some(rec => {
      const f1 = linkId(rec.fields['Frog 1']), f2 = linkId(rec.fields['Frog 2']);
      return (f1 === a && f2 === b) || (f1 === b && f2 === a);
    });
  }, [frogA, frogB, variant, chromaCombos, glassCombos]);

  const canSubmit = bothPicked && !resolving && !unknownFrog && !samefrog && !alreadyExists && !submitting;

  async function handleSubmit() {
    if (!frogA || !frogB || !canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      await submitCombo(
        {
          variant,
          frog1Id: frogA.id,
          frog2Id: frogB.id,
          frog1Name: nameA!,
          frog2Name: nameB!,
          note: note.trim() || undefined,
        },
        screenshot,
      );
      setResult({ ok: true, message: 'Thanks! Your submission was received and is pending review.' });
      // Reset for another entry.
      setPa(EMPTY); setPb(EMPTY); setNote(''); setScreenshot(null);
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
        Know a Chroma or Glass pairing that isn't in the database yet? Pick both parent
        frogs below and send it in. Submissions are reviewed before they're added.
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
        <ParentInputs title="Parent Frog 1" sel={pa} onChange={setPa} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
        <ParentInputs title="Parent Frog 2" sel={pb} onChange={setPb} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} />
      </div>

      <div className="submit-extras">
        <div className="combobox-field">
          <label className="combobox-label" htmlFor="combo-note">Note <span className="submit-optional">(optional)</span></label>
          <textarea
            id="combo-note"
            className="search-input submit-note"
            value={note}
            maxLength={500}
            placeholder="Anything that helps verify this — where you saw it, etc."
            onChange={e => setNote(e.target.value)}
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
      ) : samefrog ? (
        <p className="search-error">Both parents are the same frog — pick two different ones.</p>
      ) : unknownFrog ? (
        <p className="search-error">That base / secondary / breed combination isn't a known frog.</p>
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
