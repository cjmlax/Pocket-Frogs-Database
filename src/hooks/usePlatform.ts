import { useState, useEffect } from 'react';

export type Platform = 'iOS' | 'Android';

const PLATFORM_EVENT = 'pfdb:platform-change';

// Default platform for per-platform content (e.g. the home page update feed).
// iOS is the site default, so only an Android preference is stored.
export function usePlatform() {
  const [platform, setPlatform] = useState<Platform>(
    () => localStorage.getItem('platform') === 'Android' ? 'Android' : 'iOS',
  );

  useEffect(() => {
    function onchange(e: Event) {
      setPlatform((e as CustomEvent<Platform>).detail);
    }
    window.addEventListener(PLATFORM_EVENT, onchange);
    return () => window.removeEventListener(PLATFORM_EVENT, onchange);
  }, []);

  function set(value: Platform) {
    if (value === 'iOS') {
      localStorage.removeItem('platform');
    } else {
      localStorage.setItem('platform', value);
    }
    window.dispatchEvent(new CustomEvent<Platform>(PLATFORM_EVENT, { detail: value }));
  }

  return { platform, set };
}
