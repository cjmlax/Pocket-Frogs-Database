import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listPending, approveSubmission, rejectSubmission, editSubmission,
  type PendingSubmission,
} from '../api/adminSubmissions';
import AuthedImage from '../components/AuthedImage';
import CropDialog from '../components/CropDialog';

// pfdb_groups arrives with the "pfdb-" prefix stripped, so "pfdb-admins" → "admins".
const ADMIN_GROUP = 'admins';

export default function AdminSubmissions() {
  const auth = useAuth();
  const idToken = auth.user?.id_token;
  const groups = (auth.user?.profile?.pfdb_groups as string[] | undefined) ?? [];
  const isAdmin = groups.includes(ADMIN_GROUP);

  const { data: pending, isLoading } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: () => listPending(idToken!),
    enabled: auth.isAuthenticated && isAdmin && !!idToken,
    refetchInterval: 15_000, // poll for new submissions
  });

  if (auth.isLoading) return <p className="search-hint">Loading…</p>;
  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1>Submissions</h1>
        <p className="search-hint">You are not signed in.</p>
        <button className="csv-btn" onClick={() => void auth.signinRedirect()}>Sign in</button>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div>
        <h1>Submissions</h1>
        <p className="search-error">You don't have access to this page.</p>
      </div>
    );
  }

  const rows = pending ?? [];

  return (
    <div>
      <h1>Pending Submissions <span className="breed-weekly-count">({rows.length})</span></h1>
      {isLoading ? (
        <p className="search-hint">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="search-hint">No pending submissions. 🎉</p>
      ) : (
        <div className="submission-list">
          {rows.map(sub => <SubmissionCard key={sub.id} sub={sub} idToken={idToken!} />)}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ sub, idToken }: { sub: PendingSubmission; idToken: string }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-pending'] });

  const [editing, setEditing] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [imgBust, setImgBust] = useState(0);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const approve = useMutation({
    mutationFn: () => approveSubmission(idToken, sub.id),
    onSuccess: (d) => { setResult({ ok: true, text: `Pushed ✓${d.pushed_ref ? ` (${d.pushed_ref})` : ''}` }); setTimeout(refresh, 1000); },
    onError: (e) => setResult({ ok: false, text: (e as Error).message }),
  });
  const reject = useMutation({
    mutationFn: (note: string) => rejectSubmission(idToken, sub.id, note),
    onSuccess: () => { setResult({ ok: true, text: 'Rejected ✓' }); setTimeout(refresh, 1000); },
    onError: (e) => setResult({ ok: false, text: (e as Error).message }),
  });

  const busy = approve.isPending || reject.isPending;

  let fields: Record<string, unknown> = {};
  try { fields = JSON.parse(sub.payload) as Record<string, unknown>; } catch { /* leave empty */ }

  return (
    <div className="submission-card">
      <div className="submission-main">
        <span className="badge-chip submission-type">{sub.type}</span>
        <strong className="submission-summary">{sub.summary}</strong>
        <span className="submission-when">{new Date(sub.createdAt).toLocaleString()}</span>
        {sub.submitterNote && (
          /^https?:\/\//i.test(sub.submitterNote)
            ? <p className="submission-note"><a href={sub.submitterNote} target="_blank" rel="noopener noreferrer">Source ↗</a></p>
            : <p className="submission-note">“{sub.submitterNote}”</p>
        )}
      </div>

      {sub.screenshot && (
        <AuthedImage url={sub.screenshot} bust={imgBust} className="submission-thumb" alt="screenshot" />
      )}

      {!editing && (
        <div className="submission-actions">
          <button className="csv-btn submission-approve" disabled={busy} onClick={() => approve.mutate()}>
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            className="csv-btn submission-reject"
            disabled={busy}
            onClick={() => { const note = window.prompt('Reason (optional):') ?? ''; reject.mutate(note); }}
          >
            {reject.isPending ? 'Rejecting…' : 'Reject'}
          </button>
          <button className="csv-btn" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
          {sub.screenshot && (
            <button className="csv-btn" disabled={busy} onClick={() => setCropping(true)}>Crop</button>
          )}
        </div>
      )}

      {cropping && sub.screenshot && (
        <CropDialog
          id={sub.id}
          screenshotUrl={sub.screenshot}
          onClose={() => setCropping(false)}
          onCropped={() => { setCropping(false); setImgBust(b => b + 1); refresh(); }}
        />
      )}

      {result && <p className={`submission-result ${result.ok ? 'ok' : 'err'}`}>{result.text}</p>}

      {editing && (
        <EditForm
          sub={sub}
          fields={fields}
          idToken={idToken}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); refresh(); }}
        />
      )}
    </div>
  );
}

function EditForm({
  sub, fields, idToken, onClose, onSaved,
}: {
  sub: PendingSubmission;
  fields: Record<string, unknown>;
  idToken: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v ?? '')])),
  );
  const [file, setFile] = useState<File | null>(null);
  const [clearShot, setClearShot] = useState(false);

  const save = useMutation({
    mutationFn: () => editSubmission(idToken, sub.id, values, file, clearShot),
    onSuccess: onSaved,
  });

  return (
    <div className="submission-edit">
      <div className="submission-edit-fields">
        {Object.keys(values).map(key => (
          <label key={key} className="submission-edit-label">
            {key}
            <input
              className="search-input"
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="submission-edit-screenshot">
        {sub.screenshot && !clearShot && <AuthedImage url={sub.screenshot} className="submission-thumb" alt="current" />}
        <label>
          {sub.screenshot ? 'Replace' : 'Add'} screenshot
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {sub.screenshot && (
          <label className="submission-clear">
            <input type="checkbox" checked={clearShot} onChange={e => setClearShot(e.target.checked)} /> Clear screenshot
          </label>
        )}
      </div>

      <div className="submission-actions">
        <button className="csv-btn" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button className="csv-btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
      </div>
      {save.isError && <p className="submission-result err">{(save.error as Error).message}</p>}
    </div>
  );
}
