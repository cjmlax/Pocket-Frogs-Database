import { useSyncExternalStore } from 'react';

export type BreedSortKey = 'alpha' | 'level';
export type SortDir = 'asc' | 'desc';
export interface BreedSort { key: BreedSortKey; dir: SortDir }

const KEY = 'breedSort';
const DEFAULT: BreedSort = { key: 'alpha', dir: 'asc' };

function load(): BreedSort {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if ((p.key === 'alpha' || p.key === 'level') && (p.dir === 'asc' || p.dir === 'desc')) return p;
    }
  } catch { /* ignore malformed value */ }
  return DEFAULT;
}

// Module-level store so the settings menu and every page that renders a Breed
// ComboBox share one reactive value and re-render together when it changes.
let current: BreedSort = load();
const listeners = new Set<() => void>();

function commit(next: BreedSort) {
  current = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach(l => l());
}

// Clicking a key toggles its direction if it's already active; otherwise it
// switches to that key, defaulting to ascending (A→Z / 1→N).
export function selectBreedSort(key: BreedSortKey) {
  if (current.key === key) {
    commit({ key, dir: current.dir === 'asc' ? 'desc' : 'asc' });
  } else {
    commit({ key, dir: 'asc' });
  }
}

export function useBreedSort(): BreedSort {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
