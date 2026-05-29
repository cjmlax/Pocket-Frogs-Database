import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTable, searchFrogs, type TeableRecord, type FrogFilter } from '../api/teable';

interface BreedFields extends Record<string, unknown> { Breed?:      string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }
interface FrogFields  extends Record<string, unknown> {
  Value?:   number;
  Speed?:   number;
  Stamina?: number;
}

interface DailySelection {
  name:   string;
  filter: FrogFilter;
  seed:   number;
}

function computeSelection(
  breeds: TeableRecord<BreedFields>[],
  bases:  TeableRecord<BaseFields>[],
  secs:   TeableRecord<SecFields>[],
): DailySelection | null {
  if (!breeds.length || !bases.length || !secs.length) return null;

  // Seed format YYYYDDMM — matches the original implementation
  const now = new Date();
  const dateString =
    now.getUTCFullYear().toString() +
    now.getUTCDate().toString().padStart(2, '0') +
    (now.getUTCMonth() + 1).toString().padStart(2, '0');

  const x = parseInt(dateString, 10);
  const seedBase  = (Math.sin(x) * 10915) % 1;
  const seedSec   = (Math.sin(x) * 81293) % 1;
  const seedBreed = (Math.sin(x) * 23917) % 1;

  const baseRec  = bases[Math.floor(Math.abs(seedBase)   * bases.length)];
  const secRec   = secs[Math.floor(Math.abs(seedSec)     * secs.length)];
  const breedRec = breeds[Math.floor(Math.abs(seedBreed) * breeds.length)];

  return {
    name:   `${baseRec.fields.BaseColors ?? '?'} ${secRec.fields.Sec_Color ?? '?'} ${breedRec.fields.Breed ?? '?'}`,
    filter: { base: baseRec.id, secondary: secRec.id, breed: breedRec.id },
    seed:   x,
  };
}

export function useDailyFrog() {
  // Same query keys as FrogList — data is already cached if user visited that page
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const selection = useMemo(
    () => computeSelection(breeds ?? [], bases ?? [], secs ?? []),
    [breeds, bases, secs],
  );

  // Fetch frogs matching today's combo. staleTime of 24h means it won't
  // re-fetch while the user is on the site, even across page navigations.
  const { data: frogs, isLoading: statsLoading } = useQuery({
    queryKey:  ['daily-frog', selection?.filter],
    queryFn:   () => searchFrogs<FrogFields>(selection!.filter),
    enabled:   selection !== null,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // Use a different multiplier so the frog pick is independent of the name pick
  const frog = useMemo(() => {
    if (!frogs?.length || !selection) return null;
    const seedFrog = (Math.sin(selection.seed) * 57293) % 1;
    return frogs[Math.floor(Math.abs(seedFrog) * frogs.length)];
  }, [frogs, selection]);

  return {
    name:      selection?.name   ?? null,
    value:     frog?.fields.Value    ?? null,
    speed:     frog?.fields.Speed    ?? null,
    stamina:   frog?.fields.Stamina  ?? null,
    isLoading: !selection || statsLoading,
  };
}
