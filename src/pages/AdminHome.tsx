import { useAuth } from 'react-oidc-context';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { listPending, listFlairRequests } from '../api/adminSubmissions';

// pfdb_groups arrives with the "pfdb-" prefix stripped, so "pfdb-admins" → "admins".
const ADMIN_GROUP = 'admins';

export default function AdminHome() {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const groups = (auth.user?.profile?.pfdb_groups as string[] | undefined) ?? [];
  const isAdmin = groups.includes(ADMIN_GROUP);
  const enabled = auth.isAuthenticated && isAdmin && !!idToken;

  // Both queries share their cache keys with the review page, so they're free there.
  const { data: pending } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => listPending(idToken!),
    enabled,
  });
  const { data: flairRequests } = useQuery({
    queryKey: ['admin-flair-requests'],
    queryFn: () => listFlairRequests(idToken!),
    enabled,
  });

  if (auth.isLoading) return <p className="search-hint">Loading…</p>;
  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1>Admin</h1>
        <p className="search-hint">You are not signed in.</p>
        <button className="csv-btn" onClick={() => void auth.signinRedirect()}>Sign in</button>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div>
        <h1>Admin</h1>
        <p className="search-error">You don't have access to this page.</p>
      </div>
    );
  }

  const tools = [
    {
      to: '/admin/submissions',
      title: 'Review Submissions',
      desc: 'Approve, reject, edit, and crop pending community submissions.',
      count: (pending?.length ?? 0) + (flairRequests?.length ?? 0) || undefined,
    },
    {
      to: '/admin/badges',
      title: 'Manage Badges',
      desc: 'Create badges and award them to users.',
      count: undefined as number | undefined,
    },
    {
      to: '/admin/alerts',
      title: 'Site Alerts',
      desc: 'Post dismissable banners for maintenance and announcements.',
      count: undefined as number | undefined,
    },
  ];

  return (
    <div>
      <h1>Admin Tools</h1>
      <div className="admin-tool-grid">
        {tools.map(t => (
          <Link key={t.to} to={t.to} className="admin-tool-card">
            <span className="admin-tool-title">
              {t.title}
              {t.count != null && t.count > 0 && <span className="admin-tool-badge">{t.count}</span>}
            </span>
            <span className="admin-tool-desc">{t.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
