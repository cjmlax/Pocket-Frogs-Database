import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMe, updateFlair } from '../api/profile';

export default function Account() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const idToken = auth.user?.id_token;

  // The worker-owned profile (badges + flair), keyed on the Authentik subject.
  const { data: profile, isLoading: profileLoading, isError: profileError } = useQuery({
    queryKey: ['me'],
    queryFn: () => fetchMe(idToken!),
    enabled: auth.isAuthenticated && !!idToken,
  });

  const [flairDraft, setFlairDraft] = useState('');
  useEffect(() => {
    if (profile) setFlairDraft(profile.flair ?? '');
  }, [profile]);

  const saveFlair = useMutation({
    mutationFn: () => updateFlair(idToken!, flairDraft),
    onSuccess: updated => queryClient.setQueryData(['me'], updated),
  });

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

  // Identity claims come straight from the token; badges/flair from the worker.
  const claims = auth.user?.profile;
  const groups = (claims?.pfdb_groups as string[] | undefined) ?? [];
  const connected = (claims?.connected_accounts as Record<string, string> | undefined) ?? {};
  const connectedList = Object.entries(connected);

  return (
    <div>
      <h1>Account</h1>

      <div className="breed-info-stats" style={{ marginBottom: 16 }}>
        <div className="breed-info-stat">
          <span className="breed-info-stat-label">Name</span>
          <span className="breed-info-stat-value">{String(claims?.name ?? claims?.preferred_username ?? '—')}</span>
        </div>
        <div className="breed-info-stat">
          <span className="breed-info-stat-label">Email</span>
          <span className="breed-info-stat-value">{String(claims?.email ?? '—')}</span>
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

      <h2>Badges</h2>
      {profileLoading ? (
        <p className="search-hint">Loading profile…</p>
      ) : profileError ? (
        <p className="search-error">Could not load your profile.</p>
      ) : profile && profile.badges.length > 0 ? (
        <div className="badge-list">
          {profile.badges.map(b => (
            <span
              key={b.id}
              className="badge-chip"
              style={b.color ? { borderColor: b.color, color: b.color } : undefined}
              title={b.description ?? undefined}
            >
              {b.icon && <span className="badge-chip-icon">{b.icon}</span>}
              {b.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="search-hint">No badges yet.</p>
      )}

      <h2 style={{ marginTop: 24 }}>Flair</h2>
      <div className="flair-editor">
        <input
          className="search-input"
          maxLength={80}
          value={flairDraft}
          placeholder="A short tagline shown next to your name"
          onChange={e => setFlairDraft(e.target.value)}
        />
        <button
          className="csv-btn"
          disabled={saveFlair.isPending || !profile || (profile.flair ?? '') === flairDraft}
          onClick={() => saveFlair.mutate()}
        >
          {saveFlair.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saveFlair.isError && <p className="search-error">Could not save flair.</p>}

      <button className="csv-btn" style={{ marginTop: 24 }} onClick={() => void auth.signoutRedirect()}>
        Sign out
      </button>
    </div>
  );
}
