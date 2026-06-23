// 대형 모노레포 회귀 테스트 (v1.1.6 — 사용자 REPO-SHARED-B2B-WINA-APP-BE 937 routes 회귀 fixture).
// mini-next-app fixture는 chunked 경로(branchingGroups.length > 5)를 한 번도 안 타서
// nested 그룹핑이 폐기되는 결함(buildRouteRowDiagram의 collectNestedRoutes)을 잡지 못했다.
// 본 파일의 케이스는 NestJS 패턴 (/api/v1/{module}/{resource}/{action}) 200+ routes 합성.

import { describe, it, expect } from 'vitest'
import {
  createIRGraph,
  createRouteNode,
  makeNodeId,
  type RouteNode,
} from '@codebase-viz/types'
import { buildDiagrams } from './mermaid-renderer.js'
import { CHUNK_SEPARATOR } from './_shared/wrap-fallback.js'

function r(p: string): RouteNode {
  return createRouteNode({
    id: makeNodeId('route', `app${p}/page.ts`, p),
    path: p,
    filePath: `app${p}/page.ts`,
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'SSR',
    provenance: { file: `app${p}/page.ts`, line: 1, adapter: 'test', analyzerVersion: '0.1' },
    confidence: 'verified',
  })
}

// NestJS BE 패턴: /api/v1/{module}/{resource}/{action} = 10 × 5 × 4 = 200 routes
function nestjsRoutes(): RouteNode[] {
  const modules = ['admin', 'auth', 'billing', 'catalog', 'customer', 'employee', 'inventory', 'notification', 'order', 'product']
  const resources = ['users', 'roles', 'permissions', 'logs', 'reports']
  const actions = ['', '/list', '/create', '/:id']
  const routes: RouteNode[] = []
  for (const m of modules) {
    for (const res of resources) {
      for (const a of actions) {
        routes.push(r(`/api/v1/${m}/${res}${a}`))
      }
    }
  }
  return routes
}

function chunkCountOf(text: string): number {
  if (!text.includes(CHUNK_SEPARATOR)) return 1
  return text.split(CHUNK_SEPARATOR).length
}

// 한 청크(= 하나의 mermaid 다이어그램) 안 노드(라우트/테이블) 정의 라인 최댓값.
// webview는 청크별로 mermaid.render()를 메인 스레드 동기 실행하므로 청크당 노드 상한이
// freeze를 좌우한다(v1.2.49 B).
function maxNodesPerChunk(text: string): number {
  const chunks = text.split(CHUNK_SEPARATOR)
  let max = 0
  for (const c of chunks) {
    let n = 0
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t.startsWith('subgraph')) continue
      if (/^[A-Za-z0-9_]+(\[|\()/.test(t)) n++
    }
    if (n > max) max = n
  }
  return max
}

// 가장 안쪽 subgraph (자식 subgraph 없는) 안 노드 수의 최댓값.
// mermaid는 flat sibling 50+ 면 layout 포기 → 세로 압축 (사용자 이미지 3·4 현상).
function maxLeafSiblingCount(text: string): number {
  const lines = text.split('\n')
  let max = 0
  const stack: { count: number; hasChildSubgraph: boolean }[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('subgraph ')) {
      if (stack.length > 0) stack[stack.length - 1]!.hasChildSubgraph = true
      stack.push({ count: 0, hasChildSubgraph: false })
    } else if (trimmed === 'end') {
      const frame = stack.pop()
      if (frame !== undefined && !frame.hasChildSubgraph) {
        if (frame.count > max) max = frame.count
      }
    } else if (stack.length > 0 && /^\w+\[/.test(trimmed)) {
      stack[stack.length - 1]!.count++
    }
  }
  return max
}

// v1.2.51 C2 (v1.1.53 반전): 작은 프로젝트라도 top-level 형제 그룹 > GROUPS_PER_ROW(5)면
// Tab1을 chunked grid로 분리한다. 소형-다도메인이 단일 graph LR로 형제를 한 가로줄에 깔아
// 20:1 띠로 압축(전 도메인 렌더되나 가독성 X)되던 결함 해소. viewer row-mode CSS 그리드
// (minmax 560px auto-fit)가 청크를 다중 행/열 readable 배치.
// v1.1.53은 chunked가 'Y축 단조 나열' dump를 내던 시절 single-diagram을 강제했으나,
// v1.1.6 T3 grid 도입으로 dump가 이미 해소됨(실측 확인) → routeCount 단독 게이트 반전.
describe('mermaid-renderer — 소형-다도메인 chunk 게이트 (v1.2.51 C2)', () => {
  // dev-log-portfolio 시뮬레이션: 28 routes / 7 top-level groups (/, /about, /admin, /blog, /contact, /login, /projects)
  function devLogPortfolioRoutes(): RouteNode[] {
    return [
      r('/'),
      r('/about'),
      r('/admin/dashboard'), r('/admin/profile'), r('/admin/projects'), r('/admin/skills'),
      r('/blog'), r('/blog/new'), r('/blog/:slug'), r('/blog/edit/:id'),
      r('/contact'),
      r('/login'),
      r('/projects'), r('/projects/:slug'),
    ]
  }

  it('28 routes / 7 top-level groups (>5) → Tab1 폴더 개요 단일 다이어그램 (청킹 폐지, R-T1.7 v1.2)', () => {
    const routes = devLogPortfolioRoutes()
    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      nodes: routes,
      edges: [],
    })
    const { rendering } = buildDiagrams(graph)
    // v1.2.55: Tab1 폴더 개요(full-depth 중첩 + 카운트 배지) — 청킹 없음, top-level은 `~~~` chain X축 분포.
    expect(chunkCountOf(rendering)).toBe(1)
    expect(rendering).toMatch(/📁 \/blog · \d+ routes?/)
    expect(rendering).toContain(' ~~~ ')
  })

  it('28 routes / 7 top-level groups → Tab2 single chunk (Tab2 게이트 미변경 — 현 scope)', () => {
    // C2 수정은 Tab1로 한정(Tab2는 file-tree 분기 회귀면 + react-router는 이미 도메인 레이어).
    // Tab2 url-grouping 다도메인 가독성은 후속 scope.
    const routes = devLogPortfolioRoutes()
    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      nodes: routes,
      edges: [],
    })
    const { screenComponent } = buildDiagrams(graph)
    expect(chunkCountOf(screenComponent)).toBe(1)
  })

  it('root-only branch (`/`) edge case — chunk path 미발동, single diagram에 emit', () => {
    // advisor가 지적한 degenerate case: chunk 6/7에서 root `/` 단독으로 emit됐던 문제
    const routes = [r('/'), r('/about'), r('/blog')]
    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      nodes: routes,
      edges: [],
    })
    const { rendering, screenComponent } = buildDiagrams(graph)
    expect(chunkCountOf(rendering)).toBe(1)
    expect(chunkCountOf(screenComponent)).toBe(1)
    // v1.2.53: Tab1 도메인 요약 — root path가 도메인 박스로 single diagram 안에 등장
    expect(rendering).toMatch(/\/ · 1 route/)
  })
})

describe('mermaid-renderer stress — NestJS 200 routes (v1.1.6 회귀 fixture)', () => {
  const routes = nestjsRoutes()
  const graph = createIRGraph({
    analyzerVersion: 'codebase-viz@0.1.0',
    repoRoot: '/tmp/test',
    nodes: routes,
    edges: [],
  })

  it('총 라우트 수 200', () => {
    expect(routes.length).toBe(200)
  })

  describe('Tab1 rendering', () => {
    const { rendering } = buildDiagrams(graph)

    it('v1.2.55: Tab1 폴더 개요 — 청킹 없이 단일 다이어그램에 도메인 폴더 박스 emit', () => {
      // FE 표준 v1.2.55 (R-T1.2/R-T1.7): /api/v1 단일 자식 통과 후 admin/auth/billing 폴더 박스(재귀 카운트).
      // 이전: chunked nested(module→resource) — v1.2.53에서 폐지, v1.2.55에서 full-depth 폴더 개요로 재정의.
      expect(chunkCountOf(rendering)).toBe(1)
      expect(rendering).toMatch(/📁 \/[a-z]+ · \d+ routes?/)
    })

    it('[결함2] chunk 수가 top-level branch 수의 2배 이하 (200 routes → ≤ 10 chunks)', () => {
      // v1.2.53: 도메인 요약 → 항상 1 chunk
      expect(chunkCountOf(rendering)).toBeLessThanOrEqual(10)
    })

    it('[결함1] 한 leaf subgraph 안 flat sibling < 30 (mermaid layout 안전 한계)', () => {
      // nested 그룹핑이 작동하면 leaf subgraph 안 노드 수는 4 (actions per resource).
      // 현재 버그: /api 그룹 안에 200개 평면 나열.
      const max = maxLeafSiblingCount(rendering)
      expect(max).toBeLessThan(30)
    })
  })

  describe('Tab2 screen-component', () => {
    const { screenComponent } = buildDiagrams(graph)

    it('[결함1] chunked 경로에서도 nested subgraph 유지', () => {
      expect(screenComponent).toMatch(/subgraph API_V1_(ADMIN|AUTH|BILLING)_S[\s\S]*?subgraph API_V1_(ADMIN|AUTH|BILLING)_USERS_S/)
    })

    it('[결함2] chunk 수가 top-level branch 수의 2배 이하', () => {
      expect(chunkCountOf(screenComponent)).toBeLessThanOrEqual(10)
    })

    it('[결함1] 한 leaf subgraph 안 flat sibling < 30', () => {
      const max = maxLeafSiblingCount(screenComponent)
      expect(max).toBeLessThan(30)
    })
  })
})

// v1.2.49 B — 대형 프로젝트 webview freeze 회귀 fixture.
// 소수 top-level 브랜치에 깊게 중첩된 대형 라우트(B-1: 게이트 AND 미발동)와
// 단일 거대 브랜치(B-2: 브랜치 단위 무바운드 청크) 두 결함을 재현.
describe('mermaid-renderer freeze — 단일 대형 브랜치 (v1.2.49 B 회귀 fixture)', () => {
  // /portal 하나의 top-level 아래: big 섹션(20 resource × 4 action = 80) + 소형 4섹션(각 8) = 112 routes.
  // findBranchingGroups가 portal을 통과하면 브랜치 = 5개 (이전 게이트 `> 5` AND 미통과 → 단일 거대 다이어그램).
  function dominantBranchRoutes(): RouteNode[] {
    const routes: RouteNode[] = []
    const bigResources = Array.from({ length: 20 }, (_, i) => `res${i}`)
    const actions = ['', '/list', '/create', '/:id']
    for (const res of bigResources) for (const a of actions) routes.push(r(`/portal/big/${res}${a}`))
    for (const s of ['alpha', 'beta', 'gamma', 'delta']) {
      for (const res of ['x', 'y']) for (const a of actions) routes.push(r(`/portal/${s}/${res}${a}`))
    }
    return routes
  }

  const graph = createIRGraph({
    analyzerVersion: 'codebase-viz@0.1.0',
    repoRoot: '/tmp/test',
    nodes: dominantBranchRoutes(),
    edges: [],
  })

  it('총 라우트 112 (>100, top-level 브랜치 ≤ 5)', () => {
    expect(dominantBranchRoutes().length).toBe(112)
  })

  it('v1.2.53: routeCount>100(112)여도 Tab1은 청킹 안 함 — 도메인 요약 단일 다이어그램 (R-T1.7 v1.2)', () => {
    const { rendering } = buildDiagrams(graph)
    // 이전 B-6: routeCount>100이면 청킹 발동. v1.2.55: Tab1 폴더 개요는 폴더 수준이라 청킹 폐지.
    expect(chunkCountOf(rendering)).toBe(1)
    expect(rendering).toMatch(/📁 \/[a-z]+ ·/)
  })

  it('B-7: Tab1 도메인 요약 노드 수 = O(도메인) ≤ 50 (단일 다이어그램)', () => {
    const { rendering } = buildDiagrams(graph)
    expect(maxNodesPerChunk(rendering)).toBeLessThanOrEqual(50)
  })

  it('B-7: 청크당 노드 수가 budget(50) 이하 (Tab2)', () => {
    const { screenComponent } = buildDiagrams(graph)
    expect(maxNodesPerChunk(screenComponent)).toBeLessThanOrEqual(50)
  })

  it('한 leaf subgraph 안 flat sibling < 30 (nested 보존)', () => {
    const { rendering } = buildDiagrams(graph)
    expect(maxLeafSiblingCount(rendering)).toBeLessThan(30)
  })
})

// v1.2.55 회귀 가드 (ST4) — ST0/ST1 동작을 잠근다(이미 구현·통과, RED-first 아닌 회귀 가드).
// 근본원인: buildDiagrams가 v1.2.53 단일 Tab1을 routeCount>DEFAULT_NODE_THRESHOLD(300)로 재청킹 →
// wrapper 반복·findBranchingGroups 산란·도메인 누락 체감. >300 미커버 테스트 갭으로 누수됐던 것을 잠금.
describe('mermaid-renderer — Tab1 폴더 개요 >300 routes 회귀 가드 + 누락0 (v1.2.55 ST4)', () => {
  // react-router FE 메타 — wrapper(BROWSER/ROUTER/REACT) 분기까지 검증.
  function feGraph(routes: RouteNode[]) {
    return createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      metadata: {
        framework: 'react-router', hasSupabase: false, hasPrisma: false,
        hasDexie: false, hasFirebase: false, adapterCategory: 'FE',
      },
      nodes: routes,
      edges: [],
    })
  }

  const WINA_DOMAINS = [
    'login', 'sso-login', 'sso-result', 'home', 'system', 'sample', 'publish',
    'model', 'profile', 'reference-info', 'price', 'headOffice', 'agency',
    'partner', 'mobile', 'template',
  ]

  it('400 routes(>300)·16 도메인: Tab1 chunkCount===1 (재청킹 게이트 누수 차단)', () => {
    const routes = WINA_DOMAINS.flatMap(d => Array.from({ length: 25 }, (_, i) => r(`/${d}/mid${i % 5}/leaf${i}`)))
    expect(routes.length).toBe(400)
    const { rendering } = buildDiagrams(feGraph(routes))
    // 핵심 회귀: >300이어도 Tab1은 단일 다이어그램(청크 0).
    expect(chunkCountOf(rendering)).toBe(1)
    // wrapper 1세트만(반복 없음): BROWSER subgraph가 정확히 1개.
    expect(rendering.match(/subgraph BROWSER/g)?.length).toBe(1)
  })

  it('누락 0: 16 top-level 도메인이 전부 폴더 박스로 존재 + `~~~` chain이 정확히 16 도메인 연결', () => {
    const routes = WINA_DOMAINS.flatMap(d => Array.from({ length: 25 }, (_, i) => r(`/${d}/mid${i % 5}/leaf${i}`)))
    const { rendering } = buildDiagrams(feGraph(routes))
    // 각 도메인 폴더 박스 존재(camelCase·hyphen 포함).
    for (const d of WINA_DOMAINS) {
      expect(rendering, `도메인 /${d} 누락`).toContain(`📁 /${d} ·`)
    }
    // top-level `~~~` chain은 정확히 top-level 도메인만 연결 → 참조 id 수 = 16 (누락0 결정론 게이트).
    const chainLine = rendering.split('\n').find(l => l.includes(' ~~~ '))
    expect(chainLine, 'top-level chain 라인 없음').toBeDefined()
    const ids = chainLine!.trim().split(' ~~~ ')
    expect(ids.length).toBe(WINA_DOMAINS.length)
  })

  it('재귀 카운트 합 = 전체 page route 수 (silent drop 0)', () => {
    const routes = WINA_DOMAINS.flatMap(d => Array.from({ length: 25 }, (_, i) => r(`/${d}/mid${i % 5}/leaf${i}`)))
    const { rendering } = buildDiagrams(feGraph(routes))
    // top-level chain의 각 도메인 박스/subgraph 헤더 카운트를 합산 → 전체 라우트 수와 일치.
    const chainLine = rendering.split('\n').find(l => l.includes(' ~~~ '))!
    const topIds = chainLine.trim().split(' ~~~ ')
    let sum = 0
    for (const id of topIds) {
      // `${id}["📁 /name · N routes"]` 또는 `subgraph ${id}["📁 /name · N routes"]`
      const re = new RegExp(`(?:subgraph )?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\["📁 [^"]*· (\\d+) routes?"\\]`)
      const m = rendering.match(re)
      expect(m, `${id} 카운트 배지 없음`).not.toBeNull()
      sum += parseInt(m![1]!, 10)
    }
    expect(sum).toBe(routes.length)
  })
})
