import React from 'react'
import { HomePage } from '@/pages/home-page'
import { CodePage } from '@/pages/system/code/code-page'
import { MessagePage } from '@/pages/system/message/message-page'
import { NoticeListPage } from '@/pages/system/notice/notice-list-page'
import { SapProdDetailPage } from '@/pages/model/baseInfo/sap-prod-detail-page'
import { RegionalRankPage } from '@/pages/headOffice/alloc/regional-rank-page'
import { OrderCancelChangeMgmtPage } from '@/pages/headOffice/order/order-cancel-change-mgmt-page'
import { agencyRoutes } from '@/routers/app-routes-agency'
import { partnerRoutes } from '@/routers/app-routes-partner'

export interface AppRoute {
  path: string
  component: React.ComponentType<any>
}

export const appRoutes: AppRoute[] = [
  { path: 'home', component: HomePage },
  { path: 'system/code', component: CodePage },
  { path: 'system/message', component: MessagePage },
  { path: 'system/notice/:noticeTpCd/list', component: NoticeListPage },
  { path: 'model/base-info/fnsh-prod/detail/:sapProdCd/:sn', component: SapProdDetailPage },
  { path: 'headOffice/alloc/regionalRank/regional-rank', component: RegionalRankPage },
  { path: 'headOffice/order/orderChange/order-cancel-change-mgmt', component: OrderCancelChangeMgmtPage },

  // ─── Agency ───
  ...agencyRoutes,

  // ─── Partner ───
  ...partnerRoutes,
]
