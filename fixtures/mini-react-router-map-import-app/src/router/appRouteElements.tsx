import { Route } from 'react-router-dom'
import { appRoutes } from './appRoutes'

// 사용자 케이스: `<route.component />` member access JSX 태그
export const appRouteElements = appRoutes.map((route) => (
  <Route key={route.path} path={'/' + route.path} element={<route.component />} />
))
