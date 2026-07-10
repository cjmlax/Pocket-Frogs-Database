// Admin client for the submission review queue. All calls send the signed-in
// user's OIDC id_token; the worker's requireUserAdmin gate checks the admin group.
import { API_BASE } from './base';

export interface PendingSubmission {
  id: string;
  type: string;
  payload: string;            // JSON string of the submission's fields
  summary: string;
  submitterNote: string | null;
  submitter: string | null;   // display name, or null for anonymous
  screenshot: string | null;  // URL path, e.g. /api/admin/uploads/<file>
  createdAt: string;
}

function authed(idToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${idToken}`, ...init?.headers },
  });
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { const b = await res.json(); detail = b.detail || b.error || detail; } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function listPending(idToken: string): Promise<PendingSubmission[]> {
  return asJson(await authed(idToken, '/api/admin/pending'));
}

// ── Friend-code (flair) requests ─────────────────────────────────────────────

export interface FlairRequest {
  sub: string;
  username: string | null;
  code: string | null;          // the requested in-game friend code
  status: 'pending' | 'sent';
  passphrase: string | null;    // admin-set confirmation code (null until Sent)
  senderCode: string | null;    // sending admin/mod's own Friend Code (null until Sent)
  requestedAt: string | null;
}

export async function listFlairRequests(idToken: string): Promise<FlairRequest[]> {
  return asJson(await authed(idToken, '/api/admin/flair-requests'));
}

// Mark the in-game friend request as Sent, set the confirmation passphrase, and
// record the sender's own Friend Code (shown to the user so they can verify
// who the gift is from).
export async function markFlairSent(idToken: string, sub: string, passphrase: string, senderCode: string) {
  return asJson<{ ok: boolean }>(
    await authed(idToken, `/api/admin/flair-requests/${encodeURIComponent(sub)}/sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase, senderCode }),
    }),
  );
}

// Deny (clear) a friend-code request at any stage.
export async function denyFlairRequest(idToken: string, sub: string) {
  return asJson<{ ok: boolean }>(
    await authed(idToken, `/api/admin/flair-requests/${encodeURIComponent(sub)}/deny`, { method: 'POST' }),
  );
}

export async function approveSubmission(idToken: string, id: string) {
  return asJson<{ ok: boolean; pushed_ref: string | null }>(
    await authed(idToken, `/api/admin/${id}/approve`, { method: 'POST' }),
  );
}

export async function rejectSubmission(idToken: string, id: string, note: string) {
  return asJson<{ ok: boolean }>(
    await authed(idToken, `/api/admin/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }),
  );
}

export async function editSubmission(
  idToken: string,
  id: string,
  payload: Record<string, string>,
  screenshot: File | null,
  clearScreenshot: boolean,
) {
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  if (screenshot) fd.append('screenshot', screenshot);
  if (clearScreenshot) fd.append('clearScreenshot', '1');
  // No Content-Type header — the browser sets the multipart boundary.
  return asJson<{ ok: boolean; summary: string }>(
    await authed(idToken, `/api/admin/${id}`, { method: 'PATCH', body: fd }),
  );
}

export async function cropScreenshot(
  idToken: string,
  id: string,
  region: { left: number; top: number; right: number; bottom: number },
) {
  return asJson<{ ok: boolean; screenshot: string }>(
    await authed(idToken, `/api/admin/${id}/crop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(region),
    }),
  );
}

// Screenshots are admin-gated, so an <img src> can't load them directly (no way
// to attach the bearer token). Fetch the bytes and hand back an object URL.
export async function fetchImageObjectUrl(idToken: string, url: string): Promise<string> {
  const res = await authed(idToken, url);
  if (!res.ok) throw new Error(`Image failed (${res.status})`);
  return URL.createObjectURL(await res.blob());
}
