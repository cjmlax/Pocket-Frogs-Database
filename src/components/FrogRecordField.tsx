import { useEffect, useId, useRef, useState } from 'react';
import IconVerified from './IconVerified';
import type { CompleteFrogSel } from '../utils/frogIds';

const DEBOUNCE_MS = 600;

export type FrogState = 'empty' | 'loading' | 'bad' | 'resolving' | 'ok';

// A typed frog after resolution: its parts, and the frog record they name.
export interface ResolvedFrog {
  state:  FrogState;
  sel:    CompleteFrogSel | null;
  record: { id: string; name: string } | null;
}

// One frog: free text in, a matched record out. The typed text is handed up
// once typing pauses; the status icon reflects the parent's resolution of it.
export default function FrogRecordField({
  label, optional, text, frog, disabled, onCommit,
}: {
  label: string;
  optional?: boolean;
  text: string;          // the committed text the frog was resolved from
  frog: ResolvedFrog;
  disabled: boolean;
  onCommit: (text: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function handleInput(value: string) {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(value), DEBOUNCE_MS);
  }

  const settled = draft === text;
  const state = settled ? frog.state : 'resolving';
  const statusText = state === 'ok' ? `Linked to record ${frog.record?.id}` : "Doesn't match a known frog";
  // Typing a Frog_ID (or odd casing) is fine — show the name it resolved to.
  const resolvedHint = state === 'ok' && frog.record && frog.record.name !== draft.trim() ? frog.record.name : null;

  return (
    <div className="submission-edit-label">
      <label htmlFor={inputId}>
        {label}{optional && <span className="submit-optional"> (optional)</span>}
      </label>
      <div className="combobox">
        <input
          id={inputId}
          className={`search-input combobox-input${state === 'ok' ? ' combobox-confirmed' : ''}`}
          type="text"
          value={draft}
          placeholder={disabled ? 'Loading…' : optional ? 'None' : 'Frog name or Frog_ID'}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state === 'bad'}
          onChange={e => handleInput(e.target.value)}
          onBlur={() => { if (!settled) { clearTimeout(timer.current); onCommit(draft); } }}
        />
        {(state === 'ok' || state === 'bad') && (
          <span className={`frog-text-status is-${state}`} role="img" aria-label={statusText} title={statusText}>
            <IconVerified ok={state === 'ok'} />
          </span>
        )}
      </div>
      {resolvedHint && <span className="submission-edit-hint">→ {resolvedHint}</span>}
    </div>
  );
}
