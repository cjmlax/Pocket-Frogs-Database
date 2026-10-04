import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTable } from '../api/teable';
import type { ComboOption } from '../components/ComboBox';
import { breedOptionsFrom } from '../utils/breeds';
import { colorOptionsFrom } from '../utils/colors';
import { buildPartLookup, type FrogIdLookup } from '../utils/frogIds';
import { useBreedSort } from './useBreedSort';
import { useColorSort } from './useColorSort';

interface BreedFields extends Record<string, unknown> { Breed?: string;      Breed_ID?: string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string; Base_Color_ID?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?: string;  Sec_Color_ID?: string }

// Options for the Base / Secondary / Breed ComboBoxes, ordered by the user's
// sort settings, plus the Frog_ID lookup (null until all three tables load).
export function useFrogOptions() {
  // Lookup tables (small, ETag-cached)
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const breedSort = useBreedSort();
  const colorSort = useColorSort();
  const breedOpts = useMemo<ComboOption[]>(() => breedOptionsFrom(breeds, breedSort), [breeds, breedSort]);
  const baseOpts  = useMemo<ComboOption[]>(() => colorOptionsFrom(bases, 'BaseColors', colorSort), [bases, colorSort]);
  const secOpts   = useMemo<ComboOption[]>(() => colorOptionsFrom(secs,  'Sec_Color',  colorSort), [secs,  colorSort]);

  const lookup = useMemo<FrogIdLookup | null>(() => {
    if (!breeds || !bases || !secs) return null;
    return {
      breed: buildPartLookup(breeds, 'Breed_ID',      breedOpts),
      base:  buildPartLookup(bases,  'Base_Color_ID', baseOpts),
      sec:   buildPartLookup(secs,   'Sec_Color_ID',  secOpts),
    };
  }, [breeds, bases, secs, breedOpts, baseOpts, secOpts]);

  return { breedOpts, baseOpts, secOpts, lookup };
}

export type FrogOptions = ReturnType<typeof useFrogOptions>;
