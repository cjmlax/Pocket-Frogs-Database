import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMe, submitFriendCode, cancelFriendCode, confirmFriendCode, fetchMySubmissions } from '../api/profile';

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

  // Friend-code workflow drafts: the code to submit (idle), and the passphrase to
  // confirm (after the admin marks it Sent).
  const [codeDraft, setCodeDraft] = useState('');
  const [passDraft, setPassDraft] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  useEffect(() => {
    // Seed the code box with any approved code so editing feels natural; clear it
    // while a request is in flight (the input is read-only/greyed then anyway).
    if (profile) setCodeDraft(profile.flair_status ? '' : (profile.flair ?? ''));
  }, [profile]);

  const submitFlair = useMutation({
    mutationFn: () => submitFriendCode(idToken!, codeDraft.trim()),
    onSuccess: updated => queryClient.setQueryData(['me'], updated),
  });
  const cancelFlair = useMutation({
    mutationFn: () => cancelFriendCode(idToken!),
    onSuccess: updated => { queryClient.setQueryData(['me'], updated); setPassDraft(''); setConfirmError(null); },
  });
  const confirmFlair = useMutation({
    mutationFn: () => confirmFriendCode(idToken!, passDraft),
    onSuccess: res => {
      queryClient.setQueryData(['me'], res.profile);
      if (res.ok) { setPassDraft(''); setConfirmError(null); }
      else setConfirmError('That confirmation code did not match. Please try again.');
    },
    onError: e => setConfirmError((e as Error).message),
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
        Submit your in-game Friend Code to display it next to your name. We'll send
        you an in-game friend request, then ask you to enter a confirmation code to
        verify it's really you before it goes live.
      </p>

      {profile?.flair_status === 'pending' ? (
        // ── Submitted, waiting on the admin to send the in-game friend request ──
        <div className="flair-state">
          <div className="flair-editor">
            <input className="search-input" value={profile.flair_pending ?? ''} readOnly disabled />
            <button className="csv-btn" disabled={cancelFlair.isPending} onClick={() => cancelFlair.mutate()}>
              {cancelFlair.isPending ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
          <p className="submission-pending-hint" style={{ marginTop: 6 }}>
            Submission pending — we'll send your in-game friend request shortly.
          </p>
        </div>
      ) : profile?.flair_status === 'sent' ? (
        // ── Admin sent it; user enters the passphrase to confirm and publish ──
        <div className="flair-state">
          <p className="search-hint" style={{ marginTop: 0 }}>
            We've sent your in-game friend request for <strong>{profile.flair_pending}</strong>.
            Enter the confirmation code from that request to verify and publish it.
          </p>
          <div className="flair-editor">
            <input
              className="search-input"
              maxLength={80}
              value={passDraft}
              placeholder="Confirmation code"
              onChange={e => { setPassDraft(e.target.value); setConfirmError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && passDraft.trim() && !confirmFlair.isPending) confirmFlair.mutate(); }}
            />
            <button
              className="csv-btn"
              disabled={confirmFlair.isPending || !passDraft.trim()}
              onClick={() => confirmFlair.mutate()}
            >
              {confirmFlair.isPending ? 'Confirming…' : 'Confirm'}
            </button>
            <button className="csv-btn" disabled={cancelFlair.isPending} onClick={() => cancelFlair.mutate()}>
              Cancel
            </button>
          </div>
          {confirmError && <p className="search-error" style={{ marginTop: 6 }}>{confirmError}</p>}
        </div>
      ) : (
        // ── Idle: no active request (may have an approved code) ──
        <div className="flair-state">
          <div className="flair-editor">
            <input
              className="search-input"
              maxLength={80}
              value={codeDraft}
              placeholder="Your in-game Friend Code"
              onChange={e => setCodeDraft(e.target.value)}
            />
            <button
              className="csv-btn"
              disabled={submitFlair.isPending || !codeDraft.trim() || codeDraft.trim() === (profile?.flair ?? '')}
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
          {submitFlair.isError && (
            <p className="search-error" style={{ marginTop: 6 }}>{(submitFlair.error as Error).message}</p>
          )}
        </div>
      )}

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
