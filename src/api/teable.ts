import { get, set } from 'idb-keyval';

const BASE_URL = 'https://teable.cjmlax.com/api/table';

export interface TeableRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  fields: T;
  createdTime?: string;
  lastModifiedTime?: string;
}

interface CachedResult<T extends Record<string, unknown>> {
  records: TeableRecord<T>[];
  notModified: boolean;
}

// Table definitions — update take values if pagination needs change
export const TABLES = {
  breeds: { id: 'tbliUWaVe4eKqJkVEv4', take: 150 },
  bases:  { id: 'tblNB8r3gnEL44kjxcF', take: 30 },
  secs:   { id: 'tbl5bLdOraLU5UDwNX2', take: 30 },
  frogs:  { id: 'tblgaaUnZGx1i61RCOZ', take: 1000 },
  weekly: { id: 'tblOuIZRVGlTPLAfM56', take: 300 },
  chroma: { id: 'tbluqJI6VaHK0fWiPo6', take: 200 },
  glass:  { id: 'tblaToM9WCudYNtRjaV', take: 200 },
  levels: { id: 'tblD0zbgzX4vYjMPws2', take: 50 },
} as const;

export type TableKey = keyof typeof TABLES;

export async function apiFetch<T extends Record<string, unknown>>(
  tableId: string,
  tableKey: string,
  take: number,
  query = '',
): Promise<CachedResult<T>> {
  const etagDict = ((await get('api_etags')) as Record<string, string>) ?? {};
  const savedETag = etagDict[tableId] ?? '';

  let allRecords: TeableRecord<T>[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const queryString = query ? `${query}&` : '';
    const url = `${BASE_URL}/${tableId}/record?${queryString}take=${take}&skip=${skip}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'If-None-Match': savedETag,
      },
    });

    if (response.status === 304) {
      console.log(`%c ${tableKey} cache valid (304)`, 'color: #4CAF50');
      const cached = (await get(tableKey)) as CachedResult<T> | undefined;
      return { records: cached?.records ?? [], notModified: true };
    }

    if (!response.ok) throw new Error(`API Error ${response.status} for ${tableKey}`);

    const data = await response.json();
    allRecords = allRecords.concat(data.records as TeableRecord<T>[]);

    // Only capture the ETag on the first page — it represents the whole collection
    if (skip === 0) {
      const newEtag = response.headers.get('Etag');
      if (newEtag) {
        etagDict[tableId] = newEtag;
        await set('api_etags', etagDict);
      }
    }

    if ((data.records as unknown[]).length < take) {
      hasMore = false;
    } else {
      skip += take;
    }
  }

  const result: CachedResult<T> = { records: allRecords, notModified: false };
  await set(tableKey, result);
  return result;
}

// Convenience wrapper used by TanStack Query hooks
export async function fetchTable<T extends Record<string, unknown>>(
  key: TableKey,
): Promise<TeableRecord<T>[]> {
  const { id, take } = TABLES[key];
  const result = await apiFetch<T>(id, key, take, 'fieldKeyType=dbFieldName');
  return result.records;
}

// Special-combination tables (Chroma / Glass) use display field names so the
// "Frog 1" / "Frog 2" link fields are easy to read. ETag-cached like other tables.
export async function fetchCombos<T extends Record<string, unknown>>(
  key: 'chroma' | 'glass',
): Promise<TeableRecord<T>[]> {
  const { id, take } = TABLES[key];
  const result = await apiFetch<T>(id, key, take, 'fieldKeyType=name');
  return result.records;
}

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

// Filtered frog search — no ETag caching since every filter combo is a different query.
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
