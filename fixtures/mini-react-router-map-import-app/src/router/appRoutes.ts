import Home from '../pages/Home'
import Code from '../pages/Code'
import Message from '../pages/Message'
import Profile from '../pages/Profile'
import Settings from '../pages/Settings'

// 사용자 케이스: lowercase `component` 키 (RR 공식 키 element/Component/lazy 아님)
export const appRoutes = [
  { path: 'home', component: Home },
  { path: 'code', component: Code },
  { path: 'message', component: Message },
  { path: 'profile', component: Profile },
  { path: 'settings', component: Settings },
]
