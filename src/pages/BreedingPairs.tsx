import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTable, fetchBreedFrogs, fetchCombos, type TeableRecord } from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import { formatNum } from '../utils/format';
import { breedOptionsFrom } from '../utils/breeds';
import { useBreedSort } from '../hooks/useBreedSort';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface BreedFields extends Record<string, unknown> { Breed?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  fullname?: string;
  Value?:    number;
  Speed?:    number;
  Stamina?:  number;
}

// Chroma / Glass combination tables — Frog 1 / Frog 2 are links to the frogs table
interface ComboFields extends Record<string, unknown> {
  'Frog 1'?:     unknown;
  'Frog 2'?:     unknown;
  'Screenshot'?: unknown;
}

const TEABLE_ORIGIN = 'https://teable.cjmlax.com';

interface ParentSel {
  base:  ComboOption | null;
  sec:   ComboOption | null;
  breed: ComboOption | null;
}

const EMPTY: ParentSel = { base: null, sec: null, breed: null };

// Extracts the linked frog record ID from a Teable link field, which may come
// back as a single { id, title } object or an array of them.
function linkId(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) {
    return String((first as { id: unknown }).id);
  }
  return null;
}

// Extracts a displayable URL from a Teable attachment field. Falls back to the
// relative path (prefixed with the Teable origin) when no presigned URL exists.
function attachmentUrl(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (!first || typeof first !== 'object') return null;
  const o = first as Record<string, unknown>;
  const url = (o.presignedUrl ?? o.url) as string | undefined;
  if (!url) return null;
  return url.startsWith('http') ? url : `${TEABLE_ORIGIN}${url}`;
}

// All 8 offspring trait combinations: each character picks parent A's or B's
// base / secondary / breed respectively.
const COMBOS = ['AAA', 'AAB', 'ABA', 'ABB', 'BAA', 'BAB', 'BBA', 'BBB'] as const;

// Floors any numeric stat to a whole value; returns null for missing data.
function statInt(n: unknown): number | null {
  return typeof n === 'number' ? Math.floor(n) : null;
}

function fullName(base: ComboOption, sec: ComboOption, breed: ComboOption): string {
  return `${base.label} ${sec.label} ${breed.label}`;
}

const HOVER_CLASSES = ['row-hover', 'col-hover', 'cell-hover'] as const;

function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

// ── Parent selector column ──────────────────────────────────────────────────────

function ParentInputs({
  title, sel, onChange, baseOpts, secOpts, breedOpts, breedPresorted,
}: {
  title: string;
  sel: ParentSel;
  onChange: (s: ParentSel) => void;
  baseOpts: ComboOption[];
  secOpts: ComboOption[];
  breedOpts: ComboOption[];
  breedPresorted: boolean;
}) {
  return (
    <div className="parent-group">
      <h2 className="parent-title">{title}</h2>
      <ComboBox
        label="Base Color"
        options={baseOpts}
        initialSelection={sel.base}
        onSelect={o => onChange({ ...sel, base: o })}
      />
      <ComboBox
        label="Secondary Color"
        options={secOpts}
        initialSelection={sel.sec}
        onSelect={o => onChange({ ...sel, sec: o })}
      />
      <ComboBox
        label="Breed"
        options={breedOpts}
        presorted={breedPresorted}
        initialSelection={sel.breed}
        onSelect={o => onChange({ ...sel, breed: o })}
      />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function BreedingPairs() {
  const [pa, setPa] = useState<ParentSel>(EMPTY);
  const [pb, setPb] = useState<ParentSel>(EMPTY);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Lookup tables for the ComboBoxes (small, ETag-cached)
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedSort = useBreedSort();
  const breedOpts = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOpts  = useMemo<ComboOption[]>(() => bases?.map( r => ({ id: r.id, label: r.fields.BaseColors ?? r.id })) ?? [], [bases]);
  const secOpts   = useMemo<ComboOption[]>(() => secs?.map(  r => ({ id: r.id, label: r.fields.Sec_Color  ?? r.id })) ?? [], [secs]);

  // Offspring only ever use the two parents' breeds, so fetching those two breed
  // sets covers every combination. If both breeds match, TanStack dedupes the query.
  const breedAQuery = useQuery({
    queryKey: ['breed-frogs', pa.breed?.id],
    queryFn:  () => fetchBreedFrogs<FrogFields>(pa.breed!.id),
    enabled:  !!pa.breed,
    staleTime: 1000 * 60 * 60 * 24,
  });
  const breedBQuery = useQuery({
    queryKey: ['breed-frogs', pb.breed?.id],
    queryFn:  () => fetchBreedFrogs<FrogFields>(pb.breed!.id),
    enabled:  !!pb.breed,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // Special-combination tables — small and ETag-cached, so fetch eagerly
  const { data: chromaCombos } = useQuery({ queryKey: ['table', 'chroma'], queryFn: () => fetchCombos<ComboFields>('chroma') });
  const { data: glassCombos  } = useQuery({ queryKey: ['table', 'glass'],  queryFn: () => fetchCombos<ComboFields>('glass')  });

  // Index every fetched frog by its fullname for O(1) offspring lookups
  const index = useMemo(() => {
    const m = new Map<string, TeableRecord<FrogFields>>();
    for (const f of [...(breedAQuery.data ?? []), ...(breedBQuery.data ?? [])]) {
      if (f.fields.fullname) m.set(f.fields.fullname, f);
    }
    return m;
  }, [breedAQuery.data, breedBQuery.data]);

  const allSelected = !!(pa.base && pa.sec && pa.breed && pb.base && pb.sec && pb.breed);
  const loading = (!!pa.breed && breedAQuery.isFetching) || (!!pb.breed && breedBQuery.isFetching);

  // Resolve the two selected parents to actual frog records
  const frogA = useMemo(
    () => (allSelected ? index.get(fullName(pa.base!, pa.sec!, pa.breed!)) ?? null : null),
    [allSelected, index, pa],
  );
  const frogB = useMemo(
    () => (allSelected ? index.get(fullName(pb.base!, pb.sec!, pb.breed!)) ?? null : null),
    [allSelected, index, pb],
  );

  // Check the parent pair against the Chroma/Glass tables (either order).
  // Matches on frog record ID, the reliable link-field key.
  const specials = useMemo(() => {
    if (!frogA || !frogB) return [];
    const a = frogA.id, b = frogB.id;
    const matches = (rec: TeableRecord<ComboFields>) => {
      const f1 = linkId(rec.fields['Frog 1']);
      const f2 = linkId(rec.fields['Frog 2']);
      return (f1 === a && f2 === b) || (f1 === b && f2 === a);
    };
    const found: { type: string; screenshot: string | null }[] = [];
    const chroma = (chromaCombos ?? []).find(matches);
    if (chroma) found.push({ type: 'Chroma', screenshot: attachmentUrl(chroma.fields['Screenshot']) });
    const glass = (glassCombos ?? []).find(matches);
    if (glass) found.push({ type: 'Glass', screenshot: attachmentUrl(glass.fields['Screenshot']) });
    return found;
  }, [frogA, frogB, chromaCombos, glassCombos]);

  const result = useMemo(() => {
    if (!allSelected) return null;

    const valA = statInt(frogA?.fields.Value) ?? 0;
    const valB = statInt(frogB?.fields.Value) ?? 0;
    const cost = Math.floor((valA + valB) / 4);

    const seen = new Set<string>();
    const offspring = COMBOS.flatMap(code => {
      const base  = code[0] === 'A' ? pa.base!  : pb.base!;
      const sec   = code[1] === 'A' ? pa.sec!   : pb.sec!;
      const breed = code[2] === 'A' ? pa.breed! : pb.breed!;
      const name = fullName(base, sec, breed);
      if (seen.has(name)) return [];
      seen.add(name);

      const frog = index.get(name) ?? null;
      const value   = statInt(frog?.fields.Value);
      const speed   = statInt(frog?.fields.Speed);
      const stamina = statInt(frog?.fields.Stamina);
      return [{
        name,
        found:   frog !== null,
        value,
        profit:  value !== null ? value - cost : null,
        speed,
        stamina,
        racing:  speed !== null && stamina !== null ? speed + stamina : null,
      }];
    });

    return { cost, offspring };
  }, [allSelected, index, pa, pb, frogA, frogB]);

  // ── Crosshair hover (mirrors the Breed Overview grid) ─────────────────────
  function clearHover() {
    tableRef.current?.querySelectorAll<HTMLElement>('.row-hover,.col-hover,.cell-hover')
      .forEach(el => el.classList.remove(...HOVER_CLASSES));
  }

  function handleMouseOver(e: React.MouseEvent<HTMLTableElement>) {
    const cell = (e.target as HTMLElement).closest('td,th') as HTMLElement | null;
    if (!cell) return;
    const table = tableRef.current!;
    clearHover();
    const rowId = cell.dataset.row;
    const colId = cell.dataset.col;
    if (rowId) table.querySelectorAll(`[data-row="${rowId}"]`).forEach(el => el.classList.add('row-hover'));
    if (colId) table.querySelectorAll(`[data-col="${colId}"]`).forEach(el => el.classList.add('col-hover'));
    if (rowId && colId) {
      table.querySelector(`[data-row="${rowId}"][data-col="${colId}"]`)?.classList.add('cell-hover');
    }
  }

  return (
    <div>
      <h1>Breeding Pairs</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Enter the traits of two parent frogs to display the offspring and their stats.
      </p>

      <div className="breeding-parents">
        <ParentInputs title="Parent Frog A" sel={pa} onChange={setPa} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} breedPresorted />
        <ParentInputs title="Parent Frog B" sel={pb} onChange={setPb} baseOpts={baseOpts} secOpts={secOpts} breedOpts={breedOpts} breedPresorted />
      </div>

      {!allSelected ? (
        <p className="search-hint">Waiting for parents...</p>
      ) : loading ? (
        <p className="search-hint">Loading frog data…</p>
      ) : result ? (
        <>
          {specials.map(s => (
            <p key={s.type} className="breeding-special">
              ✨ This pairing is known to produce a <strong>{s.type}</strong> frog!
              {s.screenshot && (
                <button
                  className="screenshot-btn"
                  onClick={() => setLightbox(s.screenshot)}
                  aria-label={`View ${s.type} screenshot`}
                  title="View screenshot"
                >
                  <IconCamera />
                </button>
              )}
            </p>
          ))}

          <p className="breeding-cost">
            Breeding Cost: <strong>{formatNum(result.cost)}</strong>
          </p>

          <div className="table-wrapper">
            <table
              className="breeding-results"
              ref={tableRef}
              onMouseOver={handleMouseOver}
              onMouseLeave={clearHover}
            >
              <tbody>
                <tr>
                  <th className="breeding-row-label" data-row="frog">Frog</th>
                  {result.offspring.map((o, i) => (
                    <th key={o.name} className="breeding-frog-name" data-row="frog" data-col={i}>
                      {o.name.split(' ').map((word, w) => (
                        <span key={w} className="breeding-frog-word">{word}</span>
                      ))}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="value">Value</th>
                  {result.offspring.map((o, i) => (
                    <td key={o.name} data-row="value" data-col={i}>{o.value !== null ? formatNum(o.value) : (o.found ? '—' : 'Not Found')}</td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="profit">Net Profit</th>
                  {result.offspring.map((o, i) => (
                    <td key={o.name} data-row="profit" data-col={i} className={
                      o.profit === null ? undefined
                        : o.profit > 0 ? 'profit-positive'
                        : o.profit < 0 ? 'profit-negative'
                        : undefined
                    }>
                      {o.profit === null ? '—' : `${o.profit > 0 ? '+' : ''}${formatNum(o.profit)}`}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="speed">Speed</th>
                  {result.offspring.map((o, i) => (
                    <td key={o.name} data-row="speed" data-col={i}>{o.speed !== null ? formatNum(o.speed) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="stamina">Stamina</th>
                  {result.offspring.map((o, i) => (
                    <td key={o.name} data-row="stamina" data-col={i}>{o.stamina !== null ? formatNum(o.stamina) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <th className="breeding-row-label" data-row="racing">Racing Stat</th>
                  {result.offspring.map((o, i) => (
                    <td key={o.name} data-row="racing" data-col={i}>{o.racing !== null ? formatNum(o.racing) : '—'}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Close" onClick={() => setLightbox(null)}>×</button>
          <img
            className="lightbox-image"
            src={lightbox}
            alt="Combination screenshot"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
