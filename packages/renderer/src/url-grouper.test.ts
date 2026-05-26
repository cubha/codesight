import { describe, it, expect } from 'vitest'
import { createRouteNode, makeNodeId, type RouteNode } from '@codebase-viz/types'
import { groupRoutesByUrl } from './url-grouper.js'

function r(p: string): RouteNode {
  return createRouteNode({
    id: makeNodeId('route', `app${p}/page.tsx`, p),
    path: p,
    filePath: `app${p}/page.tsx`,
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'unknown',
    provenance: {
      file: `app${p}/page.tsx`,
      line: 1,
      adapter: 'test',
      analyzerVersion: '0.1',
    },
    confidence: 'verified',
  })
}

describe('groupRoutesByUrl', () => {
  it('1. 빈 배열 → []', () => {
    expect(groupRoutesByUrl([])).toEqual([])
  })

  it('2. 단일 라우트 → [{ groupKey: "/", routes: [...] }]', () => {
    const result = groupRoutesByUrl([r('/')])
    expect(result).toHaveLength(1)
    expect(result[0]!.groupKey).toBe('/')
    expect(result[0]!.routes).toHaveLength(1)
  })

  it('3. 단일 LCP — /users 공통 접두사 (distinctPaths→nested)', () => {
    const routes = [r('/users/1'), r('/users/2'), r('/users/3/edit')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(1)
    expect(result[0]!.groupKey).toBe('/users')
    // distinctPaths > 1 → 재귀 발생 → 직접 routes는 [] (각 하위 path별 children으로 분리)
    expect(result[0]!.children.length).toBeGreaterThan(0)
  })

  it('4. multi-cluster fallback — /api, /admin, / 3개 그룹', () => {
    const routes = [r('/api/x'), r('/admin/y'), r('/')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(3)
    const keys = result.map(g => g.groupKey)
    expect(keys).toContain('/api')
    expect(keys).toContain('/admin')
    expect(keys).toContain('/')
  })

  it('5. nested LCP — /api/v1 공통 접두사 (distinctPaths→nested)', () => {
    const routes = [r('/api/v1/users'), r('/api/v1/orders')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(1)
    expect(result[0]!.groupKey).toBe('/api/v1')
    // distinctPaths > 1 → 재귀 발생 → /users, /orders 각자 child 그룹
    expect(result[0]!.children.length).toBeGreaterThan(0)
  })

  it('6. mixed dynamic segment — /users와 /posts 2개 그룹', () => {
    const routes = [r('/users/[id]'), r('/users/[id]/edit'), r('/posts/[slug]')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(2)
    const keys = result.map(g => g.groupKey)
    expect(keys).toContain('/users')
    expect(keys).toContain('/posts')
  })

  it('7. 8라우트 — nested 트리 depth ≥ 2 (B1)', () => {
    const routes = [
      r('/api/v1/partner/A'), r('/api/v1/partner/B'),
      r('/api/v1/partner/C'), r('/api/v1/partner/D'),
      r('/api/v1/admin/X'), r('/api/v1/admin/Y'),
      r('/api/v1/admin/Z'), r('/api/v1/admin/W'),
    ]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(1)
    expect(result[0]!.groupKey).toBe('/api/v1')
    expect(result[0]!.children.length).toBeGreaterThanOrEqual(1)
    function maxDepth(groups: typeof result): number {
      if (groups.length === 0) return 0
      return 1 + Math.max(...groups.map(g => maxDepth(g.children)))
    }
    expect(maxDepth(result)).toBeGreaterThanOrEqual(2)
  })

  it('8. maxDepth:1 — 깊이 절단으로 partner/admin 그룹 이하 평면화 (B1)', () => {
    const routes = [
      r('/api/v1/partner/A'), r('/api/v1/partner/B'),
      r('/api/v1/partner/C'), r('/api/v1/partner/D'),
      r('/api/v1/admin/X'), r('/api/v1/admin/Y'),
      r('/api/v1/admin/Z'), r('/api/v1/admin/W'),
    ]
    const result = groupRoutesByUrl(routes, { maxDepth: 1 })
    function nestingDepth(groups: typeof result): number {
      if (groups.length === 0) return 0
      return 1 + Math.max(...groups.map(g => nestingDepth(g.children)))
    }
    // maxDepth:1 → 재귀 1회 → 결과 최대 2단계
    expect(nestingDepth(result)).toBeLessThanOrEqual(2)
  })

  it('9. distinctPaths 기반 재귀 — maxDepth만 깊이 제어', () => {
    const routes = [
      r('/api/v1/partner/A'), r('/api/v1/partner/B'),
      r('/api/v1/partner/C'), r('/api/v1/partner/D'),
      r('/api/v1/admin/X'), r('/api/v1/admin/Y'),
      r('/api/v1/admin/Z'), r('/api/v1/admin/W'),
    ]
    const result = groupRoutesByUrl(routes)
    function hasChildren(groups: typeof result): boolean {
      return groups.some(g => g.children.length > 0 || hasChildren(g.children))
    }
    expect(hasChildren(result)).toBe(true)
  })

  it('10. 모든 path 동일 — 무한 재귀 없이 단일 그룹 반환 (B1)', () => {
    const routes = [r('/api/same'), r('/api/same'), r('/api/same'), r('/api/same'), r('/api/same')]
    expect(() => groupRoutesByUrl(routes)).not.toThrow()
    const result = groupRoutesByUrl(routes)
    expect(result.length).toBeGreaterThan(0)
  })

  it('11. BE 동일 path 다중 HTTP method — 재귀 없이 평면 유지', () => {
    // GET /list, POST /list → distinctPaths.size === 1 → 재귀 안 함
    const routes = [r('/api/list'), r('/api/list')]
    const result = groupRoutesByUrl(routes)
    function hasChildren(groups: typeof result): boolean {
      return groups.some(g => g.children.length > 0 || hasChildren(g.children))
    }
    expect(hasChildren(result)).toBe(false)
  })

  it('12. BE 2개 경로 — distinctPaths.size > 1 이면 분리', () => {
    const routes = [r('/api/v1/users'), r('/api/v1/orders')]
    const result = groupRoutesByUrl(routes)
    // /api/v1 LCP → 단일 그룹, children 없이 평면이거나 nested
    expect(result.length).toBeGreaterThan(0)
    // 두 경로가 하나의 그룹 아래 묶임 (LCP=/api/v1)
    expect(result[0]!.groupKey).toBe('/api/v1')
  })
})
