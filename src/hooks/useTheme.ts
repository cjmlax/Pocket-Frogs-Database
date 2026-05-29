import { useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | null; // null = follow system

const LABELS: Record<string, string> = {
  light: '🌞 Light',
  dark: '🌙 Dark',
  system: '💻 System',
};

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

  function toggle() {
    setTheme(current => {
      if (!current) {
        localStorage.setItem('theme', 'light');
        return 'light';
      } else if (current === 'light') {
        localStorage.setItem('theme', 'dark');
        return 'dark';
      } else {
        localStorage.removeItem('theme');
        return null;
      }
    });
  }

  return { theme, toggle, label: LABELS[theme ?? 'system'] };
}
