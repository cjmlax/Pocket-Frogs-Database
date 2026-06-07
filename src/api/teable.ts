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
  chroma: { id: 'tbluqJI6VaHK0fWiPo6', take: 200 },
  glass:  { id: 'tblaToM9WCudYNtRjaV', take: 200 },
  levels: { id: 'tblD0zbgzX4vYjMPws2', take: 50  },
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

// Special-combination tables (Chroma / Glass) use display field names so the
// "Frog 1" / "Frog 2" link fields are easy to read.
export async function fetchCombos<T extends Record<string, unknown>>(
  key: 'chroma' | 'glass',
): Promise<TeableRecord<T>[]> {
  const { id, take } = TABLES[key];
  return apiFetch<T>(id, key, take, 'fieldKeyType=name');
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
  topFrogs: { id: string; fullname: string }[]; // every frog tied at maxValue
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
    records?: { id: string; name?: string; fields: { Value?: number; fullname?: string } }[];
  };

  const records  = topData.records ?? [];
  const maxValue = typeof records[0]?.fields.Value === 'number' ? records[0].fields.Value : null;
  const topFrogs = maxValue == null ? [] : records
    .filter(r => r.fields.Value === maxValue)
    .map(r => ({ id: r.id, fullname: String(r.fields.fullname ?? r.name ?? '') }));

  return { count: countData.rowCount ?? 0, maxValue, topFrogs };
}
