import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMe, submitFriendCode, fetchMySubmissions } from '../api/profile';

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

  // Seed the draft from whatever's most current: a pending request if one exists,
  // otherwise the approved code.
  const [flairDraft, setFlairDraft] = useState('');
  useEffect(() => {
    if (profile) setFlairDraft(profile.flair_pending ?? profile.flair ?? '');
  }, [profile]);

  const submitFlair = useMutation({
    mutationFn: () => submitFriendCode(idToken!, flairDraft.trim()),
    onSuccess: updated => queryClient.setQueryData(['me'], updated),
  });

  const { data: submissions } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: () => fetchMySubmissions(idToken!),
    enabled: auth.isAuthenticated && !!idToken,
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
  const isAdmin = groups.includes('admins');

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

      <h2 style={{ marginTop: 24 }}>Friend Code</h2>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Submit your in-game Friend Code to display it next to your name. Each
        submission is reviewed and confirmed manually before it goes live.
      </p>
      <div className="flair-editor">
        <input
          className="search-input"
          maxLength={80}
          value={flairDraft}
          placeholder="Your in-game Friend Code"
          onChange={e => setFlairDraft(e.target.value)}
        />
        <button
          className="csv-btn"
          disabled={
            submitFlair.isPending || !profile ||
            (profile.flair_pending ?? profile.flair ?? '') === flairDraft.trim()
          }
          onClick={() => submitFlair.mutate()}
        >
          {submitFlair.isPending ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>
      {profile?.flair && (
        <p className="search-hint" style={{ marginTop: 6 }}>
          Approved Friend Code: <strong>{profile.flair}</strong>
        </p>
      )}
      {profile?.flair_pending && (
        <p className="submission-pending-hint" style={{ marginTop: 6 }}>
          Pending review: <strong>{profile.flair_pending}</strong>
        </p>
      )}
      {submitFlair.isError && <p className="search-error">Could not submit your Friend Code.</p>}

      {(() => {
        const approved = submissions?.filter(s => s.status === 'pushed');
        const pendingCount = submissions?.filter(s => s.status === 'pending').length ?? 0;
        return (
          <>
            <h2 style={{ marginTop: 24 }}>Your Approved Combinations</h2>
            {!submissions ? (
              <p className="search-hint">Loading…</p>
            ) : !approved || approved.length === 0 ? (
              <p className="search-hint">No approved combinations yet.</p>
            ) : (
              <div className="submission-history">
                {approved.map(s => (
                  <div key={s.id} className="submission-history-row">
                    <span className="submission-history-summary">{s.summary}</span>
                    <span className="submission-history-date">
                      {new Date(s.reviewedAt ?? s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {pendingCount > 0 && (
              <p className="submission-pending-hint">
                {pendingCount} submission{pendingCount === 1 ? '' : 's'} pending review.
              </p>
            )}
          </>
        );
      })()}

      {isAdmin && (
        <p style={{ marginTop: 24 }}>
          <Link to="/admin" className="csv-btn">Admin tools →</Link>
        </p>
      )}

      <button className="csv-btn" style={{ marginTop: isAdmin ? 8 : 24 }} onClick={() => void auth.signoutRedirect()}>
        Sign out
      </button>
    </div>
  );
}
