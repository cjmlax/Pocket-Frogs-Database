import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from 'react-oidc-context';
import { useTheme } from '../hooks/useTheme';
import { useBreedSort, selectBreedSort } from '../hooks/useBreedSort';
import { useColorSort, selectColorSort } from '../hooks/useColorSort';
import { useSpoilers } from '../hooks/useSpoilers';
import { usePlatform } from '../hooks/usePlatform';
import { useFrogEntry } from '../hooks/useFrogEntry';
import { useDisplayName } from '../hooks/useDisplayName';
import AlertBanner from './AlertBanner';
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

// Loose, hand-drawn nods to the platform marks — not the official logos.
function IconApple() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 7.5C10.28 6.3 7.4 6.3 5.79 7.8C3.72 9.7 3.95 13.3 5.68 16.2C6.94 18.4 8.55 20 10.05 20C10.85 20 11.2 19.6 12 19.6C12.8 19.6 13.15 20 13.95 20C15.68 20 17.52 17.8 18.67 15.4C16.95 14.8 15.91 13.5 15.91 12C15.91 10.6 16.83 9.4 18.21 8.8C16.95 7.2 14.07 6.3 12 7.5Z"/>
      <path d="M12 7.5c0-2 1.2-3.7 3.2-4 0 2-1.2 3.7-3.2 4Z"/>
    </svg>
  );
}

function IconAndroid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 17a8.5 8.5 0 0 1 17 0Z"/>
      <path d="M7.1 10 5.3 6.6M16.9 10l1.8-3.4"/>
      <circle cx="8.9" cy="13.6" r="1.15" fill="currentColor" stroke="none"/>
      <circle cx="15.1" cy="13.6" r="1.15" fill="currentColor" stroke="none"/>
    </svg>
  );
}

// Frog entry: three stacked dropdowns, or a single text box with a cursor.
function IconDropdowns() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="2.5" width="18" height="5" rx="1"/>
      <rect x="3" y="9.5" width="18" height="5" rx="1"/>
      <rect x="3" y="16.5" width="18" height="5" rx="1"/>
      <path d="M15.5 4.2h3l-1.5 1.6Z M15.5 11.2h3l-1.5 1.6Z M15.5 18.2h3l-1.5 1.6Z" fill="currentColor" strokeWidth="1"/>
    </svg>
  );
}

function IconTextBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="10" rx="2"/>
      <line x1="6" y1="10" x2="6" y2="14"/>
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/>
    </svg>
  );
}

function IconLogOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

// ── Nav dropdown menus ────────────────────────────────────────────────────────

interface MenuLink {
  to:    string;
  label: string;
  end?:  boolean; // match only this exact path, not its sub-paths
}

const VIEW_LINKS: MenuLink[] = [
  { to: '/search', label: 'Search' },
  { to: '/frog',   label: 'Frog' },
  { to: '/breed',  label: 'Breed' },
  { to: '/weekly', label: 'Weekly Sets' },
];

const CALCULATE_LINKS: MenuLink[] = [
  { to: '/breeding', label: 'Breeding Pairs' },
  { to: '/planner',  label: 'Mutation Planner' },
];

const SUBMIT_LINKS: MenuLink[] = [
  { to: '/submit',       label: 'Mutations', end: true },
  { to: '/submit/stats', label: 'Frog Stats' },
];

// Segment-aware, so /frog matches /frog/18:11:0 but not /frogs.
function underPath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavDropdown({ label, links }: { label: string; links: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = links.some(l => underPath(location.pathname, l.to));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        btnRef.current   && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  function handleOpen() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  }

  return (
    <>
      <button
        ref={btnRef}
        className={`nav-menu-btn${isActive ? ' active' : ''}`}
        onClick={handleOpen}
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="nav-menu-panel"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          {links.map(l => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-menu-link" onClick={() => setOpen(false)}>
              {l.label}
            </NavLink>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Settings dropdown ─────────────────────────────────────────────────────────

// pfdb_groups arrives with the "pfdb-" prefix stripped, so "pfdb-admins" → "admins".
const ADMIN_GROUP = 'admins';

function SettingsDropdown() {
  const { theme, choose } = useTheme();
  const breedSort = useBreedSort();
  const colorSort = useColorSort();
  const { spoilers, set: setSpoilers } = useSpoilers();
  const { platform, set: setPlatform } = usePlatform();
  const { entry, set: setEntry } = useFrogEntry();
  const auth = useAuth();
  const { displayName, current } = useDisplayName();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const groups = (auth.user?.profile?.pfdb_groups as string[] | undefined) ?? [];
  const isAdmin = groups.includes(ADMIN_GROUP);

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
          <button className={`settings-theme-opt${theme === null ? ' active' : ''}`} onClick={() => choose(null)} aria-label="System Theme" title="System">
            <IconMonitor />
          </button>
          <button className={`settings-theme-opt${theme === 'light' ? ' active' : ''}`} onClick={() => choose('light')} aria-label="Light Theme" title="Light">
            <IconSun />
          </button>
          <button className={`settings-theme-opt${theme === 'dark' ? ' active' : ''}`} onClick={() => choose('dark')} aria-label="Dark Theme" title="Dark">
            <IconMoon />
          </button>

          {/* Row 2: Breed sort — label (left), dex (center), alpha (right) */}
          <span className="settings-row-label" title="Sort order of Breed selectors">Breed:</span>
          <button className={`settings-theme-opt${breedSort.key === 'dex' ? ' active' : ''}`} onClick={() => selectBreedSort('dex')} aria-label="Sort breeds by froggydex order" title="Froggydex Order">
            #{breedSort.key === 'dex' && (breedSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button className={`settings-theme-opt${breedSort.key === 'alpha' ? ' active' : ''}`} onClick={() => selectBreedSort('alpha')} aria-label="Sort breeds alphabetically" title="Alphabetical Order">
            A{breedSort.key === 'alpha' && (breedSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>

          {/* Row 3: Color sort — label (left), rainbow (center), alpha (right) */}
          <span className="settings-row-label" title="Sort order of Base and Secondary color selectors">Color:</span>
          <button className={`settings-theme-opt${colorSort.key === 'rainbow' ? ' active' : ''}`} onClick={() => selectColorSort('rainbow')} aria-label="Sort colors by froggydex order" title="Froggydex Order">
            <IconRainbow />{colorSort.key === 'rainbow' && (colorSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>
          <button className={`settings-theme-opt${colorSort.key === 'alpha' ? ' active' : ''}`} onClick={() => selectColorSort('alpha')} aria-label="Sort colors alphabetically" title="Alphabetical Order">
            A{colorSort.key === 'alpha' && (colorSort.dir === 'asc' ? ' ↑' : ' ↓')}
          </button>

          {/* Row 4: Spoilers — label (left), On (center), Off (right) */}
          <span className="settings-row-label" title="Toggle display of known Glass\Chroma mutations">Spoilers:</span>
          <button className={`settings-theme-opt${spoilers ? ' active' : ''}`} onClick={() => setSpoilers(true)} aria-label="Spoilers on" title="Reveal Glass/Chroma combinations">
            On
          </button>
          <button className={`settings-theme-opt${!spoilers ? ' active' : ''}`} onClick={() => setSpoilers(false)} aria-label="Spoilers off" title="Hide Glass/Chroma combinations">
            Off
          </button>

          {/* Row 5: Platform — label (left), iOS (center), Android (right) */}
          <span className="settings-row-label" title="Platform shown by default for app updates">Platform:</span>
          <button className={`settings-theme-opt${platform === 'iOS' ? ' active' : ''}`} onClick={() => setPlatform('iOS')} aria-label="Default platform iOS" title="Show iOS updates by default">
            <IconApple />
          </button>
          <button className={`settings-theme-opt${platform === 'Android' ? ' active' : ''}`} onClick={() => setPlatform('Android')} aria-label="Default platform Android" title="Show Android updates by default">
            <IconAndroid />
          </button>

          {/* Row 6: Frog entry — label (left), dropdowns (center), text box (right) */}
          <span className="settings-row-label" title="How frogs are entered on Breeding Pairs, Mutation Planner, Frog and Mutation Submissions">Input:</span>
          <button className={`settings-theme-opt${entry === 'combo' ? ' active' : ''}`} onClick={() => setEntry('combo')} aria-label="Enter frogs with dropdowns" title="Base / Secondary / Breed dropdowns">
            <IconDropdowns />
          </button>
          <button className={`settings-theme-opt${entry === 'text' ? ' active' : ''}`} onClick={() => setEntry('text')} aria-label="Enter frogs by exact ID or name" title="Text box: exact Frog_ID or full name (advanced)">
            <IconTextBox />
          </button>

          {/* Account — username (→ account page) when signed in, else "Log In" */}
          <div className="settings-account-row">
            {auth.isAuthenticated ? (
              <button
                className="settings-account-link"
                onClick={() => { setOpen(false); navigate('/account'); }}
              >
                {current?.icon
                  ? <img src={current.icon} width={14} height={14} style={{ borderRadius: 2, flexShrink: 0 }} alt="" />
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                }
                <span className="settings-account-name">{displayName}</span>
              </button>
            ) : (
              <button
                className="settings-account-link"
                onClick={() => { setOpen(false); void auth.signinRedirect(); }}
              >
                Log In\Sign Up
              </button>
            )}
            {auth.isAuthenticated && isAdmin && (
              <button
                className="settings-account-link"
                onClick={() => { setOpen(false); navigate('/admin'); }}
              >
                <IconShield />
                <span className="settings-account-name">Admin Tools</span>
              </button>
            )}
            {auth.isAuthenticated && (
              <button
                className="settings-account-link"
                onClick={() => { setOpen(false); void auth.signoutRedirect(); }}
              >
                <IconLogOut />
                <span className="settings-account-name">Sign Out</span>
              </button>
            )}
          </div>
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
        <NavDropdown label="View" links={VIEW_LINKS} />
        <NavDropdown label="Calculate" links={CALCULATE_LINKS} />
        <NavDropdown label="Submit" links={SUBMIT_LINKS} />
        <NavLink to="/download">Download</NavLink>
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
      <AlertBanner />
      <main>
        <Outlet />
      </main>
    </>
  );
}
