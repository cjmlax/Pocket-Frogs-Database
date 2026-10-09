import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import Frog from './pages/Frog';
import WeeklyList from './pages/WeeklyList';
import Breed from './pages/Breed';
import BreedingPairs from './pages/BreedingPairs';
import MutationPlanner from './pages/MutationPlanner';
import PairTree from './pages/PairTree';
import NoMuWheels from './pages/NoMuWheels';
import SubmitCombo from './pages/SubmitCombo';
import SubmitFrogStats from './pages/SubmitFrogStats';
import SubmitMutationCompletion from './pages/SubmitMutationCompletion';
import Download from './pages/Download';
import Account from './pages/Account';
import AuthCallback from './pages/AuthCallback';
import AdminHome from './pages/AdminHome';
import AdminBadges from './pages/AdminBadges';
import AdminAlerts from './pages/AdminAlerts';
import AdminSubmissions from './pages/AdminSubmissions';

// Sends a retired path to its new name, keeping any query string and hash so
// old bookmarks and shared links still land on the same view.
function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'search', element: <Search /> },
      { path: 'frog', element: <Frog /> },
      { path: 'frog/:frogId', element: <Frog /> },
      { path: 'weekly', element: <WeeklyList /> },
      { path: 'breed', element: <Breed /> },
      { path: 'breeding', element: <BreedingPairs /> },
      { path: 'planner', element: <MutationPlanner /> },
      { path: 'tree', element: <PairTree /> },
      { path: 'nomu', element: <NoMuWheels /> },
      { path: 'submit', element: <SubmitCombo /> },
      { path: 'submit/stats', element: <SubmitFrogStats /> },
      { path: 'submit/details', element: <SubmitMutationCompletion /> },
      { path: 'download', element: <Download /> },
      { path: 'frogs', element: <Moved to="/search" /> },
      { path: 'breeds', element: <Moved to="/breed" /> },
      { path: 'downloads', element: <Moved to="/download" /> },
      { path: 'account', element: <Account /> },
      { path: 'admin', element: <AdminHome /> },
      { path: 'admin/badges', element: <AdminBadges /> },
      { path: 'admin/alerts', element: <AdminAlerts /> },
      { path: 'admin/submissions', element: <AdminSubmissions /> },
      { path: 'auth/callback', element: <AuthCallback /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
