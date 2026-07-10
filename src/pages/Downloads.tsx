import { useState, useEffect } from 'react';
import { fetchTableMeta, TABLES } from '../api/teable';
import { API_BASE } from '../api/base';

interface TableMeta {
  slug: string;
  label: string;
  hash: string | null;
  exportedAt: string | null;
}

// Maps export slugs to their corresponding Teable table IDs
const SLUG_TO_TABLE_ID: Record<string, string> = {
  breeds: TABLES.breeds.id,
  bases:  TABLES.bases.id,
  secs:   TABLES.secs.id,
  frogs:  TABLES.frogs.id,
  weekly: TABLES.weekly.id,
  chroma: TABLES.chroma.id,
  glass:  TABLES.glass.id,
  levels: TABLES.levels.id,
};

// Fill these in with a short description of what each exported file contains.
const TABLE_DESCRIPTIONS: Record<string, string> = {
  breeds: '',
  bases:  '',
  secs:   '',
  frogs:  '',
  weekly: '',
  chroma: '',
  glass:  '',
  levels: '',
};

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
  const [tsMeta, setTsMeta] = useState<Map<string, string> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/export`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: TableMeta[]) => setTables(data))
      .catch(() => setLoadError(true));

    fetchTableMeta()
      .then(setTsMeta)
      .catch(() => {}); // non-critical — page works fine without it
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh: TableMeta[] | null = await fetch(`${API_BASE}/api/export/refresh`, { method: 'POST', cache: 'no-store' })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (fresh) setTables(fresh);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDownload(slug: string) {
    setDownloading(d => ({ ...d, [slug]: true }));
    setDlErrors(e => ({ ...e, [slug]: '' }));
    try {
      const res = await fetch(`${API_BASE}/api/export/${slug}`);
      if (res.status === 429) {
        setDlErrors(e => ({ ...e, [slug]: 'Rate limit reached — please try again later.' }));
        return;
      }
      if (!res.ok) {
        setDlErrors(e => ({ ...e, [slug]: 'Export failed. Please try again.' }));
        return;
      }
      const filename = res.url.split('/').pop() ?? `${slug}.csv`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Re-fetch meta so the displayed hash updates for everyone, not just the downloader.
      const fresh: TableMeta[] | null = await fetch(`${API_BASE}/api/export`, { cache: 'no-store' })
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h1>Database Exports</h1>
        <button
          className={`refresh-btn${refreshing ? ' spinning' : ''}`}
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh export data"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 16h5v5"/>
          </svg>
        </button>
      </div>
      <p className="search-hint" style={{ marginTop: 0 }}>
        Data is available for export as it's stored in the database. The files are a direct API call to the database for that table. This means you will need an internet connnection to start and complete the download.
      </p>
      <p className="search-hint"> If you're looking to validate a previous download, use the hash or 'fingerprint' value. This value changes as the data does, so a different value means updated data.</p>

      {loadError ? (
        <p className="search-error">Could not load export options. Please try again later.</p>
      ) : !tables ? (
        <p className="search-hint">Loading…</p>
      ) : (
        <div className="export-table-list">
          {tables.map(({ slug, label, hash, exportedAt }) => {
            const tableId  = SLUG_TO_TABLE_ID[slug];
            const sourceTs = tableId ? tsMeta?.get(tableId) : undefined;
            const error    = dlErrors[slug];
            return (
              <div key={slug} className="export-table-card">
                <div className="export-table-grid">
                  <button
                    type="button"
                    className="export-table-cell export-table-download"
                    disabled={downloading[slug]}
                    onClick={() => handleDownload(slug)}
                    title={`Download ${label} CSV`}
                  >
                    <svg className="export-table-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12" />
                      <path d="M7 10l5 5 5-5" />
                      <path d="M5 20h14" />
                    </svg>
                    <span className="export-table-name">{label}</span>
                  </button>
                  <div className="export-table-cell">
                    <span className="export-table-cell-label">Last Updated</span>
                    <span className="export-table-cell-value">
                      {sourceTs ? new Date(sourceTs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    </span>
                  </div>
                  <div className="export-table-cell">
                    <span className="export-table-cell-label">Last Hashed</span>
                    <span className="export-table-cell-value">{exportedAt ? timeAgo(exportedAt) : '—'}</span>
                  </div>
                  <div className="export-table-cell">
                    <span className="export-table-cell-label">Fingerprint</span>
                    <span className="export-table-cell-value">
                      {hash ? <code>{hash}</code> : 'Not yet generated'}
                    </span>
                  </div>
                </div>
                <div className="export-table-description">
                  {TABLE_DESCRIPTIONS[slug] || 'No description added yet.'}
                </div>
                {(downloading[slug] || error) && (
                  <div className={`export-table-status${error ? ' search-error' : ''}`}>
                    {error || 'Downloading…'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
