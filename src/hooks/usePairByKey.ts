import { useMemo } from 'react';
import type { FrogPair } from '../api/teable';
import { pairKey } from '../utils/pairStatus';

// Pair records keyed by both Frog_IDs (either order). If a pair was somehow
// recorded twice, the Verified record wins.
export function usePairByKey(pairs: FrogPair[] | undefined): Map<string, FrogPair> {
  return useMemo(() => {
    const m = new Map<string, FrogPair>();
    for (const p of pairs ?? []) {
      if (!p.frogATitle || !p.frogBTitle) continue;
      const k = pairKey(p.frogATitle, p.frogBTitle);
      if (!m.get(k)?.verified) m.set(k, p);
    }
    return m;
  }, [pairs]);
}
