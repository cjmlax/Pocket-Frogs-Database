import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminListAlerts, adminCreateAlert, adminUpdateAlert, adminDeleteAlert,
  type AlertLevel, type AdminAlert,
} from '../api/alerts';

// pfdb_groups arrives with the "pfdb-" prefix stripped, so "pfdb-admins" → "admins".
const ADMIN_GROUP = 'admins';
const LEVELS: { value: AlertLevel; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

export default function AdminAlerts() {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const queryClient = useQueryClient();
  const groups = (auth.user?.profile?.pfdb_groups as string[] | undefined) ?? [];
  const isAdmin = groups.includes(ADMIN_GROUP);
  const enabled = auth.isAuthenticated && isAdmin && !!idToken;

  const alertsQuery = useQuery({ queryKey: ['admin-alerts'], queryFn: () => adminListAlerts(idToken!), enabled });

  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<AlertLevel>('info');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });

  const create = useMutation({
    mutationFn: () => adminCreateAlert(idToken!, message.trim(), level),
    onSuccess: () => { invalidate(); setMessage(''); setLevel('info'); },
  });
  const toggleActive = useMutation({
    mutationFn: (a: AdminAlert) => adminUpdateAlert(idToken!, a.id, { active: !a.active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteAlert(idToken!, id),
    onSuccess: invalidate,
  });

  if (auth.isLoading) return <p className="search-hint">Loading…</p>;
  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1>Site Alerts</h1>
        <p className="search-hint">You are not signed in.</p>
        <button className="csv-btn" onClick={() => void auth.signinRedirect()}>Sign in</button>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div>
        <h1>Site Alerts</h1>
        <p className="search-error">You don't have access to this page.</p>
      </div>
    );
  }

  const alerts = alertsQuery.data ?? [];

  return (
    <div>
      <h1>Site Alerts</h1>
      <p className="search-hint">
        Post a dismissable banner shown on every page — for upcoming maintenance, temporarily
        broken features, or other announcements. Visitors can dismiss each alert individually;
        it reappears for them only if you edit its message.
      </p>

      <div className="badge-admin-form">
        <input
          className="search-input alert-admin-message" placeholder="Alert message" value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && message.trim() && !create.isPending) create.mutate(); }}
        />
        <select className="search-input" value={level} onChange={e => setLevel(e.target.value as AlertLevel)}>
          {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <button className="csv-btn" disabled={!message.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Posting…' : 'Post Alert'}
        </button>
      </div>
      {create.isError && <p className="search-error">{(create.error as Error).message}</p>}

      {alertsQuery.isLoading ? (
        <p className="search-hint">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <p className="search-hint">No alerts posted yet.</p>
      ) : (
        <div className="badge-admin-list">
          {alerts.map(a => (
            <div key={a.id} className={`alert-admin-row alert-admin-row-${a.level}${a.active ? '' : ' alert-admin-row-inactive'}`}>
              <span className="alert-admin-level">{a.level}</span>
              <span className="alert-admin-message-text">{a.message}</span>
              <button className="csv-btn" onClick={() => toggleActive.mutate(a)} disabled={toggleActive.isPending}>
                {a.active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                className="csv-btn"
                disabled={remove.isPending}
                onClick={() => { if (confirm('Delete this alert?')) remove.mutate(a.id); }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
