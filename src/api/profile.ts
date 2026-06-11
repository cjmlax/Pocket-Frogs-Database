// Client for the worker's per-user profile endpoints. The signed-in user's OIDC
// id_token is sent as a Bearer token; the worker verifies it and keys everything
// on the Authentik subject.
import { API_BASE } from './base';

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export type FlairStatus = 'pending' | 'sent' | null;

export interface Profile {
  sub: string;
  username: string | null;
  flair: string | null;          // approved friend code (displayed)
  flair_pending: string | null;  // requested friend code while a request is active
  flair_status: FlairStatus;     // null | 'pending' (awaiting admin) | 'sent' (awaiting user confirm)
  badges: Badge[];
}

export async function fetchMe(idToken: string): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
  return res.json();
}

export interface MySubmission {
  id: string;
  type: string;
  summary: string;
  status: 'pending' | 'rejected' | 'pushed' | 'error';
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export async function fetchMySubmissions(idToken: string): Promise<MySubmission[]> {
  const res = await fetch(`${API_BASE}/api/me/submissions`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`Submissions fetch failed (${res.status})`);
  return res.json();
}

// Submits a friend code, opening a 'pending' request for admin review.
export async function submitFriendCode(idToken: string, code: string): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/me/flair`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    let detail = `Friend code submission failed (${res.status})`;
    try { const b = await res.json(); if (b?.error) detail = b.error; } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

// Cancels/withdraws an active friend-code request at any stage.
export async function cancelFriendCode(idToken: string): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/me/flair`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`Could not cancel request (${res.status})`);
  return res.json();
}

// Confirms a 'sent' request with the passphrase the admin provided out-of-band.
// Returns { ok } — ok:false means the code didn't match (not an HTTP error).
export async function confirmFriendCode(
  idToken: string, passphrase: string,
): Promise<{ ok: boolean; profile: Profile }> {
  const res = await fetch(`${API_BASE}/api/me/flair/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) {
    let detail = `Confirmation failed (${res.status})`;
    try { const b = await res.json(); if (b?.error) detail = b.error; } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json();
}
