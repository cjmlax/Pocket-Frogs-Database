import { useState, useEffect } from 'react';

// How frogs are entered on the Breeding Pairs, Mutation Planner, Frog Detail and
// combo-submission parent inputs: three Base / Secondary / Breed dropdowns, or
// one text box taking an exact Frog_ID or full name (an advanced option).
export type FrogEntry = 'combo' | 'text';

const FROG_ENTRY_EVENT = 'pfdb:frog-entry-change';

// Dropdowns are the site default, so only the text preference is stored.
export function useFrogEntry() {
  const [entry, setEntry] = useState<FrogEntry>(
    () => localStorage.getItem('frogEntry') === 'text' ? 'text' : 'combo',
  );

  useEffect(() => {
    function onchange(e: Event) {
      setEntry((e as CustomEvent<FrogEntry>).detail);
    }
    window.addEventListener(FROG_ENTRY_EVENT, onchange);
    return () => window.removeEventListener(FROG_ENTRY_EVENT, onchange);
  }, []);

  function set(value: FrogEntry) {
    if (value === 'combo') {
      localStorage.removeItem('frogEntry');
    } else {
      localStorage.setItem('frogEntry', value);
    }
    window.dispatchEvent(new CustomEvent<FrogEntry>(FROG_ENTRY_EVENT, { detail: value }));
  }

  return { entry, set };
}
