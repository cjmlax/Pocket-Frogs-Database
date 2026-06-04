import { useState, useEffect } from 'react';

const EXPORT_API = (import.meta.env.VITE_SUBMIT_API ?? 'https://pfdb-api.cjmlax.com').replace(/\/$/, '');

interface TableMeta {
  slug: string;
  label: string;
  hash: string | null;
  exportedAt: string | null;
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Downloads() {
  const [tables, setTables] = useState<TableMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [dlErrors, setDlErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${EXPORT_API}/api/export`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: TableMeta[]) => setTables(data))
      .catch(() => setLoadError(true));
  }, []);

  async function handleDownload(slug: string) {
    setDownloading(d => ({ ...d, [slug]: true }));
    setDlErrors(e => ({ ...e, [slug]: '' }));
    try {
      const res = await fetch(`${EXPORT_API}/api/export/${slug}`);
      if (res.status === 429) {
        setDlErrors(e => ({ ...e, [slug]: 'Rate limit reached — please try again later.' }));
        return;
      }
      if (!res.ok) {
        setDlErrors(e => ({ ...e, [slug]: 'Export failed. Please try again.' }));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename comes from Content-Disposition on the server (includes hash).
      // The fallback here is overridden by the browser honouring that header.
      a.download = `${slug}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Re-fetch meta so the displayed hash updates for everyone, not just the downloader.
      const fresh: TableMeta[] | null = await fetch(`${EXPORT_API}/api/export`)
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (fresh) setTables(fresh);
    } catch {
      setDlErrors(e => ({ ...e, [slug]: 'Download failed. Please try again.' }));
    } finally {
      setDownloading(d => ({ ...d, [slug]: false }));
    }
  }

  return (
    <div>
      <h1>Database Exports</h1>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Data is available for export as it's stored in the database. Note that this is stored as I coded it, and I don't currently have a guide to decipher it. The exports are direct from the database and the fingerprints are checked/updated when anyone pulls a download, or at least every 24 hrs. If your filename has the same hash as below, you do not need to re-export the data.
      </p>

      {loadError ? (
        <p className="search-error">Could not load export options. Please try again later.</p>
      ) : !tables ? (
        <p className="search-hint">Loading…</p>
      ) : (
        <div className="export-table-list">
          {tables.map(({ slug, label, hash, exportedAt }) => (
            <div key={slug} className="export-table-row">
              <div className="export-table-info">
                <span className="export-table-name">{label}</span>
                <span className="export-table-meta submit-optional">
                  {hash
                    ? <>Fingerprint: <code>{hash}</code> · {exportedAt ? timeAgo(exportedAt) : ''}</>
                    : 'Export hash not yet generated'}
                </span>
              </div>
              <div className="export-table-action">
                {dlErrors[slug] && (
                  <span className="search-error" style={{ fontSize: '0.85em' }}>{dlErrors[slug]}</span>
                )}
                <button
                  className="csv-btn"
                  type="button"
                  disabled={downloading[slug]}
                  onClick={() => handleDownload(slug)}
                >
                  {downloading[slug] ? 'Downloading…' : 'Download CSV'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
