import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseReactRouterFull } from './route-parser.js'

// 실제 사용자 repo tsconfig shape: baseUrl:"src" + "@/*":["*"].
// loadTsConfigPaths가 baseUrl 미반영 + "*" 타겟 리터럴 처리로 alias 해석 실패 →
// appRoutes 통과 라우트(main/partner/agency) 전부 증발, 하드코딩만 생존하던 회귀 가드.
const FIXTURE = path.resolve(process.cwd(), 'fixtures/mini-react-router-baseurl-app')

describe('parseReactRouterFull — baseUrl + "*" alias shape (RR-baseurl)', () => {
  it('main appRoutes(home/system) 라우트 출현', async () => {
    const { routeNodes } = await parseReactRouterFull(FIXTURE, 'test@0.1')
    const paths = routeNodes.map(r => r.path)
    expect(paths).toContain('/home')
    expect(paths).toContain('/system/code')
  })

  it('배열 리터럴 spread(...partnerRoutes) 라우트 출현', async () => {
    const { routeNodes } = await parseReactRouterFull(FIXTURE, 'test@0.1')
    expect(routeNodes.map(r => r.path)).toContain('/partner/ordProdPlanMgmt/prodOrdSpec')
  })

  it('Object.entries().map() spread(...agencyRoutes) 라우트 출현', async () => {
    const { routeNodes } = await parseReactRouterFull(FIXTURE, 'test@0.1')
    expect(routeNodes.map(r => r.path)).toContain('/agency/masterMgmt/customerMgmt')
  })
})

// Vite 스플릿: 루트 tsconfig.json은 paths가 없고 references로 tsconfig.app.json에 분리.
// loadTsConfigPaths가 references를 따라가지 못하면 동일 누락 재발.
const TSREF_FIXTURE = path.resolve(process.cwd(), 'fixtures/mini-react-router-tsref-app')

describe('parseReactRouterFull — references-split tsconfig (Vite app.json)', () => {
  it('references로 분리된 paths로도 main/partner/agency 라우트 출현', async () => {
    const { routeNodes } = await parseReactRouterFull(TSREF_FIXTURE, 'test@0.1')
    const paths = routeNodes.map(r => r.path)
    expect(paths).toContain('/home')
    expect(paths).toContain('/partner/ordProdPlanMgmt/prodOrdSpec')
    expect(paths).toContain('/agency/masterMgmt/customerMgmt')
  })
})
