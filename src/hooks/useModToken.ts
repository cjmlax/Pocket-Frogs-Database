import { useAuth } from 'react-oidc-context';

// pfdb_groups arrives with the "pfdb-" prefix stripped, so "pfdb-mods" → "mods".
// Verify mode is for mods only (not admins, unless they're also mods).
const MOD_GROUP = 'mods';

export function useModToken(): { idToken: string | undefined; isMod: boolean } {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const groups = (auth.user?.profile?.pfdb_groups as string[] | undefined) ?? [];
  return { idToken, isMod: auth.isAuthenticated && !!idToken && groups.includes(MOD_GROUP) };
}
