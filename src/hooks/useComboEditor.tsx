import { useMemo, useState, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchBreedFrogs, fetchChangelog } from '../api/teable';
import FrogRecordField, { type FrogState, type ResolvedFrog } from '../components/FrogRecordField';
import { useFrogOptions } from './useFrogOptions';
import { frogName, matchFrogText, type CompleteFrogSel } from '../utils/frogIds';

// Admin editor for a pending Chroma / Glass combination. Each frog is one text
// box taking a full name or Frog_ID (like the site's text-entry option); a
// match is resolved to its frog record, and the record's id and name are saved
// together — so a payload can never name one frog while linking another.
// Variant and version are dropdowns, and the pair / outcome traits are checked
// the same way the public form constrains them, so Save only sends data the
// worker will accept.

const DAY = 1000 * 60 * 60 * 24;

type Variant = 'glass' | 'chroma';
type Role = 'frog1' | 'frog2' | 'result' | 'lost';

const FROGS: { role: Role; label: string; idKey: string; nameKey: string; optional?: boolean }[] = [
  { role: 'frog1',  label: 'Parent 1',              idKey: 'frog1Id',      nameKey: 'frog1Name' },
  { role: 'frog2',  label: 'Parent 2',              idKey: 'frog2Id',      nameKey: 'frog2Name' },
  { role: 'result', label: 'Result (mutated frog)', idKey: 'resultFrogId', nameKey: 'resultFrogName' },
  { role: 'lost',   label: 'Lost frog (replaced)',  idKey: 'lostFrogId',   nameKey: 'lostFrogName', optional: true },
];

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// The traits a mutation changes: Glass replaces the base color, Chroma the secondary.
const MUTATED = { glass: 'base', chroma: 'sec' } as const;
const MUTATION_LABEL = { glass: 'Glass', chroma: 'Chroma' } as const;
const TRAIT_LABEL = { base: 'base color', sec: 'secondary color', breed: 'breed' } as const;

// The first thing wrong with the combination's frogs, or null. Mirrors what the
// public form allows: the result carries the mutation color, the lost frog is
// the result with its original color, and outcome traits come from a parent.
function traitProblem(variant: Variant, f: Record<Role, ResolvedFrog>): string | null {
  const [p1, p2, result, lost] = [f.frog1.sel, f.frog2.sel, f.result.sel, f.lost.sel];
  if (!p1 || !p2 || !result) return null;
  const mutated = MUTATED[variant];
  const tag = MUTATION_LABEL[variant];

  if (result[mutated].label !== tag) {
    return `A ${tag} result needs ${tag} as its ${TRAIT_LABEL[mutated]}.`;
  }
  // Traits that must come from the parents: every trait of the lost frog, or
  // without one, the result's unmutated traits.
  const fromParents = lost ?? result;
  for (const t of ['base', 'sec', 'breed'] as const) {
    if (!lost && t === mutated) continue;
    if (fromParents[t].id !== p1[t].id && fromParents[t].id !== p2[t].id) {
      return `The ${lost ? 'lost frog' : 'result'}'s ${TRAIT_LABEL[t]} (${fromParents[t].label}) isn't from either parent.`;
    }
  }
  if (lost) {
    if (lost[mutated].label === tag) return `The lost frog can't already be ${tag}.`;
    for (const t of ['base', 'sec', 'breed'] as const) {
      if (t !== mutated && lost[t].id !== result[t].id) {
        return `The lost frog and result must share their ${TRAIT_LABEL[t]}.`;
      }
    }
  }
  return null;
}

export function useComboEditor(initial: Record<string, unknown>): {
  node: ReactNode;
  payload: Record<string, unknown> | null; // null while anything is invalid or unresolved
  problem: string | null;
} {
  const { lookup } = useFrogOptions();

  const [variant, setVariant] = useState<Variant | ''>(
    initial.variant === 'glass' || initial.variant === 'chroma' ? initial.variant : '',
  );
  const [texts, setTexts] = useState<Record<Role, string>>(() => ({
    frog1:  str(initial.frog1Name),
    frog2:  str(initial.frog2Name),
    result: str(initial.resultFrogName),
    lost:   str(initial.lostFrogName),
  }));
  const [version, setVersion] = useState(str(initial.versionName));
  const [source, setSource] = useState(str(initial.sourceLink));

  // Typed text → frog parts (walks the cached part tables; no requests).
  const sels = useMemo(() => {
    const out = {} as Record<Role, CompleteFrogSel | null>;
    for (const { role } of FROGS) {
      const t = texts[role].trim();
      out[role] = t && lookup ? matchFrogText(t, lookup) : null;
    }
    return out;
  }, [texts, lookup]);

  // Frog parts → frog record, via its breed's frogs (the shared 24h cache).
  const breedQueries = useQueries({
    queries: FROGS.map(({ role }) => ({
      queryKey:  ['breed-frogs', sels[role]?.breed.id],
      queryFn:   () => fetchBreedFrogs<{ fullname?: string }>(sels[role]!.breed.id),
      enabled:   !!sels[role],
      staleTime: DAY,
    })),
  });

  const frogs = {} as Record<Role, ResolvedFrog>;
  FROGS.forEach(({ role }, i) => {
    const sel = sels[role];
    const q = breedQueries[i];
    let state: FrogState;
    let record: ResolvedFrog['record'] = null;
    if (!texts[role].trim()) state = 'empty';
    else if (!lookup) state = 'loading';
    else if (!sel) state = 'bad';
    else if (q.isError) state = 'bad';
    else if (!q.data) state = 'resolving';
    else {
      const name = frogName(sel);
      const hit = q.data.find(f => f.fields.fullname === name);
      record = hit ? { id: hit.id, name } : null;
      state = hit ? 'ok' : 'bad';
    }
    frogs[role] = { state, sel, record };
  });

  // Game versions, newest first (one entry per version string). The stored one
  // is always offered, even if it's since been hidden from the changelog.
  const { data: changelog } = useQuery({ queryKey: ['changelog'], queryFn: fetchChangelog, staleTime: 60 * 60 * 1000 });
  const latestVersion = changelog?.[0]?.version ?? null;
  const versions = useMemo(() => {
    const list = [...new Set((changelog ?? []).map(c => c.version))];
    const stored = str(initial.versionName);
    if (stored && !list.includes(stored)) list.unshift(stored);
    return list;
  }, [changelog, initial.versionName]);

  const sourceTrim = source.trim();

  let problem: string | null = null;
  if (!variant) problem = 'Choose Glass or Chroma.';
  if (!problem) {
    for (const { role, label, optional } of FROGS) {
      const s = frogs[role].state;
      if (s === 'empty' && !optional) { problem = `${label} is required.`; break; }
      if (s === 'bad') { problem = `${label} doesn't match a known frog.`; break; }
    }
  }
  if (!problem && FROGS.some(({ role }) => frogs[role].state === 'loading' || frogs[role].state === 'resolving')) {
    problem = 'Checking frogs…';
  }
  if (!problem && variant) problem = traitProblem(variant, frogs);
  if (!problem && sourceTrim && !isHttpUrl(sourceTrim)) problem = 'The source link must be an http(s) URL.';

  let payload: Record<string, unknown> | null = null;
  if (!problem && variant) {
    payload = { variant };
    for (const { role, idKey, nameKey } of FROGS) {
      const r = frogs[role].record;
      if (r) { payload[idKey] = r.id; payload[nameKey] = r.name; }
    }
    if (sourceTrim) payload.sourceLink = sourceTrim;
    if (version) payload.versionName = version;
  }

  const node = (
    <div className="submission-edit-fields">
      <label className="submission-edit-label">
        Variant
        <select className="search-input" value={variant} onChange={e => setVariant(e.target.value as Variant)}>
          {!variant && <option value="" disabled>Choose…</option>}
          <option value="glass">Glass</option>
          <option value="chroma">Chroma</option>
        </select>
      </label>
      <label className="submission-edit-label">
        Game version
        <select className="search-input" value={version} onChange={e => setVersion(e.target.value)}>
          <option value="">None</option>
          {versions.map(v => (
            <option key={v} value={v}>{v}{v === latestVersion ? ' (latest)' : ''}</option>
          ))}
        </select>
      </label>

      {FROGS.map(({ role, label, optional }) => (
        <FrogRecordField
          key={role}
          label={label}
          optional={optional}
          text={texts[role]}
          frog={frogs[role]}
          disabled={!lookup}
          onCommit={t => setTexts(prev => ({ ...prev, [role]: t }))}
        />
      ))}

      <label className="submission-edit-label submission-edit-wide">
        Source link
        <input
          className="search-input"
          type="url"
          inputMode="url"
          value={source}
          placeholder="https://… (optional)"
          onChange={e => setSource(e.target.value)}
        />
      </label>
    </div>
  );

  return { node, payload, problem };
}
