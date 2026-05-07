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

  it('3. 단일 LCP — /users 공통 접두사', () => {
    const routes = [r('/users/1'), r('/users/2'), r('/users/3/edit')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(1)
    expect(result[0]!.groupKey).toBe('/users')
    expect(result[0]!.routes).toHaveLength(3)
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

  it('5. nested LCP — /api/v1 공통 접두사', () => {
    const routes = [r('/api/v1/users'), r('/api/v1/orders')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(1)
    expect(result[0]!.groupKey).toBe('/api/v1')
    expect(result[0]!.routes).toHaveLength(2)
  })

  it('6. mixed dynamic segment — /users와 /posts 2개 그룹', () => {
    const routes = [r('/users/[id]'), r('/users/[id]/edit'), r('/posts/[slug]')]
    const result = groupRoutesByUrl(routes)
    expect(result).toHaveLength(2)
    const keys = result.map(g => g.groupKey)
    expect(keys).toContain('/users')
    expect(keys).toContain('/posts')
  })
})
