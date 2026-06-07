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
  flair: string | null;
  badges: Badge[];
}

export async function fetchMe(idToken: string): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
  return res.json();
}

export async function updateFlair(idToken: string, flair: string): Promise<Profile> {
  const res = await fetch(`${API_BASE}/api/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ flair }),
  });
  if (!res.ok) throw new Error(`Flair update failed (${res.status})`);
  return res.json();
}
