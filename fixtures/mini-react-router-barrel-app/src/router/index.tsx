import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage, AboutPage } from '@/pages'

// barrel re-export 1-hop 회귀 가드.
// HomePage: pages/index.ts에서 `export { default as HomePage } from './HomePage'`
// AboutPage: pages/index.ts에서 `export { AboutPage } from './AboutPage'`
// component-resolver의 barrel 분기가 정상 동작하여 rendersEdge가 각 페이지 파일로 연결되어야 함.
export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
  )
}
