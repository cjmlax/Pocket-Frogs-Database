import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTable, type TeableRecord } from '../api/teable';

interface BreedFields extends Record<string, unknown> { Breed?:      string }
interface BaseFields  extends Record<string, unknown> { BaseColors?: string }
interface SecFields   extends Record<string, unknown> { Sec_Color?:  string }

function getDailyFrog(
  breeds: TeableRecord<BreedFields>[],
  bases:  TeableRecord<BaseFields>[],
  secs:   TeableRecord<SecFields>[],
): string | null {
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

  const base  = bases[Math.floor(Math.abs(seedBase)   * bases.length)]?.fields.BaseColors ?? '?';
  const sec   = secs[Math.floor(Math.abs(seedSec)     * secs.length)]?.fields.Sec_Color   ?? '?';
  const breed = breeds[Math.floor(Math.abs(seedBreed) * breeds.length)]?.fields.Breed     ?? '?';

  return `${base} ${sec} ${breed}`;
}

export default function Home() {
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable<BreedFields>('breeds') });
  const { data: bases  } = useQuery({ queryKey: ['table', 'bases'],  queryFn: () => fetchTable<BaseFields>('bases')  });
  const { data: secs   } = useQuery({ queryKey: ['table', 'secs'],   queryFn: () => fetchTable<SecFields>('secs')    });

  const dailyFrog = useMemo(
    () => getDailyFrog(breeds ?? [], bases ?? [], secs ?? []),
    [breeds, bases, secs],
  );

  return (
    <div className="home">
      <h1>Pocket Frogs Database</h1>

      <div className="home-text">
        <p>An unofficial, searchable database of information for the mobile game Pocket Frogs.</p>
        <p>This website is a continuation of my <a href="https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/" target="_blank">Google Spreadsheet</a>, meant to present the data better and allow for a smoother experience (that's also less reliant on Google).</p>
        <p>This website is also two terrible things combined — a work in progress and vibe-coded. Please be patient while I work out the kinks and improve the experience. If you feel the urge to help out, I'm throwing this up on <a href="https://github.com/cjmlax/Pocket-Frogs-Database" target="_blank">GitHub</a>.</p>
      </div>

      <div className="daily-frog">
        <span className="daily-frog-label">Frog of the Day</span>
        <p className="daily-frog-name">{dailyFrog ?? 'Loading…'}</p>
      </div>
    </div>
  );
}
