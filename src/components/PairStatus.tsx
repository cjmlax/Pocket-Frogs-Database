import { STATUS_TEXT, type LineStatus } from '../utils/pairStatus';

// Warning triangle for mutation pairs — a different shape from the round
// ✓ / ? marks, so it doesn't lean on colour alone.
function IconWarning() {
  return (
    <svg viewBox="0 0 24 22" aria-hidden="true">
      <path d="M12 1.5 22.8 20.5H1.2Z" fill="var(--code-bg)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <line x1="12" y1="8" x2="12" y2="13.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="1.25" fill="currentColor"/>
    </svg>
  );
}

// A pair's status mark: ✓, ?, or the warning triangle.
export function StatusMark({ status }: { status: LineStatus }) {
  return status === 'mutation' ? <IconWarning /> : status === 'clear' ? '✓' : '?';
}

export function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
    </svg>
  );
}

// A pair's mark in Verify mode: a toggle for pairs not yet verified, inert for the rest.
export function VerifyMark({ status, pickable, picked, label, onToggle, ...rest }: {
  status:    LineStatus;
  pickable:  boolean;
  picked:    boolean;
  label:     string;
  onToggle:  () => void;
  className: string;
  style?:    React.CSSProperties;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?:      () => void;
  onBlur?:       () => void;
}) {
  if (!pickable) {
    return (
      <span {...rest} role="img" aria-label={`${label}: ${STATUS_TEXT[status]}`} title={STATUS_TEXT[status]}>
        <StatusMark status={status} />
      </span>
    );
  }
  return (
    <button type="button" {...rest} onClick={onToggle} aria-pressed={picked}
      aria-label={`${label}: ${picked ? 'marked as no mutations' : 'not verified'}. Toggle.`}
      title={picked ? 'Marked as no mutations. Select to undo.' : 'Select to mark as no mutations.'}>
      <StatusMark status={status} />
    </button>
  );
}
