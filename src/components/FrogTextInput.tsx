import { useState, useRef, useEffect, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchFrogByText, type TeableRecord } from '../api/teable';
import type { ComboOption } from './ComboBox';
import IconVerified from './IconVerified';
import { EMPTY_FROG, frogName, isComplete, type FrogSel } from '../utils/frogIds';
import type { FrogOptions } from '../hooks/useFrogOptions';

// Pause after the last keystroke before the text is looked up.
const DEBOUNCE_MS = 600;

interface MatchFields extends Record<string, unknown> {
  Primary?:   unknown;
  Secondary?: unknown;
  Breed?:     unknown;
}

type TextOptions = Pick<FrogOptions, 'baseOpts' | 'secOpts' | 'breedOpts'>;

type Status = 'idle' | 'pending' | 'ok' | 'bad';

// The picker option a Teable link field points at — the loaded option itself
// when there is one, so the selection matches what a dropdown would give.
function optionFor(link: unknown, opts: ComboOption[]): ComboOption | null {
  const first = Array.isArray(link) ? link[0] : link;
  if (!first || typeof first !== 'object' || !('id' in first)) return null;
  const { id, title } = first as { id: unknown; title?: unknown };
  return opts.find(o => o.id === String(id)) ?? { id: String(id), label: String(title ?? '') };
}

function selFrom(rec: TeableRecord<MatchFields>, options: TextOptions): FrogSel | null {
  const sel = {
    base:  optionFor(rec.fields.Primary,   options.baseOpts),
    sec:   optionFor(rec.fields.Secondary, options.secOpts),
    breed: optionFor(rec.fields.Breed,     options.breedOpts),
  };
  return isComplete(sel) ? sel : null;
}

// One text box standing in for the Base / Secondary / Breed dropdowns: an exact
// Frog_ID ("18:11:0") or full name ("Maroon Tingo Anura"), looked up once typing
// pauses. A match selects the frog like completed dropdowns would; anything else
// is marked with an X. Like ComboBox, it reads `sel` only on mount.
export default function FrogTextInput({
  label = 'Frog ID or Name', sel, onChange, options,
}: {
  label?: string;
  sel: FrogSel;
  onChange: (s: FrogSel) => void;
  options: TextOptions;
}) {
  const inputId = useId();
  const queryClient = useQueryClient();
  // A frog already selected (e.g. restored from the URL) shows by name, matched.
  const [text, setText] = useState(() => (isComplete(sel) ? frogName(sel) : ''));
  const [status, setStatus] = useState<Status>(() => (isComplete(sel) ? 'ok' : 'idle'));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Bumped per keystroke so a slow lookup for older text is ignored.
  const seq = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleInput(value: string) {
    setText(value);
    clearTimeout(timer.current);
    const n = ++seq.current;
    // Editing drops the current frog straight away, as a dropdown edit does.
    if (status === 'ok') onChange(EMPTY_FROG);
    if (value === '') { setStatus('idle'); return; }
    setStatus('pending');
    timer.current = setTimeout(async () => {
      let match: FrogSel | null = null;
      try {
        const rec = await queryClient.fetchQuery({
          queryKey: ['frog-text', value],
          queryFn:  () => fetchFrogByText<MatchFields>(value),
          staleTime: 1000 * 60 * 60 * 24,
        });
        match = rec ? selFrom(rec, options) : null;
      } catch {
        // A failed lookup reads as no match; editing the text retries.
      }
      if (n !== seq.current) return;
      setStatus(match ? 'ok' : 'bad');
      if (match) onChange(match);
    }, DEBOUNCE_MS);
  }

  const statusText = status === 'ok' ? 'Frog found' : 'No frog with this exact ID or name';

  return (
    <div className="combobox-field frog-text-field">
      <label className="combobox-label" htmlFor={inputId}>{label}</label>
      <div className="combobox">
        <input
          id={inputId}
          className={`search-input combobox-input${status === 'ok' ? ' combobox-confirmed' : ''}`}
          type="text"
          value={text}
          placeholder="18:11:0 or Maroon Tingo Anura"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={status === 'bad'}
          onChange={e => handleInput(e.target.value)}
        />
        {(status === 'ok' || status === 'bad') && (
          <span className={`frog-text-status is-${status}`} role="img" aria-label={statusText} title={statusText}>
            <IconVerified ok={status === 'ok'} />
          </span>
        )}
      </div>
    </div>
  );
}
