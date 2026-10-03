import { API_BASE } from '../api/base';

// Teable's attachment presignedUrl carries a short-lived signed token (a few
// minutes) and the SPA's table cache only refreshes on lastModifiedTime change,
// so a directly-embedded presignedUrl is usually expired by the time it's
// rendered. Instead, build a stable proxy URL — the pfdb-submissions worker
// re-resolves a fresh presignedUrl on every hit (see its /api/image route).
export type AttachmentTable = 'breeds' | 'pairs';

export function hasAttachment(val: unknown): boolean {
  return Array.isArray(val) && val.length > 0;
}

// index picks one of several attachments in the field (the first by default).
export function imageProxyUrl(table: AttachmentTable, recordId: string, field: string, index = 0): string {
  const url = `${API_BASE}/api/image/${table}/${encodeURIComponent(recordId)}/${encodeURIComponent(field)}`;
  return index > 0 ? `${url}?i=${index}` : url;
}

// Proxy URLs for every screenshot on a Frog Pairs record.
export function pairScreenshotUrls(pairId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => imageProxyUrl('pairs', pairId, 'Screenshot', i));
}
