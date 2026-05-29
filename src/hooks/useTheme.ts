import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | null; // null = follow system


export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(
    () => localStorage.getItem('theme') as ThemeMode,
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark-mode', 'light-mode');
    if (theme === 'dark') {
      root.classList.add('dark-mode');
    } else if (theme === 'light') {
      root.classList.add('light-mode');
    }
    // null = system: no class needed, the CSS media query handles it
  }, [theme]);

  function choose(mode: ThemeMode) {
    if (mode === null) {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', mode);
    }
    setTheme(mode);
  }

  return { theme, choose };
}
