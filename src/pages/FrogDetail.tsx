import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useQueries, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { type SortingState } from '@tanstack/react-table';
import {
  fetchFrogById, fetchTable, fetchCombos, fetchBreedFrogs,
  type TeableRecord,
} from '../api/teable';
import ComboBox, { type ComboOption } from '../components/ComboBox';
import WeeklyTable, { type WeeklyFields, WEEKLY_FROG_FIELDS } from '../components/WeeklyTable';
import { breedOptionsFrom } from '../utils/breeds';
import { useBreedSort } from '../hooks/useBreedSort';
import { useColorSort } from '../hooks/useColorSort';
import { useSpoilers } from '../hooks/useSpoilers';
import { colorOptionsFrom } from '../utils/colors';
import { attachmentUrl } from '../utils/attachments';
import { formatNum } from '../utils/format';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FrogFields extends Record<string, unknown> {
  fullname?:  string;
  Breed?:     unknown;
  Primary?:   unknown;
  Secondary?: unknown;
  Value?:     number;
  Speed?:     number;
  Stamina?:   number;
}
interface BreedFields extends Record<string, unknown> { Breed?: string; Level?: unknown; Promotional?: boolean }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface LevelFields extends Record<string, unknown> {
  Level_No?:   number;
  Hatch?:      string;
  Growth?:     string;
  Flies?:      number;
  Rarity?:     string;
  Restricted?: boolean;
}

// Chroma / Glass combination tables — Frog 1 / Frog 2 link to the frogs table.
interface ComboFields extends Record<string, unknown> {
  'Frog 1'?:     unknown;
  'Frog 2'?:     unknown;
  'Screenshot'?: unknown;
}

// Pulls the linked record's id from a Teable link field ({ id, title } or array).
function linkId(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) return String((first as { id: unknown }).id);
  return null;
}

// Pulls the linked record's display title (the partner frog's short code).
function linkTitle(val: unknown): string | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'title' in first) return String((first as { title: unknown }).title);
  return null;
}

// Builds a ComboOption ({ id, label }) from a Teable link field, so a loaded
// frog's base / secondary / breed can prefill the pickers.
function optionFromLink(val: unknown): ComboOption | null {
  const first = Array.isArray(val) ? val[0] : val;
  if (first && typeof first === 'object' && 'id' in first) {
    const o = first as { id: unknown; title?: unknown };
    return { id: String(o.id), label: String(o.title ?? '') };
  }
  return null;
}

function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

interface PickerSel {
  base:  ComboOption | null;
  sec:   ComboOption | null;
  breed: ComboOption | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FrogDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [weeklySort, setWeeklySort] = useState<SortingState>([{ id: 'date', desc: true }]);

  const queryClient = useQueryClient();

  const { data: frog, isFetching, error } = useQuery({
    queryKey: ['frog', id],
    queryFn:  () => fetchFrogById<FrogFields>(id!),
    enabled:  !!id,
    staleTime: 1000 * 60 * 60 * 24, // lets a cache seeded from the breed index render without a refetch
    placeholderData: keepPreviousData, // keep the previous frog visible while the next loads
  });

  // Lookup tables for the pickers + supporting data (small, ETag-cached).
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });
  const { data: levels } = useQuery({ queryKey: ['table', 'levels'], queryFn: () => fetchTable<LevelFields>('levels') });
  const { data: weekly } = useQuery({ queryKey: ['table', 'weekly'], queryFn: () => fetchTable<WeeklyFields>('weekly') });
  const { data: chromaCombos } = useQuery({ queryKey: ['table', 'chroma'], queryFn: () => fetchCombos<ComboFields>('chroma') });
  const { data: glassCombos  } = useQuery({ queryKey: ['table', 'glass'],  queryFn: () => fetchCombos<ComboFields>('glass')  });

  const breedSort = useBreedSort();
  const { spoilers } = useSpoilers();
  const colorSort = useColorSort();
  const breedOptions = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOptions  = useMemo<ComboOption[]>(() => colorOptionsFrom(bases, 'BaseColors', colorSort), [bases, colorSort]);
  const secOptions   = useMemo<ComboOption[]>(() => colorOptionsFrom(secs,  'Sec_Color',  colorSort), [secs,  colorSort]);

  // The loaded frog's traits, used to prefill the pickers.
  const frogBase  = useMemo(() => optionFromLink(frog?.fields.Primary),   [frog]);
  const frogSec   = useMemo(() => optionFromLink(frog?.fields.Secondary), [frog]);
  const frogBreed = useMemo(() => optionFromLink(frog?.fields.Breed),     [frog]);

  // Picker state — seeded from the loaded frog, then driven by the user.
  const [sel, setSel] = useState<PickerSel>({ base: null, sec: null, breed: null });
  useEffect(() => {
    setSel({ base: frogBase, sec: frogSec, breed: frogBreed });
  }, [frogBase, frogSec, frogBreed]);

  // The selected breed's frogs — shared 24h IndexedDB cache with the Breed
  // Overview and Breeding Pairs pages, so this is usually served with no network
  // request. Indexing these locally avoids a dedicated per-selection lookup.
  const allSelected = !!(sel.base && sel.sec && sel.breed);
  const { data: breedFrogs, isFetching: loadingBreed } = useQuery({
    queryKey:  ['breed-frogs', sel.breed?.id],
    queryFn:   () => fetchBreedFrogs<FrogFields>(sel.breed!.id),
    enabled:   !!sel.breed,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // Resolve the picked base + secondary + breed to a record locally, keyed by the
  // readable 3-word name (Base Sec Breed) — the frogs' "Readable Name" field.
  const target = useMemo(() => {
    if (!allSelected || !breedFrogs) return null;
    const name = `${sel.base!.label} ${sel.sec!.label} ${sel.breed!.label}`;
    return breedFrogs.find(f => f.fields.fullname === name) ?? null;
  }, [allSelected, breedFrogs, sel]);

  // Navigate when the picked combination resolves to a different frog. Seeding the
  // detail cache from the breed index lets the target render without its own
  // fetch. Pushing history lets browser back/forward walk previously viewed frogs.
  useEffect(() => {
    if (target && target.id !== id) {
      queryClient.setQueryData(['frog', target.id], target);
      navigate(`/frog/${target.id}`);
    }
  }, [target, id, navigate, queryClient]);

  const fullname = frog?.fields.fullname ?? null;

  // Frog stats live on the frog record; Speed + Stamina is derived.
  const value   = typeof frog?.fields.Value   === 'number' ? frog.fields.Value   : null;
  const speed   = typeof frog?.fields.Speed   === 'number' ? frog.fields.Speed   : null;
  const stamina = typeof frog?.fields.Stamina === 'number' ? frog.fields.Stamina : null;
  const racing  = speed === null && stamina === null ? null : (speed ?? 0) + (stamina ?? 0);

  // The frog's breed record — used for level resolution and the Promotional flag.
  const breedRec = useMemo(
    () => (frog && breeds ? breeds.find(b => b.id === linkId(frog.fields.Breed)) ?? null : null),
    [frog, breeds],
  );

  // Level / hatch / growth / flies / rarity / restricted come from the breed's
  // linked Level record (frog → breed → Level), the same chain Breed Overview uses.
  const level = useMemo(() => {
    if (!breedRec || !levels) return null;
    const levelId = linkId(breedRec.fields.Level);
    return levels.find(l => l.id === levelId) ?? null;
  }, [breedRec, levels]);

  // Weekly sets that include this frog in any of their eight slots.
  const weeklyMatches = useMemo(() => {
    if (!weekly || !fullname) return [];
    return weekly.filter(set => WEEKLY_FROG_FIELDS.some(f => set.fields[f] === fullname));
  }, [weekly, fullname]);

  const highlightNames = useMemo(
    () => (fullname ? new Set([fullname]) : new Set<string>()),
    [fullname],
  );

  // Chroma / Glass combinations where this frog is one of the two parents.
  const specials = useMemo(() => {
    if (!frog) return [];
    const find = (combos: TeableRecord<ComboFields>[] | undefined, type: 'Chroma' | 'Glass') =>
      (combos ?? []).flatMap(rec => {
        const id1 = linkId(rec.fields['Frog 1']);
        const id2 = linkId(rec.fields['Frog 2']);
        if (id1 !== frog.id && id2 !== frog.id) return [];
        const partnerId    = id1 === frog.id ? id2 : id1;
        const partnerTitle = id1 === frog.id ? linkTitle(rec.fields['Frog 2']) : linkTitle(rec.fields['Frog 1']);
        return [{ type, partnerId, partnerTitle, screenshot: attachmentUrl(rec.fields['Screenshot']) }];
      });
    return [...find(chromaCombos, 'Chroma'), ...find(glassCombos, 'Glass')];
  }, [frog, chromaCombos, glassCombos]);

  // Resolve each partner frog's 3-word fullname by id. Shares the ['frog', id]
  // query key with the main frog query, so partners already viewed are cached.
  const partnerQueries = useQueries({
    queries: specials.map(s => ({
      queryKey:  ['frog', s.partnerId],
      queryFn:   () => fetchFrogById<FrogFields>(s.partnerId!),
      enabled:   !!s.partnerId,
      staleTime: 1000 * 60 * 60 * 24,
    })),
  });
  const partnerNames = specials.map(
    (s, i) => partnerQueries[i]?.data?.fields.fullname ?? s.partnerTitle ?? 'another frog',
  );

  // No frog when there's no id in the URL, or the resolver found nothing.
  const noMatch = allSelected && !loadingBreed && !target;

  return (
    <div>
      <h1>Frog Detail</h1>

      <div className="filter-grid" key={frog?.id ?? 'none'}>
        <ComboBox
          label="Base Color"
          options={baseOptions}
          presorted
          initialSelection={frogBase}
          onSelect={opt => setSel(s => ({ ...s, base: opt }))}
        />
        <ComboBox
          label="Secondary Color"
          options={secOptions}
          presorted
          initialSelection={frogSec}
          onSelect={opt => setSel(s => ({ ...s, sec: opt }))}
        />
        <ComboBox
          label="Breed"
          options={breedOptions}
          presorted
          initialSelection={frogBreed}
          onSelect={opt => setSel(s => ({ ...s, breed: opt }))}
        />
      </div>

      {!id ? (
        <p className="search-hint">Select a base color, secondary color, and breed to view a frog.</p>
      ) : error ? (
        <p className="search-error">Error loading frog.</p>
      ) : noMatch ? (
        <p className="search-hint">No frog found for that combination.</p>
      ) : !frog ? (
        <p className="search-hint">{isFetching ? 'Loading…' : 'Frog not found.'}</p>
      ) : (
        <>
          <h2 className="frog-detail-name">{fullname ?? id}</h2>

          <div className="breed-info-stats frog-detail-stats">
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Value</span>
              <span className="breed-info-stat-value">{formatNum(value)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Speed</span>
              <span className="breed-info-stat-value">{formatNum(speed)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Stamina</span>
              <span className="breed-info-stat-value">{formatNum(stamina)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Speed + Stamina</span>
              <span className="breed-info-stat-value">{formatNum(racing)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Level</span>
              <span className="breed-info-stat-value">{formatNum(level?.fields.Level_No)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Hatch Time</span>
              <span className="breed-info-stat-value">{level?.fields.Hatch ?? '—'}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Growth Time</span>
              <span className="breed-info-stat-value">{level?.fields.Growth ?? '—'}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Flies to Tame</span>
              <span className="breed-info-stat-value">{formatNum(level?.fields.Flies)}</span>
            </div>
            <div className="breed-info-stat">
              <span className="breed-info-stat-label">Rarity</span>
              <span className="breed-info-stat-value">{level?.fields.Rarity ?? '—'}</span>
            </div>
          </div>

          {level?.fields.Restricted && (
            <p className="breed-info-note">
              ⚠ Restricted — This breed can only be found in the pond and cannot be traded to another player.
            </p>
          )}
          {breedRec?.fields.Promotional && (
            <p className="breed-info-note">
              ★ Promotional — This breed can only be obtained via the FrogMart or player trade. AKA POP Frog or Potion Frog.
            </p>
          )}

          {spoilers && specials.length > 0 && (
            <div className="frog-detail-specials">
              {specials.map((s, i) => (
                <p key={`${s.type}-${i}`} className="breeding-special">
                  ✨ Pairs with <strong>{partnerNames[i]}</strong> to produce a <strong>{s.type}</strong> frog!
                  {s.screenshot && (
                    <button
                      className="screenshot-btn"
                      onClick={() => setLightbox(s.screenshot)}
                      aria-label={`View ${s.type} screenshot`}
                      title="View screenshot"
                    >
                      <IconCamera/>
                    </button>
                  )}
                </p>
              ))}
            </div>
          )}

          <div className="breed-weekly">
            <h2 className="breed-weekly-title">
              Weekly Sets featuring {fullname}{' '}
              <span className="breed-weekly-count">({weeklyMatches.length})</span>
            </h2>
            <WeeklyTable
              data={weeklyMatches}
              sorting={weeklySort}
              onSortingChange={setWeeklySort}
              paginate={false}
              highlightNames={highlightNames}
            />
          </div>
        </>
      )}

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
