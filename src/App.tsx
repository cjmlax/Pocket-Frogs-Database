import { createBrowserRouter, RouterProvider } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import FrogList from './pages/FrogList';
import FrogDetail from './pages/FrogDetail';
import WeeklyList from './pages/WeeklyList';
import BreedOverview from './pages/BreedOverview';
import BreedingPairs from './pages/BreedingPairs';
import SubmitCombo from './pages/SubmitCombo';
import Downloads from './pages/Downloads';
import Account from './pages/Account';
import AuthCallback from './pages/AuthCallback';
import AdminHome from './pages/AdminHome';
import AdminBadges from './pages/AdminBadges';
import AdminAlerts from './pages/AdminAlerts';
import AdminSubmissions from './pages/AdminSubmissions';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'frogs', element: <FrogList /> },
      { path: 'frog', element: <FrogDetail /> },
      { path: 'frog/:id', element: <FrogDetail /> },
      { path: 'weekly', element: <WeeklyList /> },
      { path: 'breeds', element: <BreedOverview /> },
      { path: 'breeding', element: <BreedingPairs /> },
      { path: 'submit', element: <SubmitCombo /> },
      { path: 'downloads', element: <Downloads /> },
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
