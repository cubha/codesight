import React from 'react'
import { Route, Routes } from 'react-router-dom'
import { appRoutes } from '@/routers/app-routes'
import { MobileLoginRoute, MobileRoutes } from './mobile-routes'
import {
  RootRedirect,
  PlainMainLayout,
  MainLayoutWithNoticePopups,
  ProtectedSessionRoute,
  NotFoundPage,
} from '@/pages/layouts'
import { LoginPage } from '@/pages/login-page'

// 실제 repo 케이스: 모듈 top-level const로 appRoutes.map() 결과를 보관 후 {appRouteElements}로 펼침.
const appRouteElements = appRoutes.map((route) => (
  <Route
    key={route.path}
    path={'/' + route.path}
    element={
      <React.Suspense fallback={null}>
        <route.component />
      </React.Suspense>
    }
  />
))

export default function Router() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<PlainMainLayout />}>
        <Route index element={<LoginPage />} />
      </Route>
      {MobileLoginRoute}

      <Route element={<ProtectedSessionRoute />}>
        <Route element={<MainLayoutWithNoticePopups />}>
          {appRouteElements}
        </Route>
        {MobileRoutes}
      </Route>

      <Route path="/not-found" element={<NotFoundPage />} />
      <Route path="/*" element={<NotFoundPage />} />
    </Routes>
  )
}
