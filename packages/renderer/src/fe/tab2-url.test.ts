import { describe, it, expect } from 'vitest'
import type { RouteNode, ComponentNode, IREdge } from '@codebase-viz/types'
import { buildFeDomainLayeredScreenDiagram } from './tab2-domain.js'
import { emitRouteAndFileLeaf, type FileTreeCtx } from './tab2-file.js'

function route(id: string, p: string): RouteNode {
  return {
    kind: 'route', id, path: p, filePath: 'src/router.tsx', routeFileKind: 'page',
    dynamicSegmentType: 'static', isGroupRoute: false, renderingMode: 'csr',
    provenance: { file: 'src/router.tsx', adapter: 'react-router@0.1', analyzerVersion: 't' },
    confidence: 'verified',
  } as unknown as RouteNode
}
function comp(id: string, name: string, filePath: string): ComponentNode {
  return {
    kind: 'component', id, name, filePath, runtime: 'client',
    provenance: { file: filePath, adapter: 'react-router@0.1', analyzerVersion: 't' },
    confidence: 'verified',
  } as unknown as ComponentNode
}
function renders(from: string, to: string): IREdge {
  return { kind: 'renders', id: `e_${from}_${to}`, from, to, provenance: { file: 'x', adapter: 'react-router@0.1', analyzerVersion: 't' }, confidence: 'verified' } as unknown as IREdge
}

// ST2: Tab2 leaf는 현재 마지막 세그먼트만 표시 → 전체 라우트 URL을 병기한다(IR/provenance 무변경, 표시 전용).
describe('Tab2 leaf 전체 라우트 URL 병기 (ST2 v1.2.55)', () => {
  it('domain-layered Tab2: leaf에 전체 URL 🔗 /full/path 병기', () => {
    const routes = [route('r1', '/agency/userMgmt/list'), route('r2', '/agency/orderMgmt/spec')]
    const comps = [
      comp('c1', 'UserListPage', 'src/pages/agency/userMgmt/UserListPage.tsx'),
      comp('c2', 'OrderSpecPage', 'src/pages/agency/orderMgmt/OrderSpecPage.tsx'),
    ]
    const edges = [renders('r1', 'c1'), renders('r2', 'c2')]
    const out = buildFeDomainLayeredScreenDiagram(routes, edges, comps)
    expect(out).toContain('🔗 /agency/userMgmt/list')
    expect(out).toContain('🔗 /agency/orderMgmt/spec')
    // 마지막 세그먼트 표시도 유지(추가이지 대체 아님)
    expect(out).toMatch(/list · csr/)
  })

  it('file-tree Tab2(emitRouteAndFileLeaf): leaf에 전체 URL 병기', () => {
    const r = route('r1', '/blog/post/detail')
    const c = comp('c1', 'PostDetail', 'app/blog/post/detail/page.tsx')
    const ctx: FileTreeCtx = {
      compById: new Map([['c1', c]]),
      rendersEdges: [renders('r1', 'c1')],
      importsEdges: [],
    }
    const lines: string[] = []
    emitRouteAndFileLeaf(r, '  ', ctx, lines, [], new Set())
    const out = lines.join('\n')
    expect(out).toContain('🔗 /blog/post/detail')
    expect(out).toMatch(/detail · csr/)
  })
})
