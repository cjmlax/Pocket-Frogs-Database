import { createBrowserRouter, RouterProvider } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import FrogList from './pages/FrogList';
import FrogDetail from './pages/FrogDetail';
import WeeklyList from './pages/WeeklyList';
import BreedOverview from './pages/BreedOverview';
import BreedingPairs from './pages/BreedingPairs';
import SubmitCombo from './pages/SubmitCombo';

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
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
