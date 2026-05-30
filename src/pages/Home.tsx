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

// New sets release at 2pm Eastern Time on Monday, so before that cutoff we
// return the previous week's string. Intl handles EST/EDT automatically.
function getCurrentISOWeek(): string {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour    = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);

  // Before 2pm ET on Monday, show last week's set
  const date = (weekday === 'Monday' && hour < 14)
    ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    : now;

  const d = new Date(date);
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function DailyFrogCard() {
  const { name, value, speed, stamina, isLoading } = useDailyFrog();
  const hasStats = value !== null || speed !== null || stamina !== null;

  return (
    <div className="frog-card">
      <span className="daily-frog-panel-label">PFDB Frog of the Day</span>
      <p className="daily-frog-panel-name">
        {isLoading ? 'Loading…' : (name ?? '—')}
      </p>
      {hasStats ? (
        <div className="daily-frog-stats">
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
      ) : (
        !isLoading && <p className="daily-frog-loading">No stats found.</p>
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
      <span className="daily-frog-panel-label">Weekly Set</span>
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
              <span className="daily-frog-stat-label">Set</span>
              <span className="daily-frog-stat-value">
                {thisWeek.fields.SetDate?.slice(-2) ?? '—'}
              </span>
            </div>
            <div className="daily-frog-stat">
              <span className="daily-frog-stat-label">Reward</span>
              <span className="daily-frog-stat-value">{formatNum(thisWeek.fields.Stamp)}</span>
            </div>
            <div className="daily-frog-stat">
              <span className="daily-frog-stat-label">Min Lvl</span>
              <span className="daily-frog-stat-value">{formatNum(thisWeek.fields.LevelReq)}</span>
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
        <div className="home-text">
          <p>An unofficial, searchable database of information for the mobile game Pocket Frogs.</p>
          <p>This website is a continuation of my <a href="https://docs.google.com/spreadsheets/d/1TNTK09vM8tlj6BC8haobuWCQvV4qNyDsRYsf-4hXdCc/" target="_blank">Google Spreadsheet</a>, meant to present the data better and allow for a smoother experience (that's also less reliant on Google).</p>
          <p>This website is also two terrible things combined — a work in progress and vibe-coded. Please be patient while I work out the kinks and improve the experience. If you feel the urge to help out, I'm throwing this up on <a href="https://github.com/cjmlax/Pocket-Frogs-Database" target="_blank">GitHub</a>.</p>
        </div>
      </div>
      <div className="home-cards">
        <WeeklySetCard />
        <DailyFrogCard />
      </div>
    </div>
  );
}
