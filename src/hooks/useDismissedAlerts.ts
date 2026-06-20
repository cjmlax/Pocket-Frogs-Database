import { useState } from 'react';

const STORAGE_KEY = 'dismissed-alerts';

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function useDismissedAlerts() {
  const [dismissed, setDismissed] = useState<Set<string>>(read);

  function dismiss(id: string) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return { dismissed, dismiss };
}
