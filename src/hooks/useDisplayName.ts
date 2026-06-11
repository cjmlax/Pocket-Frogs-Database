import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from 'react-oidc-context';

const STORAGE_KEY = 'pfdb_display_name_source';

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
}

function getSnapshot(): string {
  return localStorage.getItem(STORAGE_KEY) ?? 'pfdb';
}

export interface DisplayNameOption {
  key: string;
  label: string;
  name: string;
}

export function useDisplayName() {
  const auth = useAuth();
  const claims = auth.user?.profile;
  const connected = (claims?.connected_accounts as Record<string, string> | undefined) ?? {};

  const source = useSyncExternalStore(subscribe, getSnapshot, () => 'pfdb');

  const setSource = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    // Dispatch so other components in the same window update via useSyncExternalStore.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: key }));
  }, []);

  const options: DisplayNameOption[] = [
    { key: 'pfdb', label: 'PFDB', name: String(claims?.preferred_username ?? '') },
    ...Object.entries(connected).map(([platform, name]) => ({
      key: platform,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      name: String(name),
    })),
  ].filter(o => o.name);

  const current = options.find(o => o.key === source) ?? options[0];
  const displayName = current?.name || String(claims?.preferred_username ?? claims?.name ?? 'Account');

  return { displayName, source, setSource, options, current };
}
