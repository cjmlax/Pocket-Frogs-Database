import { useState, useEffect } from 'react';

const EXPORT_API = (import.meta.env.VITE_SUBMIT_API ?? 'https://pfdb-api.cjmlax.com').replace(/\/$/, '');

interface TableMeta {
  slug: string;
  label: string;
  lastExported: string | null;
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
        setDlErrors(e => ({ ...e, [slug]: 'Too many downloads — please wait a few minutes and try again.' }));
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
      a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setTables(ts =>
        ts?.map(t => t.slug === slug ? { ...t, lastExported: new Date().toISOString() } : t) ?? null,
      );
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
        Download raw data from any table below. Each export is pulled directly from the database and is current at the time of download.
      </p>

      {loadError ? (
        <p className="search-error">Could not load export options. Please try again later.</p>
      ) : !tables ? (
        <p className="search-hint">Loading…</p>
      ) : (
        <div className="export-table-list">
          {tables.map(({ slug, label, lastExported }) => (
            <div key={slug} className="export-table-row">
              <div className="export-table-info">
                <span className="export-table-name">{label}</span>
                <span className="export-table-meta submit-optional">
                  {lastExported ? `Last exported ${timeAgo(lastExported)}` : 'Not yet exported this session'}
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
