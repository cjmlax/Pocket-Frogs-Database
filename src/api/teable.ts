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

// ── Weekly set availability ────────────────────────────────────────────────
// Field ID for "Year/Set Identifier" in the weekly table (fld0g2OJuIM4fScLjfS).
// Computed client-side using the same ET timezone + Monday 2pm cutoff as the server.

function getCurrentISOWeek(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    weekday: 'long', hour: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const year    = parseInt(get('year'),  10);
  const month   = parseInt(get('month'), 10);
  const day     = parseInt(get('day'),   10);
  const weekday = get('weekday');
  const hour    = parseInt(get('hour') || '12', 10) % 24;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (weekday === 'Monday' && hour < 14) d.setUTCDate(d.getUTCDate() - 7);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

export async function checkWeeklyStatus(): Promise<{ week: string; exists: boolean }> {
  const week = getCurrentISOWeek();
  const filter = JSON.stringify({
    conjunction: 'and',
    filterSet: [{ fieldId: 'fld0g2OJuIM4fScLjfS', operator: 'is', value: week }],
  });
  const url = `${BASE_URL}/${TABLES.weekly.id}/record?fieldKeyType=id&take=1&filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Weekly status check failed: ${res.status}`);
  const data = (await res.json()) as { records?: unknown[] };
  return { week, exists: (data.records?.length ?? 0) > 0 };
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
