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
// A frog's Frog_ID is "Breed_ID:Base_Color_ID:Sec_Color_ID" (e.g. Maroon Tingo
// Anura = "0:18:11"), and it's the frogs table's primary field, so pair links
// carry it as their title. URLs swap the colons for dashes and join frogs with
// underscores: "0-18-11_0-18-4".

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
  return breed != null && base != null && sec != null ? `${breed}:${base}:${sec}` : null;
}

// Frog_IDs ("0:18:11") → URL value ("0-18-11_0-18-4").
export function frogIdsParam(ids: (string | null | undefined)[]): string {
  return ids
    .filter((id): id is string => !!id)
    .map(id => id.replaceAll(':', '-'))
    .join('_');
}

export function encodeFrogParam(frogs: CompleteFrogSel[], lk: FrogIdLookup): string {
  return frogIdsParam(frogs.map(f => frogId(f, lk)));
}

// Unknown or malformed codes are skipped rather than failing the whole list.
export function decodeFrogParam(param: string | null, lk: FrogIdLookup): CompleteFrogSel[] {
  if (!param) return [];
  return param.split('_').flatMap(code => {
    const [breedC, baseC, secC, extra] = code.split('-');
    if (extra !== undefined) return [];
    const breed = lk.breed.byCode.get(breedC);
    const base  = lk.base.byCode.get(baseC);
    const sec   = lk.sec.byCode.get(secC);
    return breed && base && sec ? [{ base, sec, breed }] : [];
  });
}
