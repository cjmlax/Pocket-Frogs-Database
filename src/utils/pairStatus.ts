import type { FrogPair } from '../api/teable';

// Pair status shared by the Mutation Planner and Pair Tree.
// Grey: no pair record, or one that isn't Verified (its data implies nothing).
// Green: Verified with no mutations. Yellow: Verified and produces a mutation.
export type LineStatus = 'unknown' | 'clear' | 'mutation';

export const STATUS_TEXT: Record<LineStatus, string> = {
  unknown:  'Not verified',
  clear:    'Verified, no mutations',
  mutation: 'Verified, produces a mutation',
};

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// A frog with itself is a pair too (its record has the same frog as Frog A and Frog B).
export function pairStatusById(pairByKey: Map<string, FrogPair>, a: string | null, b: string | null): LineStatus {
  const pair = a && b ? pairByKey.get(pairKey(a, b)) : undefined;
  return !pair?.verified ? 'unknown' : pair.mutationCount > 0 ? 'mutation' : 'clear';
}
