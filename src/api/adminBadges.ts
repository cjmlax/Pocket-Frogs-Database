// Admin client for badge management. All calls send the signed-in user's OIDC
// id_token; the worker's requireUserAdmin gate checks the admin group.
import { API_BASE } from './base';
import type { Badge, Profile } from './profile';

export interface BadgeInput {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
}

async function req<T>(idToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { const b = await res.json(); if (b?.error) detail = String(b.error); } catch { /* keep default */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const adminListBadges = (t: string) =>
  req<Badge[]>(t, '/api/admin/badges');

export const adminSaveBadge = (t: string, badge: BadgeInput) =>
  req<{ ok: boolean; badge: Badge }>(t, '/api/admin/badges', { method: 'POST', body: JSON.stringify(badge) });

export const adminDeleteBadge = (t: string, id: string) =>
  req<{ ok: boolean }>(t, `/api/admin/badges/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const adminListUsers = (t: string) =>
  req<Profile[]>(t, '/api/admin/users');

export const adminDeleteUser = (t: string, sub: string) =>
  req<{ ok: boolean }>(t, `/api/admin/users/${encodeURIComponent(sub)}`, { method: 'DELETE' });

export const adminGrantBadge = (t: string, sub: string, badgeId: string) =>
  req<{ ok: boolean; badges: Badge[] }>(
    t, `/api/admin/users/${encodeURIComponent(sub)}/badges`,
    { method: 'POST', body: JSON.stringify({ badgeId }) },
  );

export const adminRevokeBadge = (t: string, sub: string, badgeId: string) =>
  req<{ ok: boolean; badges: Badge[] }>(
    t, `/api/admin/users/${encodeURIComponent(sub)}/badges/${encodeURIComponent(badgeId)}`,
    { method: 'DELETE' },
  );

export const adminSetFlair = (t: string, sub: string, flair: string | null) =>
  req<Profile>(
    t, `/api/admin/users/${encodeURIComponent(sub)}/flair`,
    { method: 'PUT', body: JSON.stringify({ flair }) },
  );
