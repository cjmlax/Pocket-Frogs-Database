// Circled check / X: a verified breeding pair, or a matched frog name/ID.
export default function IconVerified({ ok }: { ok: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      {ok
        ? <polyline points="8 12 11 15 16 9"/>
        : <><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}
    </svg>
  );
}
