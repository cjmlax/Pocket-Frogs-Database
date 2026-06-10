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

export interface Profile {
  sub: string;
  username: string | null;
  flair: string | null;         // approved friend code (displayed)
  flair_pending: string | null; // friend code awaiting admin approval
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

// Submits a friend code for admin approval (held as flair_pending server-side).
// Pass an empty string to withdraw a pending request.
export async function submitFriendCode(idToken: string, flair: string): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ flair }),
  });
  if (!res.ok) throw new Error(`Friend code submission failed (${res.status})`);
  return res.json();
}
