import type { ComponentType } from 'react'
import type { AppRoute } from './app-routes'

const BASE = 'agency/agencyFactory'
const PAGE_ROOT = '../pages/agency/agencyFactory'

interface RouteComponentModule {
  [exportName: string]: ComponentType<any>
}

interface AgencyRouteDef {
  file: string
  exportName: string
}

// 실제 repo 패턴: import.meta.glob eager로 페이지 모듈을 일괄 인입 (정적 import 트리거 없음).
const agencyPageModules = import.meta.glob<RouteComponentModule>(
  '../pages/agency/agencyFactory/**/*.tsx',
  { eager: true },
)

const resolveRouteComponent = ({ file, exportName }: AgencyRouteDef): ComponentType<any> => {
  const routeModule = agencyPageModules[`${PAGE_ROOT}/${file}.tsx`]
  const comp = routeModule?.[exportName] ?? routeModule?.['default']
  if (comp === undefined) throw new Error(`agency route component not found: ${file}#${exportName}`)
  return comp
}

const agencyRouteDefs: Record<string, AgencyRouteDef> = {
  [`${BASE}/masterMgmt/customerMgmt`]: { file: 'masterMgmt/customer-mgmt-page', exportName: 'CustomerMgmtPage' },
  [`${BASE}/masterMgmt/jobsMgmt`]: { file: 'masterMgmt/jobs-list-page', exportName: 'JobsListPage' },
  [`${BASE}/quotationWork/quotationContract`]: { file: 'quotationWork/quotation-contract-main-page', exportName: 'QuotationContractMainPage' },
}

export const agencyRoutes: AppRoute[] = Object.entries(agencyRouteDefs).map(([path, def]) => ({
  path,
  component: resolveRouteComponent(def),
}))
