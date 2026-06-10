import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminListBadges, adminSaveBadge, adminDeleteBadge,
  adminListUsers, adminDeleteUser, adminGrantBadge, adminRevokeBadge,
  adminApproveFlair, adminRejectFlair, type BadgeInput,
} from '../api/adminBadges';
import type { Badge } from '../api/profile';

// pfdb_groups arrives with the "pfdb-" prefix stripped, so "pfdb-admins" → "admins".
const ADMIN_GROUP = 'admins';
const EMPTY_FORM: BadgeInput = { id: '', name: '', icon: '', color: '', description: '', sort_order: 0 };

export default function AdminBadges() {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const queryClient = useQueryClient();
  const groups = (auth.user?.profile?.pfdb_groups as string[] | undefined) ?? [];
  const isAdmin = groups.includes(ADMIN_GROUP);
  const enabled = auth.isAuthenticated && isAdmin && !!idToken;

  const badgesQuery = useQuery({ queryKey: ['admin-badges'], queryFn: () => adminListBadges(idToken!), enabled });
  const usersQuery  = useQuery({ queryKey: ['admin-users'],  queryFn: () => adminListUsers(idToken!),  enabled });

  const [form, setForm] = useState<BadgeInput>(EMPTY_FORM);
  const [editing, setEditing] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-badges'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const saveBadge = useMutation({
    mutationFn: () => adminSaveBadge(idToken!, { ...form, sort_order: Number(form.sort_order) || 0 }),
    onSuccess: () => { invalidate(); setForm(EMPTY_FORM); setEditing(false); },
  });
  const removeBadge = useMutation({
    mutationFn: (id: string) => adminDeleteBadge(idToken!, id),
    onSuccess: invalidate,
  });
  const grant = useMutation({
    mutationFn: (v: { sub: string; badgeId: string }) => adminGrantBadge(idToken!, v.sub, v.badgeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const revoke = useMutation({
    mutationFn: (v: { sub: string; badgeId: string }) => adminRevokeBadge(idToken!, v.sub, v.badgeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const removeUser = useMutation({
    mutationFn: (sub: string) => adminDeleteUser(idToken!, sub),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const approveFlair = useMutation({
    mutationFn: (sub: string) => adminApproveFlair(idToken!, sub),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const rejectFlair = useMutation({
    mutationFn: (sub: string) => adminRejectFlair(idToken!, sub),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (auth.isLoading) return <p className="search-hint">Loading…</p>;
  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1>Badge Admin</h1>
        <p className="search-hint">You are not signed in.</p>
        <button className="csv-btn" onClick={() => void auth.signinRedirect()}>Sign in</button>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div>
        <h1>Badge Admin</h1>
        <p className="search-error">You don't have access to this page.</p>
      </div>
    );
  }

  const badges = badgesQuery.data ?? [];
  const users = usersQuery.data ?? [];

  function editBadge(b: Badge) {
    setForm({
      id: b.id, name: b.name, icon: b.icon ?? '', color: b.color ?? '',
      description: b.description ?? '', sort_order: b.sort_order,
    });
    setEditing(true);
  }

  return (
    <div>
      <h1>Badge Admin</h1>

      {/* ── Badge catalog ─────────────────────────────────────────── */}
      <h2>Badges</h2>
      <div className="badge-admin-form">
        <input
          className="search-input" placeholder="id (slug)" value={form.id}
          disabled={editing}
          onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
        />
        <input
          className="search-input" placeholder="Name" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="search-input badge-admin-icon" placeholder="icon" value={form.icon}
          onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
        />
        <input
          className="search-input badge-admin-color" type="color" value={form.color || '#6c5ce7'}
          onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
        />
        <input
          className="search-input" placeholder="Description" value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        />
        <input
          className="search-input badge-admin-sort" type="number" placeholder="sort" value={form.sort_order ?? 0}
          onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
        />
        <button
          className="csv-btn"
          disabled={!form.id.trim() || !form.name.trim() || saveBadge.isPending}
          onClick={() => saveBadge.mutate()}
        >
          {saveBadge.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
        </button>
        {editing && (
          <button className="csv-btn" onClick={() => { setForm(EMPTY_FORM); setEditing(false); }}>Cancel</button>
        )}
      </div>
      {saveBadge.isError && <p className="search-error">{(saveBadge.error as Error).message}</p>}

      {badgesQuery.isLoading ? (
        <p className="search-hint">Loading badges…</p>
      ) : badges.length === 0 ? (
        <p className="search-hint">No badges defined yet.</p>
      ) : (
        <div className="badge-admin-list">
          {badges.map(b => (
            <div key={b.id} className="badge-admin-row">
              <span className="badge-chip" style={b.color ? { borderColor: b.color, color: b.color } : undefined}>
                {b.icon && <span className="badge-chip-icon">{b.icon}</span>}{b.name}
              </span>
              <code className="badge-admin-id">{b.id}</code>
              <span className="badge-admin-sort-label" title="Sort order">sort {b.sort_order}</span>
              <span className="badge-admin-desc">{b.description}</span>
              <button className="csv-btn" onClick={() => editBadge(b)}>Edit</button>
              <button
                className="csv-btn"
                onClick={() => { if (confirm(`Delete badge "${b.name}"? This removes it from all users.`)) removeBadge.mutate(b.id); }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Users + grants ────────────────────────────────────────── */}
      <h2 style={{ marginTop: 28 }}>Users</h2>
      {usersQuery.isLoading ? (
        <p className="search-hint">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="search-hint">No users have signed in yet.</p>
      ) : (
        <div className="badge-admin-users">
          {users.map(u => {
            const held = new Set(u.badges.map(b => b.id));
            const grantable = badges.filter(b => !held.has(b.id));
            return (
              <div key={u.sub} className="badge-admin-user">
                <div className="badge-admin-user-name">
                  <span className="badge-admin-user-id-wrap">
                    {u.username ?? '(no username)'}
                    <code className="badge-admin-user-sub" title="Authentik ID (sub)">{u.sub}</code>
                  </span>
                  <button
                    className="badge-user-remove-btn"
                    disabled={removeUser.isPending}
                    title="Remove this user from the database"
                    onClick={() => {
                      if (confirm(`Remove "${u.username ?? u.sub}" from the database? This deletes their profile, flair, and badges. Do this only after removing them in Authentik — an active user is recreated on next sign-in.`)) {
                        removeUser.mutate(u.sub);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
                {u.flair_pending ? (
                  <div className="flair-review">
                    <span className="flair-review-pending">
                      Friend code requested: <strong>{u.flair_pending}</strong>
                    </span>
                    <button
                      className="csv-btn"
                      disabled={approveFlair.isPending}
                      onClick={() => approveFlair.mutate(u.sub)}
                    >
                      Approve
                    </button>
                    <button
                      className="csv-btn"
                      disabled={rejectFlair.isPending}
                      onClick={() => rejectFlair.mutate(u.sub)}
                    >
                      Reject
                    </button>
                  </div>
                ) : u.flair ? (
                  <div className="flair-review">
                    <span className="flair-review-approved">Friend code: <strong>{u.flair}</strong></span>
                  </div>
                ) : null}
                <div className="badge-admin-user-badges">
                  {u.badges.length === 0 && <span className="search-hint">no badges</span>}
                  {u.badges.map(b => (
                    <span key={b.id} className="badge-chip" style={b.color ? { borderColor: b.color, color: b.color } : undefined}>
                      {b.icon && <span className="badge-chip-icon">{b.icon}</span>}{b.name}
                      <button
                        className="badge-revoke-btn"
                        title="Revoke"
                        onClick={() => revoke.mutate({ sub: u.sub, badgeId: b.id })}
                      >×</button>
                    </span>
                  ))}
                </div>
                {grantable.length > 0 && (
                  <select
                    className="search-input badge-admin-grant"
                    value=""
                    onChange={e => { if (e.target.value) grant.mutate({ sub: u.sub, badgeId: e.target.value }); }}
                  >
                    <option value="">+ grant badge…</option>
                    {grantable.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
