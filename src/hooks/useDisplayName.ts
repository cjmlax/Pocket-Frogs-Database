import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '../api/profile';

const STORAGE_KEY = 'pfdb_display_name_source';

// Known platform key → domain for favicon lookup. Falls back to `${key}.com`.
const PLATFORM_DOMAINS: Record<string, string> = {
  discord:   'discord.com',
  google:    'google.com',
  github:    'github.com',
  gitlab:    'gitlab.com',
  twitter:   'x.com',
  x:         'x.com',
  reddit:    'reddit.com',
  twitch:    'twitch.tv',
  steam:     'steamcommunity.com',
  microsoft: 'microsoft.com',
  apple:     'apple.com',
  facebook:  'facebook.com',
  instagram: 'instagram.com',
};

// Returns a 32 px favicon URL for the platform, or null for the PFDB base account.
export function platformIcon(key: string): string | null {
  if (key === 'pfdb') return null;
  const domain = PLATFORM_DOMAINS[key] ?? `${key}.com`;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

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
  icon: string | null;
}

export function useDisplayName() {
  const auth = useAuth();
  const claims = auth.user?.profile;
  const idToken = auth.user?.id_token;
  const connected = (claims?.connected_accounts as Record<string, string> | undefined) ?? {};

  // Shares the ['me'] cache with Account.tsx — no extra fetch when already loaded.
  const { data: profile } = useQuery({
    queryKey: ['me'],
    queryFn: () => fetchMe(idToken!),
    enabled: auth.isAuthenticated && !!idToken,
  });

  const source = useSyncExternalStore(subscribe, getSnapshot, () => 'pfdb');

  const setSource = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    // Dispatch so other components in the same window update via useSyncExternalStore.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: key }));
  }, []);

  const options: DisplayNameOption[] = [
    { key: 'pfdb', label: 'Friend Code', name: profile?.flair ?? '', icon: null },
    ...Object.entries(connected).map(([platform, name]) => ({
      key: platform,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      name: String(name),
      icon: platformIcon(platform),
    })),
  ].filter(o => o.name);

  const current = options.find(o => o.key === source) ?? options[0];
  const displayName = current?.name || String(claims?.preferred_username ?? claims?.name ?? 'Account');

  return { displayName, source, setSource, options, current };
}
