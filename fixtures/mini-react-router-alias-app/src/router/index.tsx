import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { appRouteElements } from './appRouteElements'
import { MobileLoginRoute } from './mobile-routes'

function ProtectedSessionRoute() {
  return null
}
function MainLayoutWithNoticePopups() {
  return null
}
function NotFound() {
  return <div>404</div>
}

// 사용자 케이스: <Routes> 내부 nested Route 2겹 안에 {appRouteElements} JsxExpression으로 펼침.
// + 비인증 단일 라우트(MobileLoginRoute)도 별도 JsxExpression으로 함께 배치.
export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {MobileLoginRoute}
        <Route element={<ProtectedSessionRoute />}>
          <Route element={<MainLayoutWithNoticePopups />}>
            {appRouteElements}
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
