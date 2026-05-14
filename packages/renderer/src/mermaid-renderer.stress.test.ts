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

// v1.1.53 회귀 fixture — 작은 프로젝트(28 routes / 7 top-level)도 GROUPS_PER_ROW=5 임계값
// 초과로 chunked path로 떨어져 viewer가 Y축 단조 나열했던 결함. routeCount 게이트 추가로
// 100 routes 미만은 single-diagram path 유지.
describe('mermaid-renderer — 작은 프로젝트 chunk 게이트 (v1.1.53 회귀 fixture)', () => {
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

  it('28 routes / 7 top-level groups → Tab1 single chunk (no chunked path)', () => {
    const routes = devLogPortfolioRoutes()
    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      nodes: routes,
      edges: [],
    })
    const { rendering } = buildDiagrams(graph)
    expect(chunkCountOf(rendering)).toBe(1)
  })

  it('28 routes / 7 top-level groups → Tab2 single chunk (no chunked path)', () => {
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
    // root path가 single diagram 안에 등장
    expect(rendering).toContain('"/ · SSR"')
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

    it('[결함1] chunked 경로에서도 nested subgraph 유지 — module 안에 resource subgraph 중첩', () => {
      // 기대: API_V1_ADMIN_G 안에 API_V1_ADMIN_USERS_G 중첩 (depth 보존).
      // chunk 단위가 1 branch = 1 module (V1 wrapper 없음, module 트리부터 시작).
      expect(rendering).toMatch(/subgraph API_V1_(ADMIN|AUTH|BILLING)_G[\s\S]*?subgraph API_V1_(ADMIN|AUTH|BILLING)_USERS_G/)
    })

    it('[결함2] chunk 수가 top-level branch 수의 2배 이하 (200 routes → ≤ 10 chunks)', () => {
      // 모두 /api 아래 → top-level branch = 1 → 기대 1 chunk
      // 현재 버그: GROUPS_PER_ROW=5 기준으로 200 routes → 40+ chunks
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
