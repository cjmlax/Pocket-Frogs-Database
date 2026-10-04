import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useDailyFrog } from '../hooks/useDailyFrog';
import { fetchTable, fetchMutations, fetchFrogStats, fetchChangelog, type ChangelogEntry, type TeableRecord } from '../api/teable';
import { formatNum } from '../utils/format';
import { frogPath } from '../utils/frogIds';
import { usePlatform, type Platform } from '../hooks/usePlatform';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WeeklyFields extends Record<string, unknown> {
  SetName?:  string;
  SetDate?:  string;
  Stamp?:    number;
  LevelReq?: number;
  NameA?:    string;
  NameB?:    string;
  NameC?:    string;
  NameD?:    string;
  NameE?:    string;
  NameF?:    string;
  NameG?:    string;
  NameH?:    string;
}

const FROG_SLOTS = ['NameA', 'NameB', 'NameC', 'NameD', 'NameE', 'NameF', 'NameG', 'NameH'] as const;

// New sets release at 2pm Eastern Time on Monday. The "current week" is anchored
// to that cutoff: before 2pm ET on Monday we still report the previous week's
// string. Intl handles EST/EDT automatically.
function getCurrentISOWeek(): string {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const year    = parseInt(get('year'), 10);
  const month   = parseInt(get('month'), 10);
  const day     = parseInt(get('day'), 10);
  const weekday = get('weekday');
  const hour    = parseInt(get('hour') || '12', 10) % 24; // en-US can report '24' at midnight

  // Build a UTC date from the Eastern-Time calendar day so the ISO-week math
  // below is consistent regardless of where this code runs.
  const d = new Date(Date.UTC(year, month - 1, day));

  // Before 2pm ET on Monday, roll back to last week's set.
  if (weekday === 'Monday' && hour < 14) {
    d.setUTCDate(d.getUTCDate() - 7);
  }

  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

// ── Site summary card ──────────────────────────────────────────────────────────

function SiteSummaryCard() {
  // Counts come from the full tables already cached in IndexedDB by other pages,
  // so these add no network requests on a warm cache.
  const { data: breeds } = useQuery({ queryKey: ['table', 'breeds'], queryFn: () => fetchTable('breeds') });
  const { data: weekly } = useQuery({ queryKey: ['table', 'weekly'], queryFn: () => fetchTable('weekly') });
  const { data: mutations } = useQuery({ queryKey: ['mutations'], queryFn: fetchMutations });

  // The frogs table is too large to fetch in full — two aggregation calls instead.
  const { data: frogStats } = useQuery({
    queryKey: ['frog-stats'],
    queryFn: fetchFrogStats,
    staleTime: 60 * 60 * 1000,
  });

  const holders = frogStats?.topFrogs ?? [];

  // Popup listing the frog(s) holding the highest value.
  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!popupOpen) return;
    function onDocClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopupOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [popupOpen]);

  const stats: { label: string; value: number | null | undefined; isMax?: boolean }[] = [
    { label: 'Frogs',         value: frogStats?.count },
    { label: 'Breeds',        value: breeds?.length },
    { label: 'Weekly Sets',   value: weekly?.length },
    { label: 'Highest Value', value: frogStats?.maxValue, isMax: true },
    { label: 'Combos', value: mutations?.length },
  ];

  return (
    <div className="summary-panel">
      <span className="updates-panel-label">Database Summary</span>
      <div className="summary-grid">
        {stats.map(s => (
          <div key={s.label} className="summary-stat">
            {s.isMax ? (
              <div className="summary-stat-popup-wrap" ref={popupRef}>
                <button
                  className="summary-stat-value summary-stat-link"
                  onClick={() => setPopupOpen(o => !o)}
                  disabled={holders.length === 0}
                  aria-expanded={popupOpen}
                >
                  {s.value == null ? '—' : formatNum(s.value)}
                </button>
                {popupOpen && holders.length > 0 && (
                  <div className="summary-popup">
                    {holders.map(h => (
                      <Link
                        key={h.id}
                        to={frogPath(h.frogId)}
                        className="summary-popup-link"
                        onClick={() => setPopupOpen(false)}
                      >
                        {h.fullname}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="summary-stat-value">{s.value == null ? '—' : formatNum(s.value)}</span>
            )}
            <span className="summary-stat-label">
              {s.label}{s.isMax && holders.length > 1 ? ` (${holders.length})` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Update feed card ──────────────────────────────────────────────────────────

function formatUpdateDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
//Below formula is counter for highlighting an app update in the feed. First number is number of days and should be the adjusted value.
function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

// One feed entry per version. The poller records each store separately, so a
// version can have an iOS row, an Android row, or both; legacy "Both" rows
// (from the old iTunes poller) cover either platform.
interface VersionUpdate {
  version: string;
  latest: string; // newest date across platforms — drives the "new" highlight
  entries: Partial<Record<Platform, ChangelogEntry>>;
  split: boolean; // has platform-specific rows, so pills are shown for each one present
}

const PLATFORMS: Platform[] = ['iOS', 'Android'];

// Compares versions numerically segment by segment, so 3.10 sorts above 3.9
// rather than next to 3.1. Missing segments count as 0 (3.2 == 3.2.0).
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

// Ordered by version, newest first — release dates can disagree between
// platforms (e.g. a same-day patch on only one store), so they can't be trusted
// for ordering.
function groupByVersion(entries: ChangelogEntry[]): VersionUpdate[] {
  const versions = new Map<string, VersionUpdate>();
  for (const entry of entries) {
    let v = versions.get(entry.version);
    if (!v) {
      v = { version: entry.version, latest: entry.date, entries: {}, split: false };
      versions.set(entry.version, v);
    }
    if (entry.platform === 'Both') {
      for (const p of PLATFORMS) v.entries[p] ??= entry;
    } else {
      v.entries[entry.platform] = entry; // platform-specific row beats a legacy "Both"
      v.split = true;
    }
    if (entry.date > v.latest) v.latest = entry.date;
  }
  return [...versions.values()].sort((a, b) =>
    compareVersions(b.version, a.version) || b.latest.localeCompare(a.latest));
}

function groupByMinor(updates: VersionUpdate[]): [string, VersionUpdate[]][] {
  const groups = new Map<string, VersionUpdate[]>();
  for (const update of updates) {
    const key = update.version.split('.').slice(0, 2).join('.');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(update);
  }
  return [...groups.entries()];
}

function UpdateEntry({ update, selected, onSelect, className }: {
  update: VersionUpdate;
  selected: Platform;
  onSelect: (p: Platform) => void;
  className: string;
}) {
  // Fall back to whichever platform has this version if the selected one doesn't yet.
  const shown = update.entries[selected] ? selected : PLATFORMS.find(p => update.entries[p])!;
  const entry = update.entries[shown]!;
  return (
    <div className={className}>
      <div className="update-entry-header">
        <span className="update-version">v{update.version}</span>
        {update.split && (
          <span className="update-platform-pills" role="group" aria-label="Platform">
            {PLATFORMS.filter(p => update.entries[p]).map(p => (
              <button
                key={p}
                className={`update-platform-pill${p === shown ? ' active' : ''}`}
                onClick={() => onSelect(p)}
                aria-pressed={p === shown}
              >
                {p}
              </button>
            ))}
          </span>
        )}
        <span className="update-meta-sep">·</span>
        <span className="update-date">{formatUpdateDate(entry.date)}</span>
      </div>
      {entry.notes && <p className="update-notes">{entry.notes}</p>}
    </div>
  );
}

function UpdateFeedCard() {
  const { data: entries = [] } = useQuery({
    queryKey: ['changelog'],
    queryFn: fetchChangelog,
    staleTime: 60 * 60 * 1000,
  });
  const { platform } = usePlatform();

  const groups = useMemo(() => groupByMinor(groupByVersion(entries)), [entries]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Per-version platform picks. They're tied to the default they were made
  // under, so changing the site-wide setting resets every entry to it.
  const [picks, setPicks] = useState<{ base: Platform; byVersion: Record<string, Platform> }>(
    { base: platform, byVersion: {} },
  );
  const byVersion = picks.base === platform ? picks.byVersion : {};
  const selectedFor = (version: string) => byVersion[version] ?? platform;
  const pick = (version: string, p: Platform) =>
    setPicks({ base: platform, byVersion: { ...byVersion, [version]: p } });

  const toggleGroup = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="updates-panel">
      <span className="updates-panel-label">App Updates</span>
      <div className="updates-feed">
        {entries.length === 0 ? (
          <p className="updates-empty">Loading…</p>
        ) : (
          groups.map(([key, updates], gi) => {
            if (gi === 0) {
              return (
                <Fragment key={key}>
                  {updates.map((update, i) => (
                    <UpdateEntry
                      key={update.version}
                      update={update}
                      selected={selectedFor(update.version)}
                      onSelect={p => pick(update.version, p)}
                      className={`update-entry${i === 0 && isRecent(update.latest) ? ' update-entry--new' : ''}`}
                    />
                  ))}
                </Fragment>
              );
            }
            const isOpen = expanded.has(key);
            return (
              <div key={key} className="update-group">
                <button className="update-group-header" onClick={() => toggleGroup(key)} aria-expanded={isOpen}>
                  <span className="update-group-label">v{key}</span>
                  <span className="update-group-count">{updates.length} update{updates.length !== 1 ? 's' : ''}</span>
                  <span className={`weekly-expand-arrow${isOpen ? ' open' : ''}`}>▼</span>
                </button>
                {isOpen && updates.map(update => (
                  <UpdateEntry
                    key={update.version}
                    update={update}
                    selected={selectedFor(update.version)}
                    onSelect={p => pick(update.version, p)}
                    className="update-entry update-entry--grouped"
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Links card ────────────────────────────────────────────────────────────────

interface LinkEntry {
  label: string;
  url: string;
  icon?: string;         // full URL to override the auto-fetched favicon
  faviconDomain?: string; // override domain used for favicon lookup
}

const COMMUNITY_LINKS: LinkEntry[] = [
  { label: 'NimbleBit Official Site', url: 'https://nimblebit.com/#about' },
  { label: 'Android Download',      url: 'https://play.google.com/store/apps/details?id=com.nimblebit.pocketfrogs' },
  { label: 'iOS Download',          url: 'https://apps.apple.com/us/app/pocket-frogs-tiny-pond-keeper/id386644958' },
  { label: 'Community Discord',     url: 'https://discord.gg/XZ3eeEp', faviconDomain: 'discord.com' },
  { label: 'Community Subreddit',   url: 'https://www.reddit.com/r/Pocketfrogs' },
  { label: 'Community Wiki',        url: 'http://pocketfrogs.fandom.com/wiki/Pocket_Frogs_Wiki' },
  { label: 'Old Google Sheet',   url: 'https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/', faviconDomain: 'sheets.google.com' },
  { label: 'This site\'s GitHub',         url: 'https://github.com/cjmlax/Pocket-Frogs-Database' },
  { label: 'Site Feedback Form',     url: 'https://teable.cjmlax.com/share/shre9SHevGPtThTpVGz/view', faviconDomain: 'teable.io' },
];

function faviconSrc(entry: LinkEntry): string {
  if (entry.icon) return entry.icon;
  const domain = entry.faviconDomain ?? new URL(entry.url).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function LinksCard() {
  return (
    <div className="frog-card">
      <span className="daily-frog-panel-label">Links</span>
      <div className="links-list">
        {COMMUNITY_LINKS.map(entry => (
          <a
            key={entry.label}
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="links-row"
          >
            <img className="links-favicon" src={faviconSrc(entry)} alt="" width={16} height={16} />
            <span className="links-label">{entry.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function DailyFrogCard() {
  const { name, level, value, speed, stamina, isLoading } = useDailyFrog();

  return (
    <div className="frog-card">
      <span className="daily-frog-panel-label">PFDB Frog of the Day</span>
      <p className="daily-frog-panel-name">
        {isLoading ? 'Loading…' : (name ?? '—')}
      </p>
      {!isLoading && (
        <div className="daily-frog-stats daily-frog-stats--2col">
          <div className="daily-frog-stat">
            <span className="daily-frog-stat-label">Level</span>
            <span className="daily-frog-stat-value">{formatNum(level)}</span>
          </div>
          <div className="daily-frog-stat">
            <span className="daily-frog-stat-label">Value</span>
            <span className="daily-frog-stat-value">{formatNum(value)}</span>
          </div>
          <div className="daily-frog-stat">
            <span className="daily-frog-stat-label">Speed</span>
            <span className="daily-frog-stat-value">{formatNum(speed)}</span>
          </div>
          <div className="daily-frog-stat">
            <span className="daily-frog-stat-label">Stamina</span>
            <span className="daily-frog-stat-value">{formatNum(stamina)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklySetCard() {
  const [expanded, setExpanded] = useState(false);

  const { data: records, isLoading } = useQuery({
    queryKey: ['table', 'weekly'],
    queryFn: () => fetchTable<WeeklyFields>('weekly'),
  });

  const currentWeek = useMemo(() => getCurrentISOWeek(), []);

  const thisWeek: TeableRecord<WeeklyFields> | null =
    records?.find(r => r.fields.SetDate === currentWeek) ?? null;

  return (
    <div className="frog-card">
      <span className="daily-frog-panel-label">
        Weekly Set:{thisWeek?.fields.SetDate ? ` ${thisWeek.fields.SetDate}` : ''}
      </span>
      {isLoading ? (
        <p className="daily-frog-loading">Loading…</p>
      ) : thisWeek ? (
        <>
          <p className="daily-frog-panel-name">
            <Link
              to={`/weekly?q=${encodeURIComponent(thisWeek.fields.SetName ?? '')}`}
              className="plain-link"
            >
              {thisWeek.fields.SetName ?? '—'}
            </Link>
          </p>
          <div className="daily-frog-stats">

            <div className="daily-frog-stat">
              <span className="daily-frog-stat-label">Reward</span>
              <span className="daily-frog-stat-value">{formatNum(thisWeek.fields.Stamp)}</span>
            </div>
            <div className="daily-frog-stat">
              <span className="daily-frog-stat-label">Min Lvl</span>
              <span className="daily-frog-stat-value">{formatNum(thisWeek.fields.LevelReq)}</span>
            </div>
              <div className="daily-frog-stat">
              <span className="daily-frog-stat-label">Count</span>
              <span className="daily-frog-stat-value">
                {FROG_SLOTS.filter(slot => thisWeek.fields[slot]).length}
              </span>
            </div>
          </div>

          {expanded && (
            <ol className="weekly-frog-list">
              {FROG_SLOTS.map(slot => (
                <li key={slot} className="weekly-frog-item">
                  {thisWeek.fields[slot] || <span>&nbsp;</span>}
                </li>
              ))}
            </ol>
          )}

          <button
            className="weekly-expand-btn"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse frog list' : 'Expand frog list'}
          >
            <span className={`weekly-expand-arrow${expanded ? ' open' : ''}`}>▼</span>
          </button>
        </>
      ) : (
        <p className="daily-frog-loading">No set found for {currentWeek}.</p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="home">
      <div className="home-main">
        <h1>Pocket Frogs Database</h1>
        <SiteSummaryCard />
        <UpdateFeedCard />
        <div className="home-text">
          <p>An unofficial, searchable database of information for the mobile game Pocket Frogs.</p>
          <p>This website is a continuation of my <a href="https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/" target="_blank">Google Spreadsheet</a> meant to store the data better, provide a simpler and more responsive feel, and separate it from Google so it can expand past just a spreadshet.</p>
          <p>This website is also two challenging/terrible things combined — a work in progress and coded with AI assistance. Please be patient while I work out the kinks in an effort to improve the experience. You may see things change or not work for a while, but they should come back eventually. Note that the data is hosted separately and won't be affected, and can be downlaoded at any time from the 'Downloads' tab. It's my first attempt at a project managed by github, so anyone is welcome to take a look and contribute there.</p>
          <p>Additionally, I'm happy to take any feedback you have about the site at the link in the card. Keep in mind that feature requests are welcome, but I'll be working through my own checklist as well.</p>
        </div>
      </div>
      <div className="home-cards">
        <WeeklySetCard />
        <DailyFrogCard />
        <LinksCard />
      </div>
    </div>
  );
}
