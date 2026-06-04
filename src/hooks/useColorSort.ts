import { useSyncExternalStore } from 'react';

export type ColorSortKey = 'rainbow' | 'alpha';
export type SortDir = 'asc' | 'desc';
export interface ColorSort { key: ColorSortKey; dir: SortDir }

const KEY = 'colorSort';
const DEFAULT: ColorSort = { key: 'rainbow', dir: 'asc' };

function load(): ColorSort {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if ((p.key === 'rainbow' || p.key === 'alpha') && (p.dir === 'asc' || p.dir === 'desc')) return p;
    }
  } catch { /* ignore malformed value */ }
  return DEFAULT;
}

// Module-level store so the settings menu and every page that renders a color
// ComboBox share one reactive value and re-render together when it changes.
let current: ColorSort = load();
const listeners = new Set<() => void>();

function commit(next: ColorSort) {
  current = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach(l => l());
}

// Clicking the active key toggles its direction; clicking a different key
// switches to it and resets to ascending.
export function selectColorSort(key: ColorSortKey) {
  if (current.key === key) {
    commit({ key, dir: current.dir === 'asc' ? 'desc' : 'asc' });
  } else {
    commit({ key, dir: 'asc' });
  }
}

export function useColorSort(): ColorSort {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => current,
  );
}
