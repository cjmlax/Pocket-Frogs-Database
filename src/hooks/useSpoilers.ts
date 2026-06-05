import { useState, useEffect } from 'react';

const SPOILERS_EVENT = 'pfdb:spoilers-change';

export function useSpoilers() {
  const [spoilers, setSpoilers] = useState<boolean>(
    () => localStorage.getItem('spoilers') !== 'false',
  );

  useEffect(() => {
    function onchange(e: Event) {
      setSpoilers((e as CustomEvent<boolean>).detail);
    }
    window.addEventListener(SPOILERS_EVENT, onchange);
    return () => window.removeEventListener(SPOILERS_EVENT, onchange);
  }, []);

  function set(value: boolean) {
    if (value) {
      localStorage.removeItem('spoilers');
    } else {
      localStorage.setItem('spoilers', 'false');
    }
    window.dispatchEvent(new CustomEvent<boolean>(SPOILERS_EVENT, { detail: value }));
  }

  return { spoilers, set };
}
