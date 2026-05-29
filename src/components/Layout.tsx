import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import '../App.css';

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IconGear() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function IconMonitor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

// ── Settings dropdown ─────────────────────────────────────────────────────────

const THEME_OPTIONS: { mode: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { mode: null,    icon: <IconMonitor />, label: 'System' },
  { mode: 'light', icon: <IconSun />,     label: 'Light'  },
  { mode: 'dark',  icon: <IconMoon />,    label: 'Dark'   },
];

function SettingsDropdown() {
  const { theme, choose } = useTheme();
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

  return (
    <div className="settings-wrap" ref={containerRef}>
      <button
        className="settings-btn"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Settings"
      >
        <IconGear />
      </button>

      {open && (
        <div className="settings-panel">
          <div className="settings-row">
            {THEME_OPTIONS.map(({ mode, icon, label }) => (
              <button
                key={label}
                className={`settings-theme-opt${theme === mode ? ' active' : ''}`}
                onClick={() => choose(mode)}
                aria-label={label}
                title={label}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  return (
    <>
      <header className="site-header">
        <nav className="nav-links">
          <NavLink to="/" className="nav-brand" end>Home</NavLink>
          <NavLink to="/frogs">Frog Lookup</NavLink>
          <NavLink to="/weekly">Weekly Sets</NavLink>
          <NavLink to="/breeds">Breed Overview</NavLink>
        </nav>
        <div className="header-right">
          <SettingsDropdown />
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
