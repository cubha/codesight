import React from 'react'
import { Route } from 'react-router-dom'
import { appRoutes } from './appRoutes'

// 사용자 케이스: appRoutes 배열에서 라우트 엘리먼트 자동 생성.
// element는 <React.Suspense fallback={null}><route.component /></React.Suspense> wrapper로 감싸짐.
// extractMapElementPropName이 outer tag(React.Suspense)가 아니라 콜백 파라미터(route).propName(component)을 매칭해야 함.
export const appRouteElements = appRoutes.map((route) => (
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
