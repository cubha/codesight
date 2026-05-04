import { createBrowserRouter } from 'react-router-dom'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import UserListPage from './pages/UserListPage'
import UserDetailPage from './pages/UserDetailPage'

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/about', element: <AboutPage /> },
  {
    path: '/users',
    element: <UserListPage />,
    children: [
      { path: ':id', element: <UserDetailPage /> },
    ],
  },
])
