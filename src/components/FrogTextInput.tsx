import { useState, useRef, useEffect, useId } from 'react';
import IconVerified from './IconVerified';
import { EMPTY_FROG, frogName, isComplete, matchFrogText, type FrogIdLookup, type FrogSel } from '../utils/frogIds';

// Pause after the last keystroke before the text is checked.
const DEBOUNCE_MS = 600;

type Status = 'idle' | 'pending' | 'ok' | 'bad';

// One text box standing in for the Base / Secondary / Breed dropdowns: an exact
// Frog_ID ("18:11:0") or full name in any case ("maroon tingo anura"), checked
// once typing pauses against the cached part tables (no requests, nothing
// stored). A match selects the frog like completed dropdowns would; anything
// else is marked with an X. Like ComboBox, it reads `sel` only on mount.
export default function FrogTextInput({
  label = 'Frog ID or Name', sel, onChange, lookup,
}: {
  label?: string;
  sel: FrogSel;
  onChange: (s: FrogSel) => void;
  lookup: FrogIdLookup | null; // null until the part tables load
}) {
  const inputId = useId();
  // A frog already selected (e.g. restored from the URL) shows by name, matched.
  const [text, setText] = useState(() => (isComplete(sel) ? frogName(sel) : ''));
  const [status, setStatus] = useState<Status>(() => (isComplete(sel) ? 'ok' : 'idle'));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleInput(value: string) {
    setText(value);
    clearTimeout(timer.current);
    // Editing drops the current frog straight away, as a dropdown edit does.
    if (status === 'ok') onChange(EMPTY_FROG);
    if (value === '' || !lookup) { setStatus('idle'); return; }
    setStatus('pending');
    timer.current = setTimeout(() => {
      const match = matchFrogText(value, lookup);
      setStatus(match ? 'ok' : 'bad');
      if (match) onChange(match);
    }, DEBOUNCE_MS);
  }

  const statusText = status === 'ok' ? 'Matches a known frog' : 'This entry does not match a known frog';

  return (
    <div className="combobox-field frog-text-field">
      <label className="combobox-label" htmlFor={inputId}>{label}</label>
      <div className="combobox">
        <input
          id={inputId}
          className={`search-input combobox-input${status === 'ok' ? ' combobox-confirmed' : ''}`}
          type="text"
          value={text}
          placeholder={lookup ? '18:11:0 or Maroon Tingo Anura' : 'Loading…'}
          disabled={!lookup}
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
