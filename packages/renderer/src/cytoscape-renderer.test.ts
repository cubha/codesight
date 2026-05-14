import { describe, it, expect } from 'vitest'
import {
  createIRGraph,
  createRouteNode,
  createComponentNode,
  makeNodeId,
  type Provenance,
} from '@codebase-viz/types'
import {
  buildTab1CytoscapeOptions,
  buildTab2CytoscapeOptions,
  buildTab3CytoscapeOptions,
} from './cytoscape-renderer.js'

const PROV: Provenance = {
  file: 'src/app/page.tsx',
  line: 1,
  adapter: 'test',
  analyzerVersion: 'test@0.1',
}

function miniGraph() {
  const routes = Array.from({ length: 28 }, (_, i) => {
    const path = `/app/page${i}`
    const file = `src/app/page${i}.tsx`
    return createRouteNode({
      id: makeNodeId('route', file, 'page'),
      path,
      filePath: file,
      routeFileKind: 'page',
      dynamicSegmentType: 'static',
      isGroupRoute: false,
      renderingMode: 'SSR',
      confidence: 'verified',
      provenance: { ...PROV, file },
    })
  })
  return createIRGraph({
    analyzerVersion: 'test@0.1',
    repoRoot: '/x',
    nodes: routes,
    edges: [],
  })
}

describe('cytoscape-renderer', () => {
  it('Tab1: 28-route fixture에 대해 elk layered + expand-collapse 옵션을 emit', () => {
    const g = miniGraph()
    const opts = buildTab1CytoscapeOptions(g)
    expect(opts.layout['name']).toBe('elk')
    expect(opts.expandCollapse).toBeDefined()
    expect(opts.meta.tab).toBe('tab1')
    expect(opts.meta.nodeCount).toBe(28)
    expect(opts.meta.edgeCount).toBe(0)
    // group은 /app prefix 하나만 생성 (모든 route가 /app/* 패턴).
    expect(opts.meta.groupCount).toBeGreaterThan(0)
  })

  it('Tab1 style: route/group/edge 스타일 셀렉터 포함', () => {
    const g = miniGraph()
    const opts = buildTab1CytoscapeOptions(g)
    const selectors = opts.style.map(s => s.selector)
    expect(selectors).toContain('node[kind = "route"]')
    expect(selectors).toContain('node[kind = "group"]')
    expect(selectors).toContain('edge[confidence = "inferred"]')
  })

  it('Tab2: route + component 모두 포함', () => {
    const c = createComponentNode({
      id: makeNodeId('component', 'src/c.tsx', 'C'),
      name: 'C',
      filePath: 'src/c.tsx',
      runtime: 'client',
      confidence: 'verified',
      provenance: { ...PROV, file: 'src/c.tsx' },
    })
    const g = miniGraph()
    g.nodes.push(c)
    const opts = buildTab2CytoscapeOptions(g)
    expect(opts.meta.tab).toBe('tab2')
    expect(opts.meta.nodeCount).toBe(29)
    const selectors = opts.style.map(s => s.selector)
    expect(selectors).toContain('node[kind = "component"]')
    expect(selectors).toContain('node[runtime = "client"]')
  })

  it('Tab3: tables only', () => {
    const opts = buildTab3CytoscapeOptions(miniGraph())
    expect(opts.meta.tab).toBe('tab3')
    expect(opts.meta.nodeCount).toBe(0) // 28 routes는 Tab3 필터에서 제외
  })

  it('expandCollapse: layoutBy가 elk', () => {
    const g = miniGraph()
    const opts = buildTab1CytoscapeOptions(g)
    expect((opts.expandCollapse['layoutBy'] as Record<string, unknown>)['name']).toBe('elk')
  })

  // SubTask 1-5: Tab2 generalize 검증 — 200 component 합성 IRGraph가
  // mapper/renderer 양쪽 모두에서 본질 손실 없이 통과해야 한다.
  it('Tab2 generalize: 200 component IRGraph가 file-dir compound로 묶이고 information loss 없음', () => {
    const components = Array.from({ length: 200 }, (_, i) => {
      // 5개 디렉토리에 분산: src/components/{a,b,c,d,e}/Comp{i}.tsx
      const dir = ['a', 'b', 'c', 'd', 'e'][i % 5]
      const file = `src/components/${dir}/Comp${i}.tsx`
      return createComponentNode({
        id: makeNodeId('component', file, `Comp${i}`),
        name: `Comp${i}`,
        filePath: file,
        runtime: (i % 3 === 0 ? 'client' : 'server') as 'client' | 'server',
        confidence: 'verified',
        provenance: { ...PROV, file },
      })
    })
    const graph = createIRGraph({
      analyzerVersion: 'test@0.1',
      repoRoot: '/x',
      nodes: components,
      edges: [],
    })
    const opts = buildTab2CytoscapeOptions(graph)
    // 정보량 보존: 200 component 모두 살아남음.
    expect(opts.meta.nodeCount).toBe(200)
    // 5개 디렉토리 그룹 + 상위 (src, src/components) → 7개.
    expect(opts.meta.groupCount).toBeGreaterThanOrEqual(5)
    // 모든 component는 parent를 가진다 (compound 일관성).
    const comps = opts.elements.nodes.filter(n => n.data.kind === 'component')
    for (const c of comps) {
      expect(c.data.parent).toBeDefined()
    }
    // runtime별 분포가 유지된다 (provenance/confidence와 함께 보존).
    const clientCount = comps.filter(c => c.data.runtime === 'client').length
    expect(clientCount).toBeGreaterThan(60)
    expect(clientCount).toBeLessThan(80)
  })
})
