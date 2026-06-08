import { WebStorageStateStore } from 'oidc-client-ts';
import type { AuthProviderProps } from 'react-oidc-context';

// OIDC client settings for the public PFDB SPA. The client ID is a public
// identifier (safe to ship to the browser); this is a public PKCE client, so
// there is no secret here. Override the authority/client at build time with
// VITE_OIDC_AUTHORITY / VITE_OIDC_CLIENT_ID if needed.
export const oidcConfig: AuthProviderProps = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY ?? 'https://pfdbauth.cjmlax.com/application/o/pfdb/',
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'gYpSjz6qGj1e1HUPihJeMt9aTP9I0ymgA877eScc',
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: 'code',
  // 'pfdb' is our custom scope (name + pfdb_groups + connected_accounts). We
  // deliberately omit 'profile' so private-stack group names never reach this app.
  scope: 'openid email pfdb',
  // Persist the session across reloads/tabs instead of the default sessionStorage.
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
  // After a successful login, strip the ?code/&state params and return home.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, '/');
  },
};
