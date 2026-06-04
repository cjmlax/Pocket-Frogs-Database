import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useTheme, type ThemeMode } from '../hooks/useTheme';
import { useBreedSort, selectBreedSort } from '../hooks/useBreedSort';
import { useColorSort, selectColorSort } from '../hooks/useColorSort';
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

function IconRainbow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M22 17a10 10 0 0 0-20 0"/>
      <path d="M18 17a6 6 0 0 0-12 0"/>
      <path d="M14 17a2 2 0 0 0-4 0"/>
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


function SettingsDropdown() {
  const { theme, choose } = useTheme();
  const breedSort = useBreedSort();
  const colorSort = useColorSort();
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
          {/* Row 1: Theme — System (left), Light (center), Dark (right) */}
          <button className={`settings-theme-opt${theme === null ? ' active' : ''}`} onClick={() => choose(null)} aria-label="System" title="System">
            <IconMonitor />
          </button>
          <button className={`settings-theme-opt${theme === 'light' ? ' active' : ''}`} onClick={() => choose('light')} aria-label="Light" title="Light">
            <IconSun />
          </button>
          <button className={`settings-theme-opt${theme === 'dark' ? ' active' : ''}`} onClick={() => choose('dark')} aria-label="Dark" title="Dark">
            <IconMoon />
          </button>

          {/* Row 2: Breed sort — label (left), level (center), alpha (right) */}
          <span className="settings-row-label" title="Breed sort order">Breed:</span>
          <button className={`settings-theme-opt${breedSort.key === 'level' ? ' active' : ''}`} onClick={() => selectBreedSort('level')} aria-label="Sort breeds by level" title="Level Sort">
            #{breedSort.key === 'level' && (breedSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button className={`settings-theme-opt${breedSort.key === 'alpha' ? ' active' : ''}`} onClick={() => selectBreedSort('alpha')} aria-label="Sort breeds alphabetically" title="Alphabetical Sort">
            A{breedSort.key === 'alpha' && (breedSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>

          {/* Row 3: Color sort — label (left), rainbow (center), alpha (right) */}
          <span className="settings-row-label" title="Color sort order">Color:</span>
          <button className={`settings-theme-opt${colorSort.key === 'rainbow' ? ' active' : ''}`} onClick={() => selectColorSort('rainbow')} aria-label="Sort colors by rainbow order" title="Rainbow Order">
            <IconRainbow />{colorSort.key === 'rainbow' && (colorSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button className={`settings-theme-opt${colorSort.key === 'alpha' ? ' active' : ''}`} onClick={() => selectColorSort('alpha')} aria-label="Sort colors alphabetically" title="Alphabetical Sort">
            A{colorSort.key === 'alpha' && (colorSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Scrollable nav bar ────────────────────────────────────────────────────────

function NavBar() {
  const navRef = useRef<HTMLElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  function updateArrows() {
    const el = navRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 0);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, []);

  function scrollNav(dir: 'left' | 'right') {
    navRef.current?.scrollBy({ left: dir === 'right' ? 160 : -160, behavior: 'smooth' });
  }

  return (
    <div className="nav-scroll-wrap">
      <button
        className="nav-arrow"
        style={{ visibility: showLeft ? 'visible' : 'hidden' }}
        onClick={() => scrollNav('left')}
        tabIndex={showLeft ? 0 : -1}
        aria-label="Scroll navigation left"
      >‹</button>
      <nav className={`nav-links${showLeft ? ' has-left-overflow' : ''}`} ref={navRef}>
        <NavLink to="/" className="nav-brand" end>Home</NavLink>
        <NavLink to="/frogs">Frog Lookup</NavLink>
        <NavLink to="/frog">Frog Detail</NavLink>
        <NavLink to="/weekly">Weekly Sets</NavLink>
        <NavLink to="/breeds">Breed Overview</NavLink>
        <NavLink to="/breeding">Breeding Pairs</NavLink>
        <NavLink to="/submit">Submit</NavLink>
        <NavLink to="/downloads">Downloads</NavLink>
      </nav>
      <button
        className="nav-arrow"
        style={{ visibility: showRight ? 'visible' : 'hidden' }}
        onClick={() => scrollNav('right')}
        tabIndex={showRight ? 0 : -1}
        aria-label="Scroll navigation right"
      >›</button>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  return (
    <>
      <header className="site-header">
        <NavBar />
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
