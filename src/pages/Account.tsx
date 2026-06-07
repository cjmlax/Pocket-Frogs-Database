import { useAuth } from 'react-oidc-context';

// Temporary account / auth-inspection page. Lets us sign in against Authentik and
// see exactly what claims the token carries (sub, groups, profile) before we
// build the real profile UI, badges, and the connected_accounts mapping.
export default function Account() {
  const auth = useAuth();

  if (auth.isLoading) return <p className="search-hint">Loading…</p>;
  if (auth.error) return <p className="search-error">Auth error: {auth.error.message}</p>;

  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1>Account</h1>
        <p className="search-hint">You are not signed in.</p>
        <button className="csv-btn" onClick={() => void auth.signinRedirect()}>Sign in</button>
      </div>
    );
  }

  const profile = auth.user?.profile;
  const groups = (profile?.pfdb_groups as string[] | undefined) ?? [];
  const connected = (profile?.connected_accounts as Record<string, string> | undefined) ?? {};
  const connectedList = Object.entries(connected);

  return (
    <div>
      <h1>Account</h1>
      <div className="breed-info-stats" style={{ marginBottom: 16 }}>
        <div className="breed-info-stat">
          <span className="breed-info-stat-label">Name</span>
          <span className="breed-info-stat-value">{String(profile?.name ?? profile?.preferred_username ?? '—')}</span>
        </div>
        <div className="breed-info-stat">
          <span className="breed-info-stat-label">Email</span>
          <span className="breed-info-stat-value">{String(profile?.email ?? '—')}</span>
        </div>
        <div className="breed-info-stat">
          <span className="breed-info-stat-label">PFDB Groups</span>
          <span className="breed-info-stat-value">{groups.length ? groups.join(', ') : '—'}</span>
        </div>
        <div className="breed-info-stat">
          <span className="breed-info-stat-label">Connected Accounts</span>
          <span className="breed-info-stat-value">
            {connectedList.length ? connectedList.map(([p, u]) => `${p}: ${u}`).join(' · ') : '—'}
          </span>
        </div>
      </div>

      <button className="csv-btn" onClick={() => void auth.signoutRedirect()}>Sign out</button>

      <h2 style={{ marginTop: 24 }}>Raw token claims</h2>
      <pre className="auth-claims-dump">{JSON.stringify(profile, null, 2)}</pre>
    </div>
  );
}
