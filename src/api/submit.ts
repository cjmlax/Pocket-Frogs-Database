// Client for the self-hosted submission worker (pfdb-submissions). The worker
// holds submissions for review and pushes approved ones into Teable with a
// privileged token — so nothing here writes to the database directly.
import { API_BASE } from './base';

export interface ComboSubmission {
  variant:        'chroma' | 'glass';
  frog1Id:        string;
  frog2Id:        string;
  frog1Name:      string;
  frog2Name:      string;
  resultFrogId:   string;
  resultFrogName: string;
  lostFrogId?:    string;
  lostFrogName?:  string;
  sourceLink?:    string;
  versionId?:     string;
  versionName?:   string;
}

export interface FrogStatsSubmission {
  frogId:   string;
  frogName: string;
  value:    number;
  speed:    number;
  stamina:  number;
}

// Per-item outcome of a batch submit, in the order the items were sent.
export type BatchResult =
  | { index: number; ok: true;  id: string }
  | { index: number; ok: false; error: string };

// Posts many frog-stat entries in one request. Each becomes its own pending
// submission; the worker reports which were accepted and why any weren't.
export async function submitFrogStats(
  items: FrogStatsSubmission[],
  idToken?: string | null,
): Promise<BatchResult[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/submit/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ type: 'frogStats', payloads: items, hp_url: '' }),
    });
  } catch {
    throw new Error('Could not reach the submission service. Please try again later.');
  }

  let body: { results?: BatchResult[]; error?: string } = {};
  try { body = await res.json(); } catch { /* handled below */ }
  if (!res.ok) throw new Error(body.error ?? `Submission failed (HTTP ${res.status}).`);
  return body.results ?? [];
}

// Frog record IDs that already have a stats submission awaiting review.
export async function fetchPendingFrogStatIds(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/frog-stats/pending`);
  if (!res.ok) throw new Error(`Pending lookup failed (HTTP ${res.status}).`);
  return res.json() as Promise<string[]>;
}

// Posts a combo submission as multipart/form-data (so an optional screenshot can
// ride along). Pass the signed-in user's id_token to attribute the submission;
// omit it to submit anonymously. Resolves on success, throws otherwise.
export async function submitCombo(
  data: ComboSubmission,
  screenshot?: File | null,
  idToken?: string | null,
): Promise<void> {
  const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  if (screenshot && !ALLOWED.has(screenshot.type)) {
    throw new Error('Only PNG, JPEG, WebP, or GIF images are allowed.');
  }

  const form = new FormData();
  form.append('type', 'combo');
  form.append('payload', JSON.stringify(data));
  form.append('hp_url', ''); // honeypot — must stay empty
  if (screenshot) form.append('screenshot', screenshot);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/submit`, {
      method: 'POST',
      body: form,
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    });
  } catch {
    throw new Error('Could not reach the submission service. Please try again later.');
  }

  if (!res.ok) {
    let detail = `Submission failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (res.status === 413) detail = 'That screenshot is too large.';
      else if (body?.error) detail = String(body.error);
    } catch { /* keep default */ }
    throw new Error(detail);
  }
}
