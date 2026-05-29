import { NavLink, Outlet } from 'react-router';
import { useTheme } from '../hooks/useTheme';
import '../App.css';

export default function Layout() {
  const { toggle, label } = useTheme();

  return (
    <>
      <header className="site-header">
        <nav className="nav-links">
          <NavLink to="/" className="nav-brand" end>PFDB</NavLink>
          <NavLink to="/frogs">Frogs</NavLink>
          <NavLink to="/weekly">Weekly</NavLink>
        </nav>
        <button className="theme-btn" onClick={toggle}>{label}</button>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
