// Client for site-wide announcement banners (maintenance notices, known-broken
// features, etc.). The public endpoint is unauthenticated; admin calls send the
// signed-in user's OIDC id_token, gated by the worker's requireUserAdmin check.
import { API_BASE } from './base';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface SiteAlert {
  id: string;
  message: string;
  level: AlertLevel;
  createdAt: string;
}

export interface AdminAlert extends SiteAlert {
  active: boolean;
  updatedAt: string;
}

export async function fetchActiveAlerts(): Promise<SiteAlert[]> {
  const res = await fetch(`${API_BASE}/api/alerts`);
  if (!res.ok) throw new Error(`Alerts fetch failed (${res.status})`);
  return res.json();
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

export const adminListAlerts = (t: string) =>
  req<AdminAlert[]>(t, '/api/admin/alerts');

export const adminCreateAlert = (t: string, message: string, level: AlertLevel) =>
  req<{ ok: boolean; alert: AdminAlert }>(t, '/api/admin/alerts', {
    method: 'POST', body: JSON.stringify({ message, level }),
  });

export const adminUpdateAlert = (
  t: string, id: string, patch: { message?: string; level?: AlertLevel; active?: boolean },
) =>
  req<{ ok: boolean; alert: AdminAlert }>(t, `/api/admin/alerts/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  });

export const adminDeleteAlert = (t: string, id: string) =>
  req<{ ok: boolean }>(t, `/api/admin/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
