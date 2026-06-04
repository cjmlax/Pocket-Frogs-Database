import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTable } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { breedOptionsFrom } from '../utils/breeds';
import { useBreedSort } from '../hooks/useBreedSort';
import { useColorSort } from '../hooks/useColorSort';
import { colorOptionsFrom } from '../utils/colors';
import { checkWeeklyStatus } from '../api/teable';
import { submitWeeklySet } from '../api/submit';

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> { fullname?: string }

interface SlotSel { base: ComboOption | null; sec: ComboOption | null; breed: ComboOption | null }
const EMPTY_SLOT: SlotSel = { base: null, sec: null, breed: null };
const MIN_FROGS = 4;
const MAX_FROGS = 8;

function fullName(s: SlotSel): string | null {
  return s.base && s.sec && s.breed ? `${s.base.label} ${s.sec.label} ${s.breed.label}` : null;
}
const filled = (s: SlotSel) => !!(s.base && s.sec && s.breed);

function FrogSlot({
  index, sel, onChange, baseOpts, secOpts, breedOpts, removable, onRemove,
}: {
  index: number;
  sel: SlotSel;
  onChange: (s: SlotSel) => void;
  baseOpts: ComboOption[];
  secOpts: ComboOption[];
  breedOpts: ComboOption[];
  removable: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="parent-group">
      <div className="parent-title-row">
        <h2 className="parent-title">
          Frog {index + 1}
          {index >= MIN_FROGS && <span className="submit-optional"> (optional)</span>}
        </h2>
        {removable && (
          <button className="csv-btn" type="button" onClick={onRemove} style={{ fontSize: 13 }}>
            Remove
          </button>
        )}
      </div>
      <ComboBox label="Base Color"      options={baseOpts}  presorted initialSelection={sel.base}  onSelect={o => onChange({ ...sel, base: o })} />
      <ComboBox label="Secondary Color" options={secOpts}   presorted initialSelection={sel.sec}   onSelect={o => onChange({ ...sel, sec: o })} />
      <ComboBox label="Breed"           options={breedOpts} presorted initialSelection={sel.breed} onSelect={o => onChange({ ...sel, breed: o })} />
    </div>
  );
}

export default function SubmitWeeklySet() {
  const [setName, setSetName]   = useState('');
  const [reward, setReward]     = useState('');
  const [slots, setSlots]       = useState<SlotSel[]>(() =>
    Array.from({ length: MIN_FROGS }, () => ({ ...EMPTY_SLOT })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; message: string } | null>(null);
  const [resetKey, setResetKey]     = useState(0);

  const { data: weeklyStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['weekly-status'],
    queryFn: checkWeeklyStatus,
    staleTime: 5 * 60 * 1000,
  });

  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });
  const { data: frogs  } = useQuery({ queryKey: ['table', 'frogs'],  queryFn: () => fetchTable<FrogFields>('frogs')  });

  const breedSort = useBreedSort();
  const colorSort = useColorSort();
  const breedOpts = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOpts  = useMemo<ComboOption[]>(() => colorOptionsFrom(bases, 'BaseColors', colorSort), [bases, colorSort]);
  const secOpts   = useMemo<ComboOption[]>(() => colorOptionsFrom(secs,  'Sec_Color',  colorSort), [secs,  colorSort]);

  // Maps each frog's display name → its Teable record ID so we can submit IDs
  // directly to the link fields on the weekly table instead of plain strings.
  const frogRecordId = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const f of frogs ?? []) if (f.fields.fullname) m.set(f.fields.fullname, f.id);
    return m;
  }, [frogs]);

  const resolvedIds = useMemo(
    () => slots.map(s => {
      if (!filled(s)) return null;
      const name = fullName(s)!;
      const id = frogRecordId.get(name);
      return id ?? 'UNKNOWN';
    }),
    [slots, frogRecordId],
  );

  const rewardNum   = parseInt(reward, 10);
  const rewardValid = reward !== '' && Number.isInteger(rewardNum) && rewardNum > 0;
  const setNameTrim = setName.trim();

  const filledSlots  = resolvedIds.filter(n => n !== null);
  const unknownFrogs = resolvedIds.some(n => n === 'UNKNOWN');
  const enoughFrogs  = filledSlots.length >= MIN_FROGS && !unknownFrogs;
  const validFrogIds = resolvedIds.filter((n): n is string => n !== null && n !== 'UNKNOWN');

  const canSubmit =
    setNameTrim !== '' && rewardValid && enoughFrogs && !submitting &&
    frogs !== undefined; // wait for frog list to load before allowing submit

  function handleSlotChange(i: number, s: SlotSel) {
    setSlots(prev => prev.map((p, idx) => idx === i ? s : p));
  }

  function handleAddFrog() {
    if (slots.length < MAX_FROGS) setSlots(prev => [...prev, { ...EMPTY_SLOT }]);
  }

  function handleRemoveFrog(i: number) {
    if (slots.length > MIN_FROGS) setSlots(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      await submitWeeklySet({ setName: setNameTrim, reward: rewardNum, frogs: validFrogIds });
      setResult({ ok: true, message: 'Thanks! Your submission was received and is pending review.' });
      setTimeout(() => setResult(null), 4000);
      setSetName('');
      setReward('');
      setSlots(Array.from({ length: MIN_FROGS }, () => ({ ...EMPTY_SLOT })));
      setResetKey(k => k + 1);
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (statusLoading) {
    return (
      <div>
        <h1>Weekly Set Submission</h1>
        <p className="search-hint" style={{ marginTop: 0 }}>Checking availability…</p>
      </div>
    );
  }

  if (weeklyStatus?.exists) {
    return (
      <div>
        <h1>Weekly Set Submission</h1>
        <p className="search-hint" style={{ marginTop: 0 }}>
          A weekly set for <strong>{weeklyStatus.week}</strong> has already been submitted.
          Check back next week!
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Weekly Set Submission</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Submit a new weekly set for review. The set date will be set to the current active week automatically. All submissions are reviewed manually before being added to the database.
      </p>

      <div className="weekly-submit-fields">
        <div className="combobox-field">
          <label className="combobox-label" htmlFor="ws-name">Set Name</label>
          <input
            id="ws-name"
            className="search-input"
            style={{ width: '100%' }}
            type="text"
            value={setName}
            placeholder="e.g. Summer Safari"
            onChange={e => setSetName(e.target.value)}
          />
        </div>
        <div className="combobox-field">
          <label className="combobox-label" htmlFor="ws-reward">Reward (stamps/potions)</label>
          <input
            id="ws-reward"
            className="search-input"
            style={{ width: '100%' }}
            type="number"
            inputMode="numeric"
            min={1}
            value={reward}
            placeholder="e.g. 250"
            onChange={e => setReward(e.target.value)}
          />
        </div>
      </div>

      <div key={resetKey} className="breeding-parents weekly-frog-slots">
        {slots.map((slot, i) => (
          <FrogSlot
            key={i}
            index={i}
            sel={slot}
            onChange={s => handleSlotChange(i, s)}
            baseOpts={baseOpts}
            secOpts={secOpts}
            breedOpts={breedOpts}
            removable={slots.length > MIN_FROGS}
            onRemove={() => handleRemoveFrog(i)}
          />
        ))}
      </div>

      <div className="submit-actions" style={{ gap: 10 }}>
        {slots.length < MAX_FROGS && (
          <button className="csv-btn" type="button" onClick={handleAddFrog}>
            + Add Frog
          </button>
        )}
      </div>

      {unknownFrogs && (
        <p className="search-error">One or more selected combinations isn't a known frog.</p>
      )}

      {!rewardValid && reward !== '' && (
        <p className="search-error">Reward must be a positive whole number.</p>
      )}

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
