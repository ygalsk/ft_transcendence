import { createBrowserRouter } from 'react-router-dom';
import App from '../App';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Leaderboard from '../pages/Leaderboard';
import NotFound from '../pages/NotFound';
import Play from '../pages/Play';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'leaderboard', element: <Leaderboard /> },
      { path: 'game/guest', element: <Play /> },
      { path: 'game/ranked', element: <Play /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);