import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useDailyFrog } from '../hooks/useDailyFrog';
import { fetchTable, type TeableRecord } from '../api/teable';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface WeeklyFields extends Record<string, unknown> {
  SetName?:  string;
  SetDate?:  string;
  Stamp?:    number;
  LevelReq?: number;
}

// Returns the current ISO 8601 week string, e.g. "2026-W22"
function getCurrentISOWeek(): string {
  const d = new Date();
  const dayOfWeek = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // shift to nearest Thursday
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
            <span className="daily-frog-stat-value">{value ?? '—'}</span>
          </div>
          <div className="daily-frog-stat">
            <span className="daily-frog-stat-label">Speed</span>
            <span className="daily-frog-stat-value">{speed ?? '—'}</span>
          </div>
          <div className="daily-frog-stat">
            <span className="daily-frog-stat-label">Stamina</span>
            <span className="daily-frog-stat-value">{stamina ?? '—'}</span>
          </div>
        </div>
      ) : (
        !isLoading && <p className="daily-frog-loading">No stats found.</p>
      )}
    </div>
  );
}

function WeeklySetCard() {
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
              <span className="daily-frog-stat-value">{thisWeek.fields.Stamp ?? '—'}</span>
            </div>
            <div className="daily-frog-stat">
              <span className="daily-frog-stat-label">Min Lvl</span>
              <span className="daily-frog-stat-value">{thisWeek.fields.LevelReq ?? '—'}</span>
            </div>
          </div>
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
