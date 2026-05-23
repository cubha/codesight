import { describe, it, expect } from 'vitest'
import { mergeGraphs } from './merger.js'
import {
  createIRGraph,
  createRouteNode,
  createComponentNode,
  makeNodeId,
  makeEdgeId,
  createEdge,
} from '@codebase-viz/types'

const PROV = { file: 'app/page.tsx', line: 1, adapter: 'test', analyzerVersion: '0.1' }

function makeVerifiedRoute(routePath: string, filePath: string) {
  return createRouteNode({
    id: makeNodeId('route', filePath, routePath),
    path: routePath,
    filePath,
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'SSR',
    provenance: { ...PROV, file: filePath },
    confidence: 'verified',
  })
}

function makeInferredRoute(routePath: string, filePath: string) {
  return createRouteNode({
    id: makeNodeId('route', filePath, routePath),
    path: routePath,
    filePath,
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'SSR',
    provenance: { ...PROV, file: filePath },
    confidence: 'inferred',
    inferenceChain: ['LLM identified'],
  })
}

describe('mergeGraphs', () => {
  it('정적 노드와 LLM 노드를 합친다', () => {
    const staticRoute = makeVerifiedRoute('/blog', 'app/blog/page.tsx')
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [staticRoute], edges: [] })

    const llmRoute = makeInferredRoute('/contact', 'app/contact/page.tsx')
    const merged = mergeGraphs(staticGraph, [llmRoute], [])

    expect(merged.nodes).toHaveLength(2)
  })

  it('같은 파일 경로의 verified 노드가 있으면 LLM inferred 노드는 무시된다', () => {
    const staticRoute = makeVerifiedRoute('/blog', 'app/blog/page.tsx')
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [staticRoute], edges: [] })

    const llmDupeRoute = makeInferredRoute('/blog', 'app/blog/page.tsx')
    const merged = mergeGraphs(staticGraph, [llmDupeRoute], [])

    expect(merged.nodes).toHaveLength(1)
    // verified 노드가 유지된다
    expect(merged.nodes[0]?.confidence).toBe('verified')
  })

  it('v1.2.45 — 같은 URL path지만 다른 filePath의 LLM 라우트는 dedup 된다', () => {
    // static adapter: src/router.tsx에 createBrowserRouter로 /agency 정의
    const staticRoute = makeVerifiedRoute('/agency', 'src/router.tsx')
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [staticRoute], edges: [] })

    // LLM: src/pages/agency/Index.tsx를 라우트로 다시 분류
    const llmRoute = makeInferredRoute('/agency', 'src/pages/agency/Index.tsx')
    const merged = mergeGraphs(staticGraph, [llmRoute], [])

    expect(merged.nodes).toHaveLength(1)
    expect(merged.nodes[0]?.confidence).toBe('verified')
  })

  it('v1.2.45 — LLM 컴포넌트 filePath 확장자 차이는 dedup 된다', () => {
    const staticComp = createComponentNode({
      id: makeNodeId('component', 'src/pages/Foo.tsx', 'Foo'),
      name: 'Foo',
      filePath: 'src/pages/Foo.tsx',
      runtime: 'client',
      provenance: PROV,
      confidence: 'verified',
    })
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [staticComp], edges: [] })

    // LLM이 확장자 없는 filePath로 생성
    const llmComp = createComponentNode({
      id: makeNodeId('component', 'src/pages/Foo', 'Foo'),
      name: 'Foo',
      filePath: 'src/pages/Foo',
      runtime: 'client',
      provenance: PROV,
      confidence: 'inferred',
      inferenceChain: ['LLM'],
    })
    const merged = mergeGraphs(staticGraph, [llmComp], [])

    expect(merged.nodes).toHaveLength(1)
    expect(merged.nodes[0]?.confidence).toBe('verified')
  })

  it('v1.2.45 결함 #5 — dedup된 LLM 컴포넌트를 가리키는 LLM edge는 static ID로 remap된다 (phantom 차단)', () => {
    // static adapter: 정상 컴포넌트
    const staticComp = createComponentNode({
      id: makeNodeId('component', 'src/pages/Foo.tsx', 'Foo'),
      name: 'Foo',
      filePath: 'src/pages/Foo.tsx',
      runtime: 'client',
      provenance: PROV,
      confidence: 'verified',
    })
    const routeId = makeNodeId('route', 'src/router.tsx', '/foo')
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [staticComp], edges: [] })

    // LLM: 같은 컴포넌트(확장자 없음) → dedup
    const llmCompId = makeNodeId('component', 'src/pages/Foo', 'Foo')
    const llmComp = createComponentNode({
      id: llmCompId,
      name: 'Foo',
      filePath: 'src/pages/Foo',
      runtime: 'client',
      provenance: PROV,
      confidence: 'inferred',
      inferenceChain: ['LLM'],
    })
    // LLM이 만든 edge — phantom 위험
    const llmEdge = createEdge({
      id: makeEdgeId('renders', routeId, llmCompId),
      from: routeId,
      to: llmCompId,
      kind: 'renders',
      provenance: PROV,
      confidence: 'inferred',
      inferenceChain: ['LLM'],
    })

    const merged = mergeGraphs(staticGraph, [llmComp], [llmEdge])

    // 노드: 1개 (static만)
    expect(merged.nodes).toHaveLength(1)
    // edge: 1개. to는 static ID로 remap됨 (phantom 차단)
    expect(merged.edges).toHaveLength(1)
    expect(merged.edges[0]?.to).toBe(staticComp.id)
    expect(merged.edges[0]?.to).not.toBe(llmCompId)
  })

  it('정적 엣지와 LLM 엣지를 합친다', () => {
    const compId = makeNodeId('component', 'app/Header.tsx', 'Header')
    const routeId = makeNodeId('route', 'app/page.tsx', '/')
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [], edges: [] })

    const llmEdge = createEdge({
      id: makeEdgeId('renders', routeId, compId),
      from: routeId,
      to: compId,
      kind: 'renders',
      provenance: PROV,
      confidence: 'inferred',
      inferenceChain: ['LLM'],
    })
    const merged = mergeGraphs(staticGraph, [], [llmEdge])
    expect(merged.edges).toHaveLength(1)
  })

  it('중복 엣지는 추가되지 않는다', () => {
    const compId = makeNodeId('component', 'app/Header.tsx', 'Header')
    const routeId = makeNodeId('route', 'app/page.tsx', '/')
    const existingEdge = createEdge({
      id: makeEdgeId('renders', routeId, compId),
      from: routeId,
      to: compId,
      kind: 'renders',
      provenance: PROV,
      confidence: 'verified',
    })
    const staticGraph = createIRGraph({ analyzerVersion: '0.1', repoRoot: '/tmp', nodes: [], edges: [existingEdge] })

    const llmDupeEdge = createEdge({
      id: makeEdgeId('renders', routeId, compId),
      from: routeId,
      to: compId,
      kind: 'renders',
      provenance: PROV,
      confidence: 'inferred',
      inferenceChain: ['LLM'],
    })
    const merged = mergeGraphs(staticGraph, [], [llmDupeEdge])
    expect(merged.edges).toHaveLength(1)
  })
})
