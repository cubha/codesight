import { BrowserRouter, Routes, Route } from 'react-router-dom'

// BinaryExpression 패턴: path={'/' + route.path}
const appRoutes = [
  { path: 'dashboard', element: 'DashboardPage' },
  { path: 'settings', element: 'SettingsPage' },
]
const appRouteElements = appRoutes.map((route) => (
  <Route key={route.path} path={'/' + route.path} element={null} />
))

// TemplateLiteral 패턴: path={`/api/${r.path}`}
const apiRoutes = [
  { path: 'users' },
  { path: 'orders' },
]
const apiRouteElements = apiRoutes.map((r) => (
  <Route path={`/api/${r.path}`} element={null} />
))

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {appRouteElements}
        {apiRouteElements}
      </Routes>
    </BrowserRouter>
  )
}

function LoginPage() { return null }
