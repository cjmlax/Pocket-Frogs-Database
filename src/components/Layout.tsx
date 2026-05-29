import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useTheme } from '../hooks/useTheme';
import { useDailyFrog } from '../hooks/useDailyFrog';
import '../App.css';

function DailyFrogDropdown() {
  const { name, value, speed, stamina, isLoading } = useDailyFrog();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const hasStats = value !== null || speed !== null || stamina !== null;

  return (
    <div className="daily-frog-btn" ref={containerRef}>
      <button
        className="daily-frog-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        Frog of the Day {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="daily-frog-panel">
          <span className="daily-frog-panel-label">PFDB Frog of the Day</span>
          <p className="daily-frog-panel-name">
            {name ?? 'Loading…'}
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
            <p className="daily-frog-loading">
              {isLoading ? 'Loading stats…' : 'No stats found for this combination.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { toggle, label } = useTheme();

  return (
    <>
      <header className="site-header">
        <nav className="nav-links">
          <NavLink to="/" className="nav-brand" end>Home</NavLink>
          <NavLink to="/frogs">Frog Search</NavLink>
          <NavLink to="/weekly">Weekly Sets</NavLink>
          <NavLink to="/breeds">Breed Overview</NavLink>
        </nav>
        <div className="header-right">
          <DailyFrogDropdown />
          <button className="theme-btn" onClick={toggle}>{label}</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
