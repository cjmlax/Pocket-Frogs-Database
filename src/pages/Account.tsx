import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMe, submitFriendCode, cancelFriendCode, confirmFriendCode, fetchMySubmissions } from '../api/profile';
import { useDisplayName, platformIcon, type DisplayNameOption } from '../hooks/useDisplayName';
import { badgeChipStyle } from '../utils/badgeStyle';
import { sourceLoginOptions } from '../auth/authConfig';

// Fallback avatar shown for options with no platform favicon (currently just Friend Code).
function IconAvatar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="6.5" r="3" />
      <circle cx="17" cy="6.5" r="3" />
      <circle cx="7" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="17" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
      <rect x="3" y="9" width="18" height="10" rx="5" />
      <path d="M8.5 15.5q3.5 2.5 7 0" />
    </svg>
  );
}

// A connected display-name source — click to make it the name shown site-wide.
function ConnectedTile({ opt, active, onSelect }: { opt: DisplayNameOption; active: boolean; onSelect: () => void }) {
  return (
    <button className={`display-name-opt${active ? ' active' : ''}`} onClick={onSelect}>
      <span className="display-name-opt-header">
        {opt.icon ? <img src={opt.icon} width={16} height={16} style={{ borderRadius: 3 }} alt="" /> : <IconAvatar />}
        <span className="display-name-opt-platform">{opt.label}</span>
      </span>
      <span className="display-name-opt-name">{opt.name}</span>
    </button>
  );
}

export default function Account() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const idToken = auth.user?.id_token;
  const { source, setSource, options } = useDisplayName();

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
  // Inline (no-popup) two-step confirmation for clearing an already-approved code.
  const [confirmingClear, setConfirmingClear] = useState(false);

  const submitFlair = useMutation({
    mutationFn: () => submitFriendCode(idToken!, codeDraft.trim()),
    onSuccess: updated => { queryClient.setQueryData(['me'], updated); setCodeDraft(''); },
  });
  const cancelFlair = useMutation({
    mutationFn: () => cancelFriendCode(idToken!),
    onSuccess: updated => {
      queryClient.setQueryData(['me'], updated);
      setPassDraft('');
      setConfirmError(null);
      setConfirmingClear(false);
    },
  });
  const confirmFlair = useMutation({
    mutationFn: () => confirmFriendCode(idToken!, passDraft),
    onSuccess: res => {
      queryClient.setQueryData(['me'], res.profile);
      if (res.ok) { setPassDraft(''); setConfirmError(null); }
      else setConfirmError('That frog was incorrect. Please double check spelling and re-submit.');
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

  return (
    <div>
      <h1>Account</h1>

      <h2 style={{ marginTop: 24 }}>Display Name</h2>
      <p className="search-hint" style={{ marginTop: 0 }}>
        {options.length > 1
          ? 'Choose which account name is shown throughout the site.'
          : 'Link another account to set the name shown throughout the site.'}
      </p>
      <div className="display-name-picker">
        {/* Friend Code — always visible; blank and non-interactive until one is
            approved via the request flow further down the page. */}
        {profile?.flair ? (
          <ConnectedTile
            opt={{ key: 'pfdb', label: 'Friend Code', name: profile.flair, icon: null }}
            active={source === 'pfdb'}
            onSelect={() => setSource('pfdb')}
          />
        ) : (
          <div className="display-name-opt display-name-opt-empty" aria-disabled="true">
            <span className="display-name-opt-header">
              <IconAvatar />
              <span className="display-name-opt-platform">Friend Code</span>
            </span>
            <span className="display-name-opt-name">{' '}</span>
          </div>
        )}

        {/* Known login sources — always visible; connected ones are selectable,
            unconnected ones deep-link straight to that provider's OIDC login. */}
        {sourceLoginOptions.map(s => {
          const opt = options.find(o => o.key === s.key);
          if (opt) return <ConnectedTile key={s.key} opt={opt} active={source === opt.key} onSelect={() => setSource(opt.key)} />;
          const icon = platformIcon(s.key);
          return (
            <a key={s.key} className="display-name-add" href={s.loginUrl} aria-label={`Connect ${s.label}`} title={`Connect ${s.label}`}>
              {icon && <img src={icon} width={16} height={16} style={{ borderRadius: 3 }} alt="" />}
              <span className="display-name-add-label">{s.label}</span>
            </a>
          );
        })}

        {/* Any other connected source Authentik reports that isn't one of the
            fixed tiles above (no dedicated login URL for these yet). */}
        {options
          .filter(o => o.key !== 'pfdb' && !sourceLoginOptions.some(s => s.key === o.key))
          .map(opt => (
            <ConnectedTile key={opt.key} opt={opt} active={source === opt.key} onSelect={() => setSource(opt.key)} />
          ))}
      </div>

      <h2 style={{ marginTop: 24 }}>Badges</h2>
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
              style={badgeChipStyle(b.color)}
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
      {profile?.flair && !profile?.flair_status ? (
        // ── Approved and live — show read-only; hide the submission dialogue ──
        <div className="flair-state">
          <p className="search-hint" style={{ marginTop: 0 }}>
            Your Friend Code: <strong>{profile.flair}</strong>
          </p>
          {confirmingClear ? (
            <div className="flair-editor">
              <span className="search-hint" style={{ marginTop: 0 }}>Clear your Friend Code — are you sure?</span>
              <button className="csv-btn" disabled={cancelFlair.isPending} onClick={() => cancelFlair.mutate()}>
                {cancelFlair.isPending ? 'Clearing…' : 'Yes, clear it'}
              </button>
              <button className="csv-btn" disabled={cancelFlair.isPending} onClick={() => setConfirmingClear(false)}>
                Never mind
              </button>
            </div>
          ) : (
            <button className="csv-btn" onClick={() => setConfirmingClear(true)}>Clear</button>
          )}
        </div>
      ) : (
        <>
          <p className="search-hint" style={{ marginTop: 0 }}>
            Submit your Friend Code as a display name choice on this site. You'll be sent
            a frog in-game and then asked to enter that frog here as confirmation.
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
                Submission received — site admins have been notified.
              </p>
            </div>
          ) : profile?.flair_status === 'sent' ? (
            // ── Admin sent it; user enters the passphrase to confirm and publish ──
            <div className="flair-state">
              <p className="search-hint" style={{ marginTop: 0 }}>
                We've sent a frog from <strong>{profile.flair_sender_code}</strong> to <strong>{profile.flair_pending}</strong>.
                Enter the full name of the frog and click confirm to complete the registration.
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
            // ── Idle: no approved code yet ──
            <div className="flair-state">
              <div className="flair-editor">
                <input
                  className="search-input"
                  maxLength={80}
                  value={codeDraft}
                  placeholder="Your Pocket Frogs Friend Code"
                  onChange={e => setCodeDraft(e.target.value)}
                />
                <button
                  className="csv-btn"
                  disabled={submitFlair.isPending || !codeDraft.trim()}
                  onClick={() => submitFlair.mutate()}
                >
                  {submitFlair.isPending ? 'Submitting…' : 'Submit for review'}
                </button>
              </div>
              {submitFlair.isError && (
                <p className="search-error" style={{ marginTop: 6 }}>{(submitFlair.error as Error).message}</p>
              )}
            </div>
          )}
        </>
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
    </div>
  );
}
