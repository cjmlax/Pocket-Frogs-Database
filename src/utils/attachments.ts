// Origin of the Teable instance, used to absolutize relative attachment paths.
export const TEABLE_ORIGIN = 'https://teable.cjmlax.com';

// Extracts a displayable URL from a Teable attachment field. Falls back to the
// relative path (prefixed with the Teable origin) when no presigned URL exists.
export function attachmentUrl(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (!first || typeof first !== 'object') return null;
  const o = first as Record<string, unknown>;
  const url = (o.presignedUrl ?? o.url) as string | undefined;
  if (!url) return null;
  return url.startsWith('http') ? url : `${TEABLE_ORIGIN}${url}`;
}
