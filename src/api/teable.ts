import { get, set } from 'idb-keyval';

const BASE_API = 'https://teable.cjmlax.com/api';
const BASE_URL = `${BASE_API}/table`;
const BASE_ID  = 'bseylZk8mJzj9xeoAHy';

export interface TeableRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  fields: T;
  createdTime?: string;
  lastModifiedTime?: string;
}

// Table definitions — update take values if pagination needs change
export const TABLES = {
  breeds: { id: 'tbliUWaVe4eKqJkVEv4', take: 150 },
  bases:  { id: 'tblNB8r3gnEL44kjxcF', take: 30  },
  secs:   { id: 'tbl5bLdOraLU5UDwNX2', take: 30  },
  frogs:  { id: 'tblgaaUnZGx1i61RCOZ', take: 1000 },
  weekly: { id: 'tblOuIZRVGlTPLAfM56', take: 300 },
  pairs:     { id: 'tblzV3tVS6lzwXqKZb6', take: 1000 },
  mutations: { id: 'tblZtnFsFF8dHF5pS5C', take: 1000 },
  levels: { id: 'tblD0zbgzX4vYjMPws2', take: 50  },
  changelog: { id: 'tblr5QaxStssOMP7jpR', take: 200 },
} as const;

export type TableKey = keyof typeof TABLES;

// ── Table metadata cache ───────────────────────────────────────────────────
// One GET /api/base/{id}/table call returns lastModifiedTime for all tables.
// metaFlight deduplicates concurrent fetches triggered by parallel TanStack
// Query hooks on page load; metaCache serves all subsequent calls instantly.

let metaFlight: Promise<Map<string, string>> | null = null;
let metaCache:  Map<string, string> | null = null;

async function getTableMeta(): Promise<Map<string, string>> {
  if (metaCache) return metaCache;
  if (!metaFlight) {
    metaFlight = (async () => {
      const res = await fetch(`${BASE_API}/base/${BASE_ID}/table`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Table meta fetch failed: ${res.status}`);
      const tables: { id: string; lastModifiedTime: string }[] = await res.json();
      metaCache = new Map(tables.map(t => [t.id, t.lastModifiedTime]));
      return metaCache;
    })();
  }
  return metaFlight;
}

// Exported so other pages (e.g. Downloads) can display per-table freshness
// without triggering a separate fetch — the same cached result is shared.
export const fetchTableMeta = getTableMeta;

// ── Record fetching ────────────────────────────────────────────────────────
// Validates the IndexedDB cache against the server-side lastModifiedTime.
// A cache hit costs only the shared meta call; a miss fetches all pages and
// stores the new records alongside the timestamp for next time.

export async function apiFetch<T extends Record<string, unknown>>(
  tableId: string,
  tableKey: string,
  take: number,
  query = '',
): Promise<TeableRecord<T>[]> {
  const meta     = await getTableMeta();
  const serverTs = meta.get(tableId);

  const cached = (await get(tableKey)) as
    | { records: TeableRecord<T>[]; lastModifiedTime: string }
    | undefined;

  if (cached && serverTs && cached.lastModifiedTime === serverTs) {
    console.log(`%c ${tableKey} cache valid`, 'color: #4CAF50');
    return cached.records;
  }

  let allRecords: TeableRecord<T>[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const queryString = query ? `${query}&` : '';
    const url = `${BASE_URL}/${tableId}/record?${queryString}take=${take}&skip=${skip}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API Error ${response.status} for ${tableKey}`);
    const data = await response.json();
    allRecords = allRecords.concat(data.records as TeableRecord<T>[]);
    if ((data.records as unknown[]).length < take) hasMore = false;
    else skip += take;
  }

  await set(tableKey, { records: allRecords, lastModifiedTime: serverTs ?? '' });
  return allRecords;
}

// Convenience wrapper used by TanStack Query hooks
export async function fetchTable<T extends Record<string, unknown>>(
  key: TableKey,
): Promise<TeableRecord<T>[]> {
  const { id, take } = TABLES[key];
  return apiFetch<T>(id, key, take, 'fieldKeyType=dbFieldName');
}

// ── Frog pairs & mutations ─────────────────────────────────────────────────
// Every recorded parent pair is a "Frog Pairs" record; each Chroma / Glass
// mutation it produces is a "Mutations" record linking back to it (the pair's
// screenshot covers all of its mutations). Both use display field names.

interface PairFields extends Record<string, unknown> {
  'Frog A'?:     unknown;
  'Frog B'?:     unknown;
  Verified?:     boolean;
  Screenshot?:   unknown;
  Mutations?:    unknown;
}

interface MutationFields extends Record<string, unknown> {
  'Breeding Pair'?:   unknown;
  'Mutation Type'?:   'Glass' | 'Chroma';
  'Mutation Result'?: unknown;
  'Lost Frog'?:       unknown;
}

// Titles are the frogs' Frog_ID codes (e.g. "0:18:11").
export interface FrogPair {
  id: string;
  frogAId: string | null;
  frogATitle: string | null;
  frogBId: string | null;
  frogBTitle: string | null;
  verified: boolean;
  mutationCount: number;
  screenshotCount: number;
}

// One mutation, flattened with its parent pair. Titles are the frogs' codes.
export interface Mutation {
  id: string;
  pairId: string;
  type: 'Glass' | 'Chroma';
  frogAId: string | null;
  frogATitle: string | null;
  frogBId: string | null;
  frogBTitle: string | null;
  resultId: string | null;
  resultTitle: string | null;
  lostId: string | null;
  lostTitle: string | null;
  screenshotCount: number;   // the pair's screenshots (shared by its mutations)
}

function linkRef(val: unknown): { id: string; title: string | null } | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (!first || typeof first !== 'object' || !('id' in first)) return null;
  const title = 'title' in first ? String((first as { title: unknown }).title) : null;
  return { id: String((first as { id: unknown }).id), title };
}

const attachmentCount = (val: unknown) => (Array.isArray(val) ? val.length : 0);

async function fetchPairRecords() {
  const { id, take } = TABLES.pairs;
  return apiFetch<PairFields>(id, 'pairs', take, 'fieldKeyType=name');
}

export async function fetchFrogPairs(): Promise<FrogPair[]> {
  return (await fetchPairRecords()).map(r => {
    const a = linkRef(r.fields['Frog A']), b = linkRef(r.fields['Frog B']);
    return {
      id: r.id,
      frogAId: a?.id ?? null, frogATitle: a?.title ?? null,
      frogBId: b?.id ?? null, frogBTitle: b?.title ?? null,
      verified: !!r.fields.Verified,
      mutationCount: Array.isArray(r.fields.Mutations) ? r.fields.Mutations.length : 0,
      screenshotCount: attachmentCount(r.fields.Screenshot),
    };
  });
}

export async function fetchMutations(): Promise<Mutation[]> {
  const { id, take } = TABLES.mutations;
  const [pairs, mutations] = await Promise.all([
    fetchPairRecords(),
    apiFetch<MutationFields>(id, 'mutations', take, 'fieldKeyType=name'),
  ]);
  const pairById = new Map(pairs.map(p => [p.id, p]));
  return mutations.flatMap(m => {
    const pair = pairById.get(linkRef(m.fields['Breeding Pair'])?.id ?? '');
    const type = m.fields['Mutation Type'];
    if (!pair || !type) return [];
    const a = linkRef(pair.fields['Frog A']), b = linkRef(pair.fields['Frog B']);
    const result = linkRef(m.fields['Mutation Result']), lost = linkRef(m.fields['Lost Frog']);
    return [{
      id: m.id,
      pairId: pair.id,
      type,
      frogAId: a?.id ?? null, frogATitle: a?.title ?? null,
      frogBId: b?.id ?? null, frogBTitle: b?.title ?? null,
      resultId: result?.id ?? null, resultTitle: result?.title ?? null,
      lostId: lost?.id ?? null, lostTitle: lost?.title ?? null,
      screenshotCount: attachmentCount(pair.fields.Screenshot),
    }];
  });
}

// ── Changelog ──────────────────────────────────────────────────────────────
// Small table, so visibility filtering and date sorting happen client-side —
// that keeps the whole table in the shared IndexedDB cache.

export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  platform: 'Both' | 'iOS' | 'Android';
  notes: string;
}

interface ChangelogFields extends Record<string, unknown> {
  Version?: string;
  Date?: string;
  Platform?: ChangelogEntry['platform'];
  Visible?: boolean;
  'Change Notes'?: string;
}

export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  const { id, take } = TABLES.changelog;
  const records = await apiFetch<ChangelogFields>(id, 'changelog', take, 'fieldKeyType=name');
  return records
    .filter(r => r.fields.Visible && r.fields.Version && r.fields.Date)
    .map(r => ({
      id: r.id,
      version: r.fields.Version!,
      date: r.fields.Date!,
      platform: r.fields.Platform ?? 'Both',
      notes: r.fields['Change Notes'] ?? '',
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ── Frog search ────────────────────────────────────────────────────────────
// Field IDs used to filter the frogs table (must be field IDs, not dbFieldNames)
const FROG_FILTER_FIELDS = {
  base:      'fldXRMyJJ6xZQtCB6TY', // Primary (base color link)
  secondary: 'fldBDgJwj71Rp5xS9y6', // Secondary color link
  breed:     'fldWzWOd2oEmK8vJHEQ',  // Breed link
} as const;

export interface FrogFilter {
  base?:      string; // record ID from bases table
  secondary?: string; // record ID from secs table
  breed?:     string; // record ID from breeds table
}

// Filtered frog search — not cached since every filter combo is a different query.
// TanStack Query handles in-memory deduplication keyed by the filter values.
export async function searchFrogs<T extends Record<string, unknown>>(
  filters: FrogFilter,
): Promise<TeableRecord<T>[]> {
  const filterSet: Array<{ fieldId: string; operator: string; value: string }> = [];
  if (filters.base)      filterSet.push({ fieldId: FROG_FILTER_FIELDS.base,      operator: 'is', value: filters.base });
  if (filters.secondary) filterSet.push({ fieldId: FROG_FILTER_FIELDS.secondary, operator: 'is', value: filters.secondary });
  if (filters.breed)     filterSet.push({ fieldId: FROG_FILTER_FIELDS.breed,     operator: 'is', value: filters.breed });

  const params = new URLSearchParams({ fieldKeyType: 'dbFieldName' });
  if (filterSet.length) {
    params.set('filter', JSON.stringify({ conjunction: 'and', filterSet }));
  }
  return fetchFrogPages<T>(params);
}

// Stat field IDs, for filtering on missing values
const FROG_STAT_FIELDS = {
  value:   'fldsFCJTusSBpi0mYH3',
  speed:   'fldAT1leTayFhF9nQbZ',
  stamina: 'fldbRrtQMFW7HERHSIi',
} as const;

// Every frog missing at least one of Value / Speed / Stamina. This is a small
// slice of the table (a few hundred rows), so the Submit Stats page fetches it
// whole and filters client-side. Not cached — it shrinks as submissions land.
export async function fetchIncompleteFrogs<T extends Record<string, unknown>>(): Promise<TeableRecord<T>[]> {
  const filterSet = Object.values(FROG_STAT_FIELDS).map(fieldId => ({ fieldId, operator: 'isEmpty', value: null }));
  const params = new URLSearchParams({
    fieldKeyType: 'dbFieldName',
    filter: JSON.stringify({ conjunction: 'or', filterSet }),
  });
  return fetchFrogPages<T>(params);
}

async function fetchFrogPages<T extends Record<string, unknown>>(
  params: URLSearchParams,
): Promise<TeableRecord<T>[]> {
  const take = 1000;
  let skip = 0;
  let hasMore = true;
  let allRecords: TeableRecord<T>[] = [];

  while (hasMore) {
    params.set('take', String(take));
    params.set('skip', String(skip));
    const url = `${BASE_URL}/${TABLES.frogs.id}/record?${params}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API Error ${response.status}`);
    const data = await response.json();
    allRecords = allRecords.concat(data.records as TeableRecord<T>[]);
    if ((data.records as unknown[]).length < take) hasMore = false;
    else skip += take;
  }

  return allRecords;
}

// Fetches all frogs for a breed with 24-hour IndexedDB caching to avoid
// repeat API calls — breed data changes infrequently.
export async function fetchBreedFrogs<T extends Record<string, unknown>>(
  breedId: string,
): Promise<TeableRecord<T>[]> {
  const cacheKey = `breed-frogs-${breedId}`;
  const cached = (await get(cacheKey)) as { records: TeableRecord<T>[]; ts: number } | undefined;
  if (cached && Date.now() - cached.ts < 86_400_000) {
    console.log(`%c breed-frogs-${breedId} cache hit`, 'color: #4CAF50');
    return cached.records;
  }
  const records = await searchFrogs<T>({ breed: breedId });
  await set(cacheKey, { records, ts: Date.now() });
  return records;
}

// Fetches a single frog by its Frog_ID ("0:18:11"); null when there's no match.
const FROG_ID_FIELD = 'fldXdFuyFj6NDz1qjMY';

export async function fetchFrogByFrogId<T extends Record<string, unknown>>(
  frogId: string,
): Promise<TeableRecord<T> | null> {
  const params = new URLSearchParams({
    fieldKeyType: 'dbFieldName',
    take: '1',
    filter: JSON.stringify({ conjunction: 'and', filterSet: [{ fieldId: FROG_ID_FIELD, operator: 'is', value: frogId }] }),
  });
  const response = await fetch(`${BASE_URL}/${TABLES.frogs.id}/record?${params}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`API Error ${response.status}`);
  const data = (await response.json()) as { records: TeableRecord<T>[] };
  return data.records[0] ?? null;
}

// Fetches a single frog record by its Teable record ID
export async function fetchFrogById<T extends Record<string, unknown>>(
  recordId: string,
): Promise<TeableRecord<T> | null> {
  const url = `${BASE_URL}/${TABLES.frogs.id}/record/${recordId}?fieldKeyType=dbFieldName`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`API Error ${response.status}`);
  return response.json() as Promise<TeableRecord<T>>;
}

// ── Frog summary stats ─────────────────────────────────────────────────────
// The frogs table is far too large (40k+ rows) to fetch in full just to count
// it and find the highest Value, so the home summary uses two lightweight calls:
// a row-count aggregation, and a single record sorted by Value descending. The
// sorted record yields both the max value and the record id to link to — and if
// several frogs share the max, it resolves to whichever the DB orders first.
// Value field ID: fldsFCJTusSBpi0mYH3.
const FROG_VALUE_FIELD = 'fldsFCJTusSBpi0mYH3';

export interface FrogStats {
  count: number;
  maxValue: number | null;
  topFrogs: { id: string; frogId: string; fullname: string }[]; // every frog tied at maxValue
}

// How many top-sorted records to scan for ties at the max value. The highest
// value is realistically held by only a handful of frogs, so this cap is never
// approached, but it bounds the single request.
const TOP_TIE_CAP = 50;

export async function fetchFrogStats(): Promise<FrogStats> {
  const countUrl = `${BASE_URL}/${TABLES.frogs.id}/aggregation/row-count`;
  const orderBy  = encodeURIComponent(JSON.stringify([{ fieldId: FROG_VALUE_FIELD, order: 'desc' }]));
  const topUrl   = `${BASE_URL}/${TABLES.frogs.id}/record?fieldKeyType=dbFieldName&take=${TOP_TIE_CAP}&orderBy=${orderBy}`;

  const [countRes, topRes] = await Promise.all([
    fetch(countUrl, { headers: { Accept: 'application/json' } }),
    fetch(topUrl,   { headers: { Accept: 'application/json' } }),
  ]);
  if (!countRes.ok) throw new Error(`Frog count failed: ${countRes.status}`);
  if (!topRes.ok)   throw new Error(`Frog top-value fetch failed: ${topRes.status}`);

  const countData = (await countRes.json()) as { rowCount?: number };
  const topData   = (await topRes.json()) as {
    records?: { id: string; name?: string; fields: { Value?: number; fullname?: string; Frog_ID?: string } }[];
  };

  const records  = topData.records ?? [];
  const maxValue = typeof records[0]?.fields.Value === 'number' ? records[0].fields.Value : null;
  const topFrogs = maxValue == null ? [] : records
    .filter(r => r.fields.Value === maxValue)
    .map(r => ({ id: r.id, frogId: String(r.fields.Frog_ID ?? r.name ?? ''), fullname: String(r.fields.fullname ?? r.name ?? '') }));

  return { count: countData.rowCount ?? 0, maxValue, topFrogs };
}
