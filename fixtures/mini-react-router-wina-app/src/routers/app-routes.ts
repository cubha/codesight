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
import {
  SsoLoginPage, SsoResultPage, SampleListPage, SampleDetailPage, PublishPage,
  ProfilePage, ReferenceInfoPage, PriceListPage, PriceDetailPage, TemplatePage,
} from '@/pages/misc-pages'

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

  // ─── 나머지 top-level 도메인 (WINA 16 도메인 충실 재현) ───
  { path: 'sso-login', component: SsoLoginPage },
  { path: 'sso-result', component: SsoResultPage },
  { path: 'sample/list', component: SampleListPage },
  { path: 'sample/detail/:sampleId', component: SampleDetailPage },
  { path: 'publish/doc', component: PublishPage },
  { path: 'profile/setting', component: ProfilePage },
  { path: 'reference-info/code-guide', component: ReferenceInfoPage },
  { path: 'price/list', component: PriceListPage },
  { path: 'price/detail/:priceCd', component: PriceDetailPage },
  { path: 'template/form', component: TemplatePage },

  // ─── Agency ───
  ...agencyRoutes,

  // ─── Partner ───
  ...partnerRoutes,
]
