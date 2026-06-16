import { describe, it, expect } from 'vitest'
import type { RouteNode } from '@codebase-viz/types'
import type { NestedGroup } from '../url-grouper.js'
import { splitGroupsByNodeBound, collectNestedRoutes, GROUPS_PER_ROW } from './layout.js'

function r(id: string): RouteNode {
  return { kind: 'route', id, path: '/' + id } as unknown as RouteNode
}
function g(key: string, routeCount = 1, children: NestedGroup[] = []): NestedGroup {
  return { groupKey: key, routes: Array.from({ length: routeCount }, (_, i) => r(`${key}_${i}`)), children }
}

describe('splitGroupsByNodeBound — maxGroups(형제 그룹 수) bound (v1.2.51 C2)', () => {
  it('route 수가 적어도 형제 그룹>maxGroups면 청크 분할 (C2: 소형-다도메인)', () => {
    // 8개 도메인 × 2 route = 16 route (CHUNK_ROUTE_BUDGET=50 미만) → route 기준만이면 1청크.
    const groups = ['a', 'b', 'c', 'd', 'e', 'f', 'h', 'i'].map(k => g(k, 2))
    const chunks = splitGroupsByNodeBound(groups, 50, GROUPS_PER_ROW)
    // maxGroups=5 → 8 도메인은 ≥2 청크로 분할
    expect(chunks.length).toBeGreaterThan(1)
    // 각 청크의 top-level 그룹 수 ≤ maxGroups
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(GROUPS_PER_ROW)
    // 누락 0 — 16 route 전부 보존
    const total = chunks.reduce((n, c) => n + collectNestedRoutes(c).length, 0)
    expect(total).toBe(16)
  })

  it('형제 그룹 ≤ maxGroups면 단일 청크 (C1: 소형-소도메인, route도 적음)', () => {
    const groups = ['a', 'b', 'c'].map(k => g(k, 2))
    const chunks = splitGroupsByNodeBound(groups, 50, GROUPS_PER_ROW)
    expect(chunks.length).toBe(1)
    expect(chunks[0]!.length).toBe(3)
  })

  it('maxGroups 미지정(기존 호출) → route 수 기준만 동작 (회귀: 기존 동작 보존)', () => {
    // 8 도메인 × 2 route = 16 < 50 → maxGroups 없으면 1청크 (기존 behavior).
    const groups = ['a', 'b', 'c', 'd', 'e', 'f', 'h', 'i'].map(k => g(k, 2))
    const chunks = splitGroupsByNodeBound(groups, 50)
    expect(chunks.length).toBe(1)
  })

  it('route 수 bound와 maxGroups bound 동시 적용 — 둘 중 먼저 걸리는 쪽', () => {
    // 3 도메인 × 30 route = 90 route, maxGroups=5 → route(50) 기준이 먼저 → 분할
    const groups = ['a', 'b', 'c'].map(k => g(k, 30))
    const chunks = splitGroupsByNodeBound(groups, 50, GROUPS_PER_ROW)
    expect(chunks.length).toBeGreaterThan(1)
    const total = chunks.reduce((n, c) => n + collectNestedRoutes(c).length, 0)
    expect(total).toBe(90)
  })
})
