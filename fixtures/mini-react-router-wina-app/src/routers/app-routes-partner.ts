import { OrdRcvDetailPage } from '@/pages/partner/ordProdPlanMgmt/ord-rcv-detail-page'
import { ProdOrdSpecPage } from '@/pages/partner/ordProdPlanMgmt/prod-ord-spec-page'
import { DecoSheetPage } from '@/pages/partner/matMgmt/deco-sheet-page'
import { CuttingPlanPage } from '@/pages/partner/materialMgmt/cutting-plan-page'
import type { AppRoute } from './app-routes'

const ORD_PROD_PLAN = 'partner/ordProdPlanMgmt'
const MAT_MGMT = 'partner/matMgmt'

export const partnerRoutes: AppRoute[] = [
  { path: `${ORD_PROD_PLAN}/ordRcvMgmt/ordRcvSearch/detail/:ordNo`, component: OrdRcvDetailPage },
  { path: `${ORD_PROD_PLAN}/prodOrdSpec`, component: ProdOrdSpecPage },
  { path: `${MAT_MGMT}/decoSheet`, component: DecoSheetPage },
  // 동일 파일 내 정적 리터럴 path 혼재
  { path: 'partner/materialMgmt/cuttingPlan', component: CuttingPlanPage },
]
