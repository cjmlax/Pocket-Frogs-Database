import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, saveDisplaySource } from '../api/profile';

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

// Connected platforms usable for sign-in only, never shown as a name — Google's
// account name is the user's email address. The worker enforces the same list.
export const SIGN_IN_ONLY_SOURCES = new Set(['google']);

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

  // The worker holds the choice (it names the user in public credits); the
  // localStorage copy just avoids a flash before the profile loads.
  const localSource = useSyncExternalStore(subscribe, getSnapshot, () => 'pfdb');
  const source = profile?.display_source ?? localSource;
  const queryClient = useQueryClient();

  const setSource = useCallback((key: string) => {
    localStorage.setItem(STORAGE_KEY, key);
    // Dispatch so other components in the same window update via useSyncExternalStore.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: key }));
    if (idToken) {
      saveDisplaySource(idToken, key)
        .then(updated => queryClient.setQueryData(['me'], updated))
        .catch(() => { /* keep the local choice; retried on the next pick */ });
    }
  }, [idToken, queryClient]);

  // One-time upload of a choice made before the worker stored it.
  const needsSync = !!profile && profile.display_source === null && localSource !== 'pfdb';
  useEffect(() => {
    if (needsSync) setSource(localSource);
  }, [needsSync, localSource, setSource]);

  const options: DisplayNameOption[] = [
    { key: 'pfdb', label: 'Friend Code', name: profile?.flair ?? '', icon: null },
    ...Object.entries(connected).filter(([platform]) => !SIGN_IN_ONLY_SOURCES.has(platform)).map(([platform, name]) => ({
      key: platform,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
      name: String(name),
      icon: platformIcon(platform),
    })),
  ].filter(o => o.name);

  const current = options.find(o => o.key === source) ?? options[0];
  const displayName = current?.name || String(claims?.preferred_username ?? claims?.name ?? 'Account');

  return { displayName, source, setSource, options, current, connectedKeys: Object.keys(connected) };
}
