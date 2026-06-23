import { describe, it, expect } from 'vitest'
import { createRouteNode, makeNodeId, type RouteNode } from '@codebase-viz/types'
import { buildNestedFolderOverviewLines } from './tab1-tree.js'
import { groupRoutesByUrl } from '../url-grouper.js'

const PROV = { file: 'src/router.tsx', line: 1, adapter: 'reactrouter', analyzerVersion: '0.1' }

function rr(p: string): RouteNode {
  return createRouteNode({
    id: makeNodeId('route', 'src/router.tsx', p),
    path: p,
    filePath: 'src/router.tsx',
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'CSR',
    provenance: PROV,
    confidence: 'verified',
  })
}

function overview(routes: RouteNode[]): string {
  return buildNestedFolderOverviewLines(groupRoutesByUrl(routes), '  ').join('\n')
}

describe('buildNestedFolderOverviewLines (Tab1 v1.2.55 — full-depth folder 개요)', () => {
  it('구조적 폴더(중분류)를 full-depth 중첩 subgraph로 보존한다 (v1.2.53 flat 요약 반전)', () => {
    const lines = overview([
      rr('/partner/matMgmt/deco'),
      rr('/partner/matMgmt/spec'),
      rr('/partner/ordMgmt/plan'),
      rr('/agency/user'),
    ])
    // partner는 구조적 폴더(하위 분기 존재) → subgraph + 재귀 카운트 헤더
    expect(lines).toMatch(/subgraph \S+\["📁 \/partner · 3 routes"\]/)
    // 중분류 matMgmt/ordMgmt가 카운트 박스로 등재 (v1.2.53은 "matMgmt 미포함"이었음)
    expect(lines).toMatch(/📁 \/matMgmt · 2 routes/)
    expect(lines).toMatch(/📁 \/ordMgmt · 1 route\b/)
    // agency는 단일 라우트 → 카운트 박스(subgraph 아님)
    expect(lines).toMatch(/📁 \/agency · 1 route\b/)
    expect(lines).not.toMatch(/subgraph \S+\["📁 \/agency/)
  })

  it('개별 route leaf(렌더링모드 배지 노드)는 emit하지 않는다 — Tab2 위임', () => {
    const lines = overview([rr('/partner/matMgmt/deco'), rr('/partner/matMgmt/spec')])
    // leaf-folder matMgmt는 deco/spec를 개별 route 노드로 펼치지 않고 카운트로 collapse
    expect(lines).not.toContain('deco · CSR')
    expect(lines).not.toContain('spec · CSR')
    expect(lines).not.toContain('/partner/matMgmt/deco')
    expect(lines).toMatch(/📁 \/matMgmt · 2 routes/)
  })

  it('재귀 카운트: 상위 폴더 헤더 배지는 모든 하위 route의 합', () => {
    const lines = overview([rr('/system/code/list'), rr('/system/code/detail'), rr('/system/role')])
    expect(lines).toMatch(/📁 \/system · 3 routes/)
    expect(lines).toMatch(/📁 \/code · 2 routes/)
  })

  it('청크 구분자를 포함하지 않는다 (단일 다이어그램·청킹 폐지)', () => {
    const lines = overview(Array.from({ length: 12 }, (_, i) => rr(`/d${i}/x`)))
    expect(lines).not.toContain('%%--CHUNK--%%')
  })

  it('누락 0: WINA 16 top-level 도메인이 전부 출력에 존재한다', () => {
    // 사용자 제공 WINA 라우터 16 top-level (camelCase·dual-prefix 포함)
    const domains = [
      'login', 'sso-login', 'sso-result', 'home', 'system', 'sample', 'publish',
      'model', 'profile', 'reference-info', 'price', 'headOffice', 'agency',
      'partner', 'mobile', 'template',
    ]
    const routes = domains.flatMap(d => [rr(`/${d}/a`), rr(`/${d}/b`)])
    const lines = overview(routes)
    for (const d of domains) {
      expect(lines, `도메인 /${d} 누락`).toContain(`📁 /${d} ·`)
    }
  })
})
