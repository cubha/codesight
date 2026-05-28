// 사용자 케이스 1:1 reproducer:
// - @/ path alias (tsconfig paths)
// - named import + as rename (MenuPage as MenuManagePage)
// - lowercase `component` 키
import { HomePage } from '@/pages/home-page'
import { CodePage } from '@/pages/system/code/code-page'
import { MenuPage as MenuManagePage } from '@/pages/system/menu/menu-manage-page'
import { ApiPage } from '@/pages/system/api/api-page'

export const appRoutes = [
  { path: 'home', component: HomePage },
  { path: 'system/code', component: CodePage },
  { path: 'system/menu', component: MenuManagePage },
  { path: 'system/api', component: ApiPage },
]
