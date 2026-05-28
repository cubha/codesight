import { Route } from 'react-router-dom'
import { MobileLoginPage } from '@/pages/mobile/login-page'

// 단일 비인증 라우트 (인증 wrapper 밖에서 사용)
export const MobileLoginRoute = (
  <Route path="/mobile/login" element={<MobileLoginPage />} />
)
