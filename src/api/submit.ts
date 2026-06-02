// Client for the self-hosted submission worker (pfdb-submissions). The worker
// holds submissions for review and pushes approved ones into Teable with a
// privileged token — so nothing here writes to the database directly.
//
// Override the base URL at build time with VITE_SUBMIT_API.
const SUBMIT_API = (import.meta.env.VITE_SUBMIT_API ?? 'https://pfdb-api.cjmlax.com').replace(/\/$/, '');

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
}

// Posts a combo submission as multipart/form-data (so an optional screenshot can
// ride along). Resolves on success, throws with a readable message otherwise.
export async function submitCombo(data: ComboSubmission, screenshot?: File | null): Promise<void> {
  const form = new FormData();
  form.append('type', 'combo');
  form.append('payload', JSON.stringify(data));
  form.append('hp_url', ''); // honeypot — must stay empty
  if (screenshot) form.append('screenshot', screenshot);

  let res: Response;
  try {
    res = await fetch(`${SUBMIT_API}/api/submit`, { method: 'POST', body: form });
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
