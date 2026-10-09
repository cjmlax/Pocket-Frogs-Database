import { useEffect, useRef, useState } from 'react';
import { checkClearPairs, verifyClearPair, type ClearPair } from '../api/modPairs';

export interface VerifyPairItem extends ClearPair {
  key:   string;
  label: string; // "Maroon Tingo Anura × Maroon Tingo Anura"
}

type RowState =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'flagged'; error: string } // refused by the check; never sent
  | { kind: 'sending' }
  | { kind: 'done' }
  | { kind: 'failed'; error: string };

interface Row { item: VerifyPairItem; state: RowState }

// How long a verified row stays on screen, with its check, before it clears.
const CLEAR_AFTER_MS = 3000;
// Pairs per check request — the worker's limit.
const CHECK_BATCH = 64;
// Pairs sent at once while verifying.
const SEND_LIMIT = 3;

// "Are you sure?" for Verify mode (Mutation Planner, Pair Tree). Opens by checking
// every picked pair with the worker, flagging any that can't be recorded
// (already verified, leftover data, a combo pending review…). Accept then sends
// the rest one by one: each shows a check as it lands, then clears. Decline
// closes back to Verify mode with the selection intact.
export default function VerifyPairsDialog({
  items, idToken, onClose, onVerified, onSent, onEmpty,
}: {
  items:      VerifyPairItem[];
  idToken:    string;
  onClose:    () => void;
  onVerified: (key: string) => void; // recorded — drop it from the selection
  onSent:     () => void;            // a send run finished (refresh the pairs)
  onEmpty:    () => void;            // every pair recorded and cleared
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map(item => ({ item, state: { kind: 'checking' } })));
  const [version, setVersion] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const timers = useRef<number[]>([]);

  const setState = (key: string, state: RowState) =>
    setRows(prev => prev.map(r => (r.item.key === key ? { ...r, state } : r)));

  useEffect(() => {
    let cancelled = false;
    // Checked a batch at a time (the worker takes up to CHECK_BATCH per call),
    // each batch's rows updating as its results arrive.
    (async () => {
      for (let start = 0; start < items.length; start += CHECK_BATCH) {
        const batch = items.slice(start, start + CHECK_BATCH);
        const { version, results } = await checkClearPairs(idToken, batch.map(({ frogA, frogB }) => ({ frogA, frogB })));
        if (cancelled) return;
        setVersion(version);
        const states = new Map(batch.map((item, i): [string, RowState] => {
          const r = results[i];
          return [item.key, !r ? { kind: 'flagged', error: 'No result.' } : r.ok ? { kind: 'ready' } : { kind: 'flagged', error: r.error }];
        }));
        setRows(prev => prev.map(row => (states.has(row.item.key) ? { ...row, state: states.get(row.item.key)! } : row)));
      }
    })().catch(e => { if (!cancelled) setCheckError((e as Error).message); });
    return () => { cancelled = true; };
    // Checked once, for the pairs picked when the dialog opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Closes once every pair has been recorded and cleared from view.
  const empty = rows.length === 0;
  useEffect(() => { if (empty) onEmpty(); }, [empty, onEmpty]);

  async function accept() {
    const queue = rows.filter(r => r.state.kind === 'ready').map(r => r.item);
    if (queue.length === 0) return;
    setSending(true);
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next++];
        setState(item.key, { kind: 'sending' });
        try {
          await verifyClearPair(idToken, { frogA: item.frogA, frogB: item.frogB });
          setState(item.key, { kind: 'done' });
          onVerified(item.key);
          timers.current.push(window.setTimeout(
            () => setRows(prev => prev.filter(r => r.item.key !== item.key)),
            CLEAR_AFTER_MS,
          ));
        } catch (e) {
          setState(item.key, { kind: 'failed', error: (e as Error).message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(SEND_LIMIT, queue.length) }, worker));
    setSending(false);
    onSent();
  }

  const checking = rows.some(r => r.state.kind === 'checking') && !checkError;
  const ready = rows.filter(r => r.state.kind === 'ready').length;
  const flagged = rows.filter(r => r.state.kind === 'flagged' || r.state.kind === 'failed').length;
  const close = () => { if (!sending) onClose(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="lightbox-overlay" onClick={close}>
      <div
        className="crop-modal verify-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-title"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="verify-title">Verify {items.length === 1 ? 'this pair' : `these ${items.length} pairs`}?</h2>
        <p className="search-hint">
          {checkError ? checkError
            : checking ? 'Checking pairs…'
            : <>Each pair is recorded as Verified with <strong>no mutations</strong>
              {version && <> on version {version}</>}. This can only be undone in Teable.</>}
        </p>
        {!checking && flagged > 0 && (
          <p className="verify-flag-note">
            {flagged === 1 ? '1 pair' : `${flagged} pairs`} can't be recorded and will be skipped.
          </p>
        )}

        <ul className="verify-list">
          {rows.map(({ item, state }) => (
            <li key={item.key} className={`verify-row is-${state.kind}`}>
              <span className="verify-status" aria-hidden="true">
                {state.kind === 'done' ? '✓'
                  : state.kind === 'flagged' || state.kind === 'failed' ? '!'
                  : state.kind === 'ready' ? '•' : '…'}
              </span>
              <span className="verify-label">{item.label}</span>
              {(state.kind === 'flagged' || state.kind === 'failed') && (
                <span className="verify-error">{state.error}</span>
              )}
              {state.kind === 'done' && <span className="verify-ok">Verified</span>}
            </li>
          ))}
        </ul>

        <div className="crop-footer">
          <span />
          <div className="crop-buttons">
            <button type="button" className="csv-btn" onClick={accept} disabled={sending || checking || ready === 0}>
              {sending ? 'Verifying…' : ready === 0 ? 'Accept' : `Accept (${ready})`}
            </button>
            <button type="button" className="csv-btn" onClick={close} disabled={sending}>Decline</button>
          </div>
        </div>
      </div>
    </div>
  );
}
