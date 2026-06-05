import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useDailyFrog } from '../hooks/useDailyFrog';
import { fetchTable, type TeableRecord } from '../api/teable';
import { formatNum } from '../utils/format';

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

// ── Update feed card ──────────────────────────────────────────────────────────

interface ChangelogEntry {
  version: string;
  date: string;
  platform: 'ios' | 'android' | 'both';
  notes: string;
}

interface ItunesApiResult {
  version: string;
  releaseNotes?: string;
  currentVersionReleaseDate: string;
}

const ITUNES_ID = '386644958';

async function fetchLiveEntry(): Promise<ChangelogEntry | null> {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${ITUNES_ID}`);
  const data = await res.json();
  const r: ItunesApiResult | undefined = data.results?.[0];
  if (!r) return null;
  return {
    version: r.version,
    date: r.currentVersionReleaseDate,
    platform: 'ios',
    notes: r.releaseNotes ?? '',
  };
}

async function fetchManualEntries(): Promise<ChangelogEntry[]> {
  const res = await fetch('/changelog.json');
  return res.json();
}

function formatUpdateDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function UpdateFeedCard() {
  const { data: liveEntry } = useQuery({
    queryKey: ['itunes-changelog'],
    queryFn: fetchLiveEntry,
    staleTime: 60 * 60 * 1000,
  });

  const { data: manualEntries = [] } = useQuery({
    queryKey: ['manual-changelog'],
    queryFn: fetchManualEntries,
    staleTime: 60 * 60 * 1000,
  });

  const entries = useMemo(() => {
    const all: ChangelogEntry[] = [];
    if (liveEntry) all.push(liveEntry);
    for (const e of manualEntries) {
      if (!liveEntry || e.version !== liveEntry.version) all.push(e);
    }
    return all;
  }, [liveEntry, manualEntries]);

  return (
    <div className="updates-panel">
      <span className="updates-panel-label">App Updates</span>
      <div className="updates-feed">
        {entries.length === 0 ? (
          <p className="updates-empty">Loading…</p>
        ) : (
          entries.map((entry, i) => (
            <div key={`${entry.version}-${i}`} className="update-entry">
              <div className="update-entry-header">
                <span className="update-version">v{entry.version}</span>
                <span className="update-meta-sep">·</span>
                <span className="update-date">{formatUpdateDate(entry.date)}</span>
              </div>
              {entry.notes && <p className="update-notes">{entry.notes}</p>}
            </div>
          ))
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
  { label: 'Android Download',      url: 'https://play.google.com/store/apps/details?id=com.nimblebit.pocketfrogs' },
  { label: 'iOS Download',          url: 'https://apps.apple.com/us/app/pocket-frogs-tiny-pond-keeper/id386644958' },
  { label: 'Community Discord',     url: 'https://discord.gg/XZ3eeEp', faviconDomain: 'discord.com' },
  { label: 'Community Subreddit',   url: 'https://www.reddit.com/r/Pocketfrogs' },
  { label: 'Community Wiki',        url: 'http://pocketfrogs.fandom.com/wiki/Pocket_Frogs_Wiki' },
  { label: 'NimbleBit Official Site', url: 'https://nimblebit.com/#about' },
  { label: 'Previous Spreadsheet',   url: 'https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/' },
  { label: 'Website GitHub',         url: 'https://github.com/cjmlax/Pocket-Frogs-Database' },
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
        Weekly Set{thisWeek?.fields.SetDate ? ` ${thisWeek.fields.SetDate}` : ''}
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
        <UpdateFeedCard />
        <div className="home-text">
          <p>An unofficial, searchable database of information for the mobile game Pocket Frogs.</p>
          <p>This website is a continuation of my <a href="https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/" target="_blank">Google Spreadsheet</a>, meant to store the data better, provide a simpler and more responsive feel, and separate it from Google so it can expand past just a spreadshet.</p>
          <p>This website is also two challenging/terrible things combined — a work in progress and vibe-coded. Please be patient while I work out the kinks and improve the experience. If you feel the urge to contribute on the code side, I'm throwing this up on <a href="https://github.com/cjmlax/Pocket-Frogs-Database" target="_blank">GitHub</a> as a repository.</p>
          <p>Additionally, I'm happy to take any feedback you have about the site in it's current state. <a href="https://teable.cjmlax.com/share/shre9SHevGPtThTpVGz/view" target="_blank">Click here</a> to fill out a quick form so I can capture anything that can be improved on from your perspectives! Keep in mind that feature requests are welcome, though I'll be working towards feature parity with the Google Sheet before making any other major additions.</p>
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
