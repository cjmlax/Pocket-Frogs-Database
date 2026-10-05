import type { TeableRecord } from '../api/teable';
import type { ComboOption } from '../components/ComboBox';

// A frog picked through the Base / Secondary / Breed ComboBoxes.
export interface FrogSel {
  base:  ComboOption | null;
  sec:   ComboOption | null;
  breed: ComboOption | null;
}

export type CompleteFrogSel = { [K in keyof FrogSel]: ComboOption };

export const EMPTY_FROG: FrogSel = { base: null, sec: null, breed: null };

// The Mutation Planner's cap, matching the 8 frogs a habitat holds in-game.
export const MAX_PLANNER_FROGS = 8;

export function isComplete(s: FrogSel): s is CompleteFrogSel {
  return !!(s.base && s.sec && s.breed);
}

// Matches the frogs table's `fullname` field.
export function frogName(s: CompleteFrogSel): string {
  return `${s.base.label} ${s.sec.label} ${s.breed.label}`;
}

// ── Frog_ID codes ───────────────────────────────────────────────────────────
// A frog's Frog_ID is "Base_Color_ID:Sec_Color_ID:Breed_ID", the same order the
// game uses (e.g. Maroon Tingo Anura = "18:11:0"), and it's the frogs table's
// primary field, so pair links carry it as their title. URLs use the codes
// as-is, joining frogs with underscores: /frog/18:11:0, ?frogs=18:11:0_18:4:0.
// Reading also accepts dashes in place of the colons (18-11-0).

// Normalises a Frog_ID written with colons or dashes to "18:11:0"; null if the
// text isn't one.
export function parseFrogId(text: string): string | null {
  const m = /^(\d+)[:-](\d+)[:-](\d+)$/.exec(text);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
}

interface PartLookup {
  code:   Map<string, string>;      // record id → ID code
  byCode: Map<string, ComboOption>; // ID code → option
}

export interface FrogIdLookup {
  breed: PartLookup;
  base:  PartLookup;
  sec:   PartLookup;
}

export function buildPartLookup(
  records: TeableRecord[],
  codeField: string,
  options: ComboOption[],
): PartLookup {
  const optById = new Map(options.map(o => [o.id, o]));
  const code = new Map<string, string>(), byCode = new Map<string, ComboOption>();
  for (const r of records) {
    const c = r.fields[codeField], opt = optById.get(r.id);
    if (c == null || !opt) continue;
    code.set(r.id, String(c));
    byCode.set(String(c), opt);
  }
  return { code, byCode };
}

export function frogId(s: CompleteFrogSel, lk: FrogIdLookup): string | null {
  const breed = lk.breed.code.get(s.breed.id);
  const base  = lk.base.code.get(s.base.id);
  const sec   = lk.sec.code.get(s.sec.id);
  return breed != null && base != null && sec != null ? `${base}:${sec}:${breed}` : null;
}

// Frog_IDs → URL value ("18:11:0_18:4:0").
export function frogIdsParam(ids: (string | null | undefined)[]): string {
  return ids.filter((id): id is string => !!id).join('_');
}

// Frog Detail lives at /frog/<Frog_ID>, e.g. /frog/18:11:0.
export function frogPath(frogId: string): string {
  return `/frog/${frogId}`;
}

// The Frog_ID in a /frog/:frogId URL segment, or null if it isn't one.
export function frogIdFromPath(segment: string | undefined): string | null {
  return segment ? parseFrogId(segment) : null;
}

// A one-parameter query string written by hand, because URLSearchParams would
// escape the colons (18%3A11%3A0) and the codes would no longer read as Frog_IDs.
export function frogSearch(key: string, value: string): string {
  return value ? `?${key}=${value}` : '';
}

export function encodeFrogParam(frogs: CompleteFrogSel[], lk: FrogIdLookup): string {
  return frogIdsParam(frogs.map(f => frogId(f, lk)));
}

// Unknown or malformed codes are skipped rather than failing the whole list.
export function decodeFrogParam(param: string | null, lk: FrogIdLookup): CompleteFrogSel[] {
  if (!param) return [];
  return param.split('_').flatMap(text => {
    const code = parseFrogId(text);
    if (!code) return [];
    const [baseC, secC, breedC] = code.split(':');
    const breed = lk.breed.byCode.get(breedC);
    const base  = lk.base.byCode.get(baseC);
    const sec   = lk.sec.byCode.get(secC);
    return breed && base && sec ? [{ base, sec, breed }] : [];
  });
}

// ── Text entry ──────────────────────────────────────────────────────────────
// Every Base × Secondary × Breed is a frog (23 × 16 × 124 = the frogs table's
// 45,632 rows), and Frog_ID / fullname are composed from those parts. So typed
// text is checked by walking the combinations from the cached part tables and
// comparing each whole Frog_ID or name — no frog fetches, and nothing kept.

// The frog whose Frog_ID (text of digits and colons) is exactly the text, or
// whose full name (anything else) is the text ignoring case; null if none.
export function matchFrogText(text: string, lk: FrogIdLookup): CompleteFrogSel | null {
  const byId = /^[\d:]+$/.test(text);
  const want = byId ? text : text.toLowerCase();
  const key = (code: string, opt: ComboOption) => (byId ? code : opt.label.toLowerCase());
  const bases  = [...lk.base.byCode].map(([c, o]) => [key(c, o), o] as const);
  const secs   = [...lk.sec.byCode].map(([c, o]) => [key(c, o), o] as const);
  const breeds = [...lk.breed.byCode].map(([c, o]) => [key(c, o), o] as const);
  const sep = byId ? ':' : ' ';
  for (const [b, base] of bases) {
    for (const [s, sec] of secs) {
      for (const [r, breed] of breeds) {
        if (b + sep + s + sep + r === want) return { base, sec, breed };
      }
    }
  }
  return null;
}
