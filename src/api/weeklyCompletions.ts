// Client for the per-user "completed" flag on Weekly Sets. Ids are Teable
// record ids; the worker keys everything on the signed-in user's OIDC sub.
import { API_BASE } from './base';

async function req(idToken: string, path: string, init?: RequestInit): Promise<string[]> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${idToken}`, ...init?.headers },
  });
  if (!res.ok) throw new Error(`Weekly completions request failed (${res.status})`);
  return res.json();
}

export const fetchWeeklyCompletions = (idToken: string) =>
  req(idToken, '/api/me/weekly-completions');

export const markWeeklyCompleted = (idToken: string, id: string) =>
  req(idToken, `/api/me/weekly-completions/${encodeURIComponent(id)}`, { method: 'PUT' });

export const clearWeeklyCompleted = (idToken: string, id: string) =>
  req(idToken, `/api/me/weekly-completions/${encodeURIComponent(id)}`, { method: 'DELETE' });
