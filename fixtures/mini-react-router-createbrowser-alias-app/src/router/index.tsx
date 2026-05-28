import { createBrowserRouter } from 'react-router-dom'
import { appRoutes } from './appRoutes'

// createBrowserRouter([외부 import된 라우트 배열 식별자]) 패턴.
// ST6 검증: 외부 import 1-hop으로 appRoutes 배열을 추적하고,
// 그 배열의 Component 식별자(HomePage/CodePage/MenuManagePage/ApiPage)를
// appRoutes.ts의 import 기준으로 alias(@/) + as rename 해결해야 함.
export const router = createBrowserRouter(appRoutes)
