import { createBrowserRouter, RouterProvider } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import FrogList from './pages/FrogList';
import FrogDetail from './pages/FrogDetail';
import WeeklyList from './pages/WeeklyList';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'frogs', element: <FrogList /> },
      { path: 'frogs/:id', element: <FrogDetail /> },
      { path: 'weekly', element: <WeeklyList /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
