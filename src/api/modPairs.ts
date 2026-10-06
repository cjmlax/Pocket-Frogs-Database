// Mod client for recording no-mutation pairs (Mutation Planner → Verify). The
// worker's requireUserMod gate checks the mod group; pairs are sent as Frog_IDs.
import { API_BASE } from './base';

export interface ClearPair {
  frogA: string; // Frog_ID, e.g. "18:11:0"
  frogB: string;
}

export type PairCheck = { ok: true } | { ok: false; error: string };

async function post<T>(idToken: string, path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the submission service.');
  }
  let data: { error?: string } = {};
  try { data = await res.json(); } catch { /* handled below */ }
  if (res.status === 401) throw new Error('Your sign-in has expired. Sign in again and retry.');
  if (res.status === 403) throw new Error('Only moderators can verify pairs.');
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

// Which pairs can be recorded, and why the rest can't (same order as sent),
// plus the game version they'd be recorded against.
export function checkClearPairs(idToken: string, pairs: ClearPair[]): Promise<{ version: string; results: PairCheck[] }> {
  return post(idToken, '/api/mod/pairs/check', { pairs });
}

// Records one pair as Verified with no mutations.
export async function verifyClearPair(idToken: string, pair: ClearPair): Promise<void> {
  await post(idToken, '/api/mod/pairs/verify', pair);
}
