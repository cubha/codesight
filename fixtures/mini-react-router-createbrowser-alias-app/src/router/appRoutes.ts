import { HomePage } from '@/pages/home-page'
import { CodePage } from '@/pages/system/code/code-page'
import { MenuPage as MenuManagePage } from '@/pages/system/menu/menu-manage-page'
import { ApiPage } from '@/pages/system/api/api-page'

// createBrowserRouter 분기용 외부 라우트 배열. router/index.tsx가 import해서 spread.
// path alias(@/) + named import rename(as) + 4 페이지 패턴.
export const appRoutes = [
  { path: '/home', Component: HomePage },
  { path: '/system/code', Component: CodePage },
  { path: '/system/menu', Component: MenuManagePage },
  { path: '/system/api', Component: ApiPage },
]
