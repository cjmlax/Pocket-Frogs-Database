import type { FrogPair, Mutation } from '../api/teable';

// ── NoMu (no mutation) colour wheels ───────────────────────────────────────
// A wheel is one frog per base colour, all of one breed, bred together to
// complete that breed's Froggydex: every base × secondary. A pair's offspring
// take the base of one parent and the secondary of either, so the frog
// (base b, secondary s) can only come from pairing the wheel's base-b frog
// with a frog whose secondary is s — or be one of the wheel frogs themselves,
// which the player already owns.
//
// A mutation swaps one of a pair's offspring (its Lost Frog) for a Glass or
// Chroma frog, so a pair is no use for its lost frog. A wheel is complete when
// every frog is a wheel frog or comes from a Verified pair that doesn't lose
// it. Pairs that aren't recorded and Verified are unknown: they can't count
// towards a complete wheel, but a near miss may rely on them, listing them as
// the pairs still to record.
//
// Modes:
//   nomu     — every frog comes from its parents' colours; mutations only matter
//              for what they take away.
//   mutation — a Verified pair's mutation results count too, so Glass and Chroma
//              frogs can come from mutations, and the Glass frog is optional
//              (a 22-frog wheel, if mutations cover all of Glass).

export type WheelMode = 'nomu' | 'mutation';

export interface WheelInput {
  breed: string;            // Breed_ID
  bases: string[];          // every Base_Color_ID, in the order results are listed
  secs:  string[];          // every Sec_Color_ID, likewise
  glassBase: string | null; // the Glass Base_Color_ID (optional in mutation mode)
  mode:  WheelMode;
  pairs: FrogPair[];
  mutations: Mutation[];
}

export type PlanSource =
  | { kind: 'wheel' }
  | { kind: 'pair'; a: string; b: string; verified: boolean; mutation: 'Glass' | 'Chroma' | null }
  | { kind: 'none' };

// One Froggydex entry and where the plan gets it from.
export interface PlanRow {
  frog:   string; // Frog_ID
  source: PlanSource;
}

export interface WheelResult {
  frogs:        string[];           // Frog_IDs, in base order (no Glass frog if it's optional and unused)
  complete:     boolean;
  rows:         PlanRow[];          // every base × secondary, in base then secondary order
  pairCount:    number;             // distinct breeding pairs the plan uses
  toRecord:     [string, string][]; // pairs the plan needs that aren't recorded and Verified
  unobtainable: number;             // frogs no pair in the wheel can produce
}

export interface WheelAnalysis {
  recordedPairs: number;            // Verified pairs within the breed
  complete:      WheelResult[];
  nearMisses:    WheelResult[];
  truncated:     boolean;           // the complete-wheel search stopped at its limits
}

const MAX_COMPLETE = 10;
const MAX_NEAR     = 5;
const NODE_BUDGET  = 20_000; // search nodes before the complete-wheel search gives up
const RESTARTS     = 8;      // random starting wheels for the near-miss search

// Cross offspring states, from a pair's point of view.
const UNKNOWN = 0, GOOD = 1, BAD = 2;

interface MutationSource { a: number; b: number; result: number; type: 'Glass' | 'Chroma' }

export function analyzeBreed(input: WheelInput): WheelAnalysis {
  const { breed, bases, secs, mode } = input;
  const NB = bases.length, NS = secs.length, NF = NB * NS;
  const NONE = NS; // "no frog" for the optional Glass base
  const baseIdx = new Map(bases.map((c, i) => [c, i]));
  const secIdx  = new Map(secs.map((c, i) => [c, i]));
  const optional = mode === 'mutation' && input.glassBase != null ? baseIdx.get(input.glassBase) ?? -1 : -1;

  // Frogs are numbered base * NS + sec.
  const frogOf = (title: string | null): number => {
    const [b, s, r] = (title ?? '').split(':');
    const bi = baseIdx.get(b), si = secIdx.get(s);
    return r === breed && bi != null && si != null ? bi * NS + si : -1;
  };
  const idOf = (f: number) => `${bases[Math.floor(f / NS)]}:${secs[f % NS]}:${breed}`;
  const baseOf = (f: number) => Math.floor(f / NS);
  const secOf = (f: number) => f % NS;
  const pairNum = (a: number, b: number) => (a < b ? a * NF + b : b * NF + a);

  // ── Recorded data ─────────────────────────────────────────────────────────
  // Verified pairs within the breed, and what each one loses. A mutation with
  // no Lost Frog recorded could have taken either parent's value of the
  // mutated colour, so both candidates count as lost.
  const lostBy = new Map<number, Set<number>>();
  const verifiedPairIds = new Map<string, number>();
  for (const p of input.pairs) {
    if (!p.verified) continue;
    const a = frogOf(p.frogATitle), b = frogOf(p.frogBTitle);
    if (a < 0 || b < 0) continue;
    const n = pairNum(a, b);
    verifiedPairIds.set(p.id, n);
    if (!lostBy.has(n)) lostBy.set(n, new Set());
  }

  const mutationSources: MutationSource[] = [];
  for (const m of input.mutations) {
    const n = verifiedPairIds.get(m.pairId);
    if (n == null) continue;
    const a = Math.floor(n / NF), b = n % NF;
    const result = frogOf(m.resultTitle);
    const lost = lostBy.get(n)!;
    const recorded = frogOf(m.lostTitle);
    if (recorded >= 0) lost.add(recorded);
    else if (!m.lostTitle && result >= 0) {
      if (m.type === 'Chroma') {
        lost.add(baseOf(result) * NS + secOf(a));
        lost.add(baseOf(result) * NS + secOf(b));
      } else {
        lost.add(baseOf(a) * NS + secOf(result));
        lost.add(baseOf(b) * NS + secOf(result));
      }
    }
    if (result >= 0) mutationSources.push({ a, b, result, type: m.type });
  }

  // cross[a * NF + b]: can pair a × b be relied on for (base of a, sec of b)?
  const cross = new Uint8Array(NF * NF);
  const knownDegree = new Uint16Array(NF);
  for (const [n, lost] of lostBy) {
    const a = Math.floor(n / NF), b = n % NF;
    if (a === b) continue;
    cross[a * NF + b] = lost.has(baseOf(a) * NS + secOf(b)) ? BAD : GOOD;
    cross[b * NF + a] = lost.has(baseOf(b) * NS + secOf(a)) ? BAD : GOOD;
    if (baseOf(a) !== baseOf(b)) { knownDegree[a]++; knownDegree[b]++; }
  }

  const useMutations = mode === 'mutation';
  const mutationsFor = new Map<number, MutationSource[]>();
  if (useMutations) {
    for (const m of mutationSources) {
      const list = mutationsFor.get(m.result);
      if (list) list.push(m); else mutationsFor.set(m.result, [m]);
    }
  }

  const recordedPairs = lostBy.size;
  if (recordedPairs === 0) return { recordedPairs, complete: [], nearMisses: [], truncated: false };

  // ── Complete wheels: backtracking with constraint propagation ─────────────
  // dom[b] is a bitmask of the secondaries base b can still take (bit NONE:
  // no frog). A frog survives only if every frog of its base can still be
  // obtained from some frog still in play; repeated until nothing changes.
  const bit = (s: number) => 1 << s;

  function mutationPossible(dom: Int32Array, b: number, s: number, target: number): boolean {
    for (const m of mutationsFor.get(target) ?? []) {
      const ok = [m.a, m.b].every(f => (baseOf(f) === b ? secOf(f) === s : (dom[baseOf(f)] & bit(secOf(f))) !== 0));
      if (ok) return true;
    }
    return false;
  }

  function supported(dom: Int32Array, b: number, s: number): boolean {
    const fa = b * NS + s;
    for (let t = 0; t < NS; t++) {
      if (t === s) continue;
      let ok = false;
      if (s !== NONE) {
        for (let x = 0; x < NB && !ok; x++) {
          ok = x !== b && (dom[x] & bit(t)) !== 0 && cross[fa * NF + x * NS + t] === GOOD;
        }
      }
      if (!ok && useMutations) ok = mutationPossible(dom, b, s, b * NS + t);
      if (!ok) return false;
    }
    return true;
  }

  function propagate(dom: Int32Array): boolean {
    for (let changed = true; changed;) {
      changed = false;
      for (let b = 0; b < NB; b++) {
        for (let s = 0; s <= NS; s++) {
          if ((dom[b] & bit(s)) && !supported(dom, b, s)) { dom[b] &= ~bit(s); changed = true; }
        }
        if (dom[b] === 0) return false;
      }
    }
    return true;
  }

  const allSecs = bit(NS) - 1;
  const start = new Int32Array(NB).fill(allSecs);
  if (optional >= 0) start[optional] |= bit(NONE);

  const found: Int8Array[] = [];
  let nodes = 0, truncated = false;
  const popcount = (v: number) => { let c = 0; for (; v; v &= v - 1) c++; return c; };
  (function search(dom: Int32Array) {
    if (found.length >= MAX_COMPLETE * 2) { truncated = true; return; }
    if (++nodes > NODE_BUDGET) { truncated = true; return; }
    if (!propagate(dom)) return;
    let pick = -1;
    for (let b = 0; b < NB; b++) {
      const c = popcount(dom[b]);
      if (c > 1 && (pick < 0 || c < popcount(dom[pick]))) pick = b;
    }
    if (pick < 0) { found.push(Int8Array.from(dom, d => 31 - Math.clz32(d))); return; }
    // Try going without the Glass frog first, for the smallest wheels.
    for (const s of [NONE, ...Array.from({ length: NS }, (_, i) => i)]) {
      if (!(dom[pick] & bit(s))) continue;
      const child = dom.slice();
      child[pick] = bit(s);
      search(child);
    }
  })(start);

  // ── Scoring and near misses ───────────────────────────────────────────────
  // Optimistically, an unknown pair produces what it should with no mutation.
  // Score: frogs no pair could produce (weighted heavily), then frogs only
  // unknown pairs could produce.
  const status = new Uint8Array(NF);
  function score(sig: Int8Array): number {
    status.fill(0);
    for (let b = 0; b < NB; b++) {
      const s = sig[b];
      if (s === NONE) continue;
      status[b * NS + s] = 2;
      const fa = b * NS + s;
      for (let x = 0; x < NB; x++) {
        const t = sig[x];
        if (x === b || t === NONE || t === s) continue;
        const st = cross[fa * NF + x * NS + t], target = b * NS + t;
        if (st === GOOD) status[target] = 2;
        else if (st === UNKNOWN && status[target] === 0) status[target] = 1;
      }
    }
    if (useMutations) {
      for (const m of mutationSources) {
        if (sig[baseOf(m.a)] === secOf(m.a) && sig[baseOf(m.b)] === secOf(m.b)) status[m.result] = 2;
      }
    }
    let missing = 0, unknown = 0;
    for (let f = 0; f < NF; f++) {
      if (status[f] === 0) missing++;
      else if (status[f] === 1) unknown++;
    }
    return missing * 1000 + unknown;
  }

  const valuesFor = (b: number) => (b === optional ? NS + 1 : NS);
  function climb(sig: Int8Array): Int8Array {
    let cur = score(sig);
    for (;;) {
      let best = cur, bestB = -1, bestS = -1;
      for (let b = 0; b < NB; b++) {
        const keep = sig[b];
        for (let s = 0; s < valuesFor(b); s++) {
          if (s === keep) continue;
          sig[b] = s;
          const sc = score(sig);
          if (sc < best) { best = sc; bestB = b; bestS = s; }
        }
        sig[b] = keep;
      }
      if (bestB < 0) return sig;
      sig[bestB] = bestS;
      cur = best;
    }
  }

  // Seeded by breed and mode, so the same data always gives the same results.
  const rand = mulberry32(hashString(`${breed}|${mode}`));
  const starts: Int8Array[] = [];
  // Greedy: each base's frog with the most recorded partners.
  starts.push(Int8Array.from({ length: NB }, (_, b) => {
    let best = 0;
    for (let s = 1; s < NS; s++) if (knownDegree[b * NS + s] > knownDegree[b * NS + best]) best = s;
    return best;
  }));
  for (let r = 0; r < RESTARTS; r++) {
    starts.push(Int8Array.from({ length: NB }, (_, b) => {
      const recorded = Array.from({ length: NS }, (_, s) => s).filter(s => knownDegree[b * NS + s] > 0);
      const pool = recorded.length && rand() < 0.8 ? recorded : Array.from({ length: valuesFor(b) }, (_, s) => s);
      return pool[Math.floor(rand() * pool.length)];
    }));
  }

  const keyOf = (sig: Int8Array) => sig.join(',');
  const candidates = new Map<string, { sig: Int8Array; score: number }>();
  for (const sig of found) candidates.set(keyOf(sig), { sig, score: score(sig) });
  for (const s of starts) {
    const sig = climb(s);
    if (!candidates.has(keyOf(sig))) candidates.set(keyOf(sig), { sig, score: score(sig) });
  }

  // ── Breeding plans ────────────────────────────────────────────────────────
  // Every frog that isn't a wheel frog is assigned a pair, using as few pairs
  // as possible: Verified pairs wherever one will do, then as few unknown pairs
  // as possible for the rest.
  function plan(sig: Int8Array): WheelResult {
    const inWheel = (f: number) => sig[baseOf(f)] === secOf(f);
    const knownSets = new Map<number, number[]>(), unknownSets = new Map<number, number[]>();
    const viaMutation = new Map<string, 'Glass' | 'Chroma'>(); // `${pair}|${target}` reached only by mutation
    const hasKnown = new Uint8Array(NF), hasUnknown = new Uint8Array(NF);
    const add = (sets: Map<number, number[]>, n: number, target: number) => {
      const list = sets.get(n);
      if (list) { if (!list.includes(target)) list.push(target); } else sets.set(n, [target]);
    };

    for (let b = 0; b < NB; b++) {
      const s = sig[b];
      if (s === NONE) continue;
      const fa = b * NS + s;
      for (let x = 0; x < NB; x++) {
        const t = sig[x];
        if (x === b || t === NONE || t === s) continue;
        const fx = x * NS + t, target = b * NS + t, st = cross[fa * NF + fx];
        if (st === GOOD) { add(knownSets, pairNum(fa, fx), target); hasKnown[target] = 1; }
        else if (st === UNKNOWN) { add(unknownSets, pairNum(fa, fx), target); hasUnknown[target] = 1; }
      }
    }
    if (useMutations) {
      for (const m of mutationSources) {
        if (inWheel(m.result) || !inWheel(m.a) || !inWheel(m.b)) continue;
        const n = pairNum(m.a, m.b);
        const already = knownSets.get(n)?.includes(m.result);
        add(knownSets, n, m.result);
        hasKnown[m.result] = 1;
        if (!already) viaMutation.set(`${n}|${m.result}`, m.type);
      }
    }

    const universeKnown: number[] = [], universeUnknown: number[] = [];
    for (let f = 0; f < NF; f++) {
      if (inWheel(f)) continue;
      if (hasKnown[f]) universeKnown.push(f);
      else if (hasUnknown[f]) universeUnknown.push(f);
    }
    const chosen = new Map<number, number>([
      ...minSetCover(universeKnown, knownSets),
      ...minSetCover(universeUnknown, unknownSets),
    ]);

    const used = new Set(chosen.values());
    const toRecord = [...used].filter(n => !lostBy.has(n))
      .map(n => [idOf(Math.floor(n / NF)), idOf(n % NF)] as [string, string]);
    let unobtainable = 0;
    const rows: PlanRow[] = [];
    for (let f = 0; f < NF; f++) {
      let source: PlanSource;
      if (inWheel(f)) source = { kind: 'wheel' };
      else if (chosen.has(f)) {
        const n = chosen.get(f)!;
        // List the wheel's base-f parent first, so the pair reads "this × that".
        let a = Math.floor(n / NF), b = n % NF;
        if (baseOf(b) === baseOf(f) && baseOf(a) !== baseOf(f)) [a, b] = [b, a];
        source = { kind: 'pair', a: idOf(a), b: idOf(b), verified: lostBy.has(n), mutation: viaMutation.get(`${n}|${f}`) ?? null };
      } else { source = { kind: 'none' }; unobtainable++; }
      rows.push({ frog: idOf(f), source });
    }
    const frogs: string[] = [];
    for (let b = 0; b < NB; b++) if (sig[b] !== NONE) frogs.push(idOf(b * NS + sig[b]));
    return {
      frogs, rows, unobtainable, toRecord,
      pairCount: used.size,
      complete: unobtainable === 0 && toRecord.length === 0,
    };
  }

  const results = [...candidates.values()]
    .sort((x, y) => x.score - y.score)
    .slice(0, MAX_COMPLETE * 2 + MAX_NEAR)
    .map(c => plan(c.sig));
  const byFrogsThenPairs = (x: WheelResult, y: WheelResult) =>
    x.frogs.length - y.frogs.length || x.pairCount - y.pairCount;
  return {
    recordedPairs,
    complete: results.filter(r => r.complete).sort(byFrogsThenPairs).slice(0, MAX_COMPLETE),
    nearMisses: results.filter(r => !r.complete)
      .sort((x, y) => x.unobtainable - y.unobtainable || x.toRecord.length - y.toRecord.length || byFrogsThenPairs(x, y))
      .slice(0, MAX_NEAR),
    truncated,
  };
}

// ── Minimum set cover ───────────────────────────────────────────────────────
// Each pair covers at most two frogs by inheritance (a third only through a
// mutation), so: take pairs a frog can't do without, then any pair still
// covering three or more (greedily), and solve what's left exactly — with
// every pair covering at most two frogs, the fewest pairs is the frog count
// minus a maximum matching between frogs that share a pair.
// Returns frog → chosen set (pair number).
export function minSetCover(universe: number[], sets: Map<number, number[]>): Map<number, number> {
  const chosen = new Map<number, number>();
  const uncovered = new Set(universe);
  const members = new Map<number, Set<number>>(); // set → frogs it still covers
  const setsOf = new Map<number, number[]>();     // frog → sets covering it
  for (const [id, list] of sets) {
    const m = new Set(list.filter(t => uncovered.has(t)));
    if (m.size === 0) continue;
    members.set(id, m);
    for (const t of m) {
      const l = setsOf.get(t);
      if (l) l.push(id); else setsOf.set(t, [id]);
    }
  }
  const take = (id: number) => {
    for (const t of [...members.get(id)!]) {
      chosen.set(t, id);
      uncovered.delete(t);
      for (const o of setsOf.get(t)!) members.get(o)!.delete(t);
    }
  };

  for (;;) {
    let forced = -1;
    for (const t of uncovered) {
      const l = setsOf.get(t);
      if (l?.length === 1) { forced = l[0]; break; }
    }
    if (forced >= 0) { take(forced); continue; }
    let best = -1, bestSize = 2;
    for (const [id, m] of members) if (m.size > bestSize) { best = id; bestSize = m.size; }
    if (best >= 0) { take(best); continue; }
    break;
  }

  const verts = [...uncovered].filter(t => setsOf.has(t));
  const index = new Map(verts.map((t, i) => [t, i]));
  const adj: number[][] = verts.map(() => []);
  const edgeSet = new Map<number, number>();
  for (const [id, m] of members) {
    if (m.size !== 2) continue;
    const [u, v] = [...m].map(t => index.get(t)!);
    const key = Math.min(u, v) * verts.length + Math.max(u, v);
    if (edgeSet.has(key)) continue;
    edgeSet.set(key, id);
    adj[u].push(v);
    adj[v].push(u);
  }
  const match = maxMatching(verts.length, adj);
  for (let u = 0; u < verts.length; u++) {
    const v = match[u];
    if (v > u && uncovered.has(verts[u])) take(edgeSet.get(u * verts.length + v)!);
  }
  for (const t of [...uncovered]) {
    const id = setsOf.get(t)?.[0];
    if (id != null) take(id);
  }
  return chosen;
}

// Maximum matching in a general graph (Edmonds' blossom algorithm, O(V³)).
// Returns each vertex's partner, or -1.
export function maxMatching(n: number, adj: number[][]): Int32Array {
  const match = new Int32Array(n).fill(-1);
  const p = new Int32Array(n), base = new Int32Array(n), q = new Int32Array(n);
  const used = new Uint8Array(n), blossom = new Uint8Array(n), seen = new Uint8Array(n);

  function lca(a: number, b: number): number {
    seen.fill(0);
    for (;;) {
      a = base[a];
      seen[a] = 1;
      if (match[a] === -1) break;
      a = p[match[a]];
    }
    for (;;) {
      b = base[b];
      if (seen[b]) return b;
      b = p[match[b]];
    }
  }
  function markPath(v: number, b: number, child: number) {
    while (base[v] !== b) {
      blossom[base[v]] = blossom[base[match[v]]] = 1;
      p[v] = child;
      child = match[v];
      v = p[match[v]];
    }
  }
  function findPath(root: number): number {
    used.fill(0);
    p.fill(-1);
    for (let i = 0; i < n; i++) base[i] = i;
    used[root] = 1;
    let head = 0, tail = 0;
    q[tail++] = root;
    while (head < tail) {
      const v = q[head++];
      for (const to of adj[v]) {
        if (base[v] === base[to] || match[v] === to) continue;
        if (to === root || (match[to] !== -1 && p[match[to]] !== -1)) {
          const cur = lca(v, to);
          blossom.fill(0);
          markPath(v, cur, to);
          markPath(to, cur, v);
          for (let i = 0; i < n; i++) {
            if (blossom[base[i]]) {
              base[i] = cur;
              if (!used[i]) { used[i] = 1; q[tail++] = i; }
            }
          }
        } else if (p[to] === -1) {
          p[to] = v;
          if (match[to] === -1) return to;
          used[match[to]] = 1;
          q[tail++] = match[to];
        }
      }
    }
    return -1;
  }

  for (let v = 0; v < n; v++) {
    if (match[v] !== -1) continue;
    for (const to of adj[v]) {
      if (match[to] === -1) { match[to] = v; match[v] = to; break; }
    }
  }
  for (let v = 0; v < n; v++) {
    if (match[v] !== -1) continue;
    for (let u = findPath(v); u !== -1;) {
      const pv = p[u], next = match[pv];
      match[u] = pv;
      match[pv] = u;
      u = next;
    }
  }
  return match;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
