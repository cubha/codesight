import { describe, it, expect } from 'vitest'
import { matchFeCallsToBeRoutes, remapCrossEdgeFromIds } from './cross-graph-matcher.js'
import { createRouteNode, createComponentNode, createIRGraph, makeNodeId, type RouteNode } from '@codebase-viz/types'

const p = {
  file: 'src/UserController.java',
  line: 1,
  adapter: 'springboot@0.1',
  analyzerVersion: 'codebase-viz@0.1.0',
}

function makeRoute(path: string, method?: string): RouteNode {
  return createRouteNode({
    id: makeNodeId('route', `src/${path}`, 'page'),
    path,
    filePath: `src/${path}`,
    routeFileKind: 'page',
    dynamicSegmentType: path.includes('[') ? 'dynamic' : 'static',
    isGroupRoute: false,
    renderingMode: 'SSR',
    ...(method !== undefined ? { httpMethod: method } : {}),
    provenance: p,
    confidence: 'verified',
  })
}

const opts = { fromRepoRoot: '/repo/frontend', toRepoRoot: '/repo/backend', analyzerVersion: 'codebase-viz@0.1.0' }

// Helper: use repo-relative filePaths (consistent with extractFeCalls output)
function feCall(method: string, url: string, filePath: string, line = 1): { method: string; url: string; filePath: string; line: number; confidence: 'verified'; library: 'axios' } {
  return { method, url, filePath, line, confidence: 'verified', library: 'axios' }
}

describe('matchFeCallsToBeRoutes', () => {
  it('정확매칭 — verified edge 생성', () => {
    const feCalls = [feCall('GET', '/api/users', 'src/components/UserList.tsx', 5)]
    const beRoutes = [makeRoute('/api/users', 'GET')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.kind).toBe('fe-be-call')
    expect(edges[0]?.confidence).toBe('verified')
    expect(edges[0]?.to).toBe(beRoutes[0]?.id)
  })

  it('Spring Boot :id 통일 포맷 — inferred match', () => {
    const feCalls = [feCall('GET', '/api/users/123', 'src/Profile.tsx', 10)]
    // Spring Boot adapter emits /:id via normalizeUrlPath
    const beRoutes = [makeRoute('/api/users/:id', 'GET')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe('inferred')
    if (edges[0]?.confidence === 'inferred') {
      expect(edges[0].inferenceChain).toContain('dynamic-segment-match')
    }
  })

  it('NestJS :param 포맷 — inferred match', () => {
    const feCalls = [feCall('DELETE', '/api/posts/42', 'src/PostDetail.tsx', 7)]
    const beRoutes = [makeRoute('/api/posts/:postId', 'DELETE')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe('inferred')
  })

  it('catch-all :slug* — inferred match', () => {
    const feCalls = [feCall('GET', '/docs/guide/setup', 'src/Docs.tsx', 3)]
    const beRoutes = [makeRoute('/docs/:slug*', 'GET')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe('inferred')
  })

  it('optional catch-all :slug? — inferred match', () => {
    const feCalls = [feCall('GET', '/docs', 'src/Docs.tsx', 3)]
    const beRoutes = [makeRoute('/docs/:slug?', 'GET')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe('inferred')
  })

  it('method 불일치 (GET vs POST) — dangling edge', () => {
    const feCalls = [feCall('GET', '/api/users', 'src/Users.tsx', 7)]
    const beRoutes = [makeRoute('/api/users', 'POST')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe('inferred')
    if (edges[0]?.confidence === 'inferred') {
      expect(edges[0].inferenceChain).toContain('no-route-match')
    }
  })

  it('dangling — BE 라우트에 URL 없음', () => {
    const feCalls = [feCall('GET', '/api/nonexistent', 'src/X.tsx')]
    const edges = matchFeCallsToBeRoutes(feCalls, [], opts)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.confidence).toBe('inferred')
    if (edges[0]?.confidence === 'inferred') {
      expect(edges[0].inferenceChain).toContain('no-route-match')
    }
    // dangling: from === to
    expect(edges[0]?.from).toBe(edges[0]?.to)
  })

  it('다중 method 동일 path — 각각 매칭', () => {
    const feCalls = [
      feCall('GET', '/api/posts', 'src/Posts.tsx', 5),
      feCall('POST', '/api/posts', 'src/CreatePost.tsx', 3),
    ]
    const beRoutes = [makeRoute('/api/posts', 'GET'), makeRoute('/api/posts', 'POST')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    expect(edges).toHaveLength(2)
    expect(edges.every(e => e.confidence === 'verified')).toBe(true)
  })

  it('빈 feCalls — 빈 배열 반환', () => {
    const edges = matchFeCallsToBeRoutes([], [makeRoute('/api/users')], opts)
    expect(edges).toHaveLength(0)
  })

  it('빈 beRouteNodes — 모두 dangling', () => {
    const feCalls = [
      feCall('GET', '/api/a', 'src/A.tsx'),
      feCall('POST', '/api/b', 'src/B.tsx'),
    ]
    const edges = matchFeCallsToBeRoutes(feCalls, [], opts)
    expect(edges).toHaveLength(2)
    expect(edges.every(e => e.confidence === 'inferred')).toBe(true)
  })

  it('opts 미제공 — crossProject 없이 edge 생성', () => {
    const feCalls = [feCall('GET', '/api/items', 'src/Items.tsx')]
    const beRoutes = [makeRoute('/api/items')]
    const edges = matchFeCallsToBeRoutes(feCalls, beRoutes)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.crossProject).toBeUndefined()
    expect(edges[0]?.confidence).toBe('verified')
  })
})

const pComp = {
  file: 'src/components/UserList.tsx',
  line: 1,
  adapter: 'nextjs-app-router@0.1',
  analyzerVersion: 'codebase-viz@0.1.0',
}

function makeFeGraph() {
  const comp = createComponentNode({
    id: makeNodeId('component', 'src/components/UserList.tsx', 'UserList'),
    name: 'UserList',
    filePath: 'src/components/UserList.tsx',
    runtime: 'client',
    provenance: pComp,
    confidence: 'verified',
  })
  return createIRGraph({
    analyzerVersion: 'codebase-viz@0.1.0',
    repoRoot: '/repo/frontend',
    projectName: 'frontend',
    nodes: [comp],
    edges: [],
  })
}

describe('remapCrossEdgeFromIds', () => {
  it('provenance.file이 feGraph ComponentNode.filePath와 일치 → from이 ComponentNode.id로 교체', () => {
    const feGraph = makeFeGraph()
    const feCalls = [feCall('GET', '/api/users', 'src/components/UserList.tsx')]
    const beRoutes = [makeRoute('/api/users', 'GET')]
    const rawEdges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    const remapped = remapCrossEdgeFromIds(rawEdges, feGraph)
    expect(remapped).toHaveLength(1)
    const compId = makeNodeId('component', 'src/components/UserList.tsx', 'UserList')
    expect(remapped[0]?.from).toBe(compId)
  })

  it('매칭 ComponentNode 없으면 합성 id 유지', () => {
    const feGraph = makeFeGraph()
    const feCalls = [feCall('GET', '/api/unknown', 'src/util/api.ts')]
    const edges = matchFeCallsToBeRoutes(feCalls, [], opts)
    const remapped = remapCrossEdgeFromIds(edges, feGraph)
    expect(remapped).toHaveLength(1)
    // from === to (dangling), 합성 id 유지
    expect(remapped[0]?.from).toBe(remapped[0]?.to)
  })

  it('from-id invariant: remapped edge의 from이 feGraph.nodes에 존재하거나 dangling', () => {
    const feGraph = makeFeGraph()
    const feCalls = [
      feCall('GET', '/api/users', 'src/components/UserList.tsx'),
      feCall('POST', '/api/missing', 'src/util/helper.ts'),
    ]
    const beRoutes = [makeRoute('/api/users', 'GET')]
    const rawEdges = matchFeCallsToBeRoutes(feCalls, beRoutes, opts)
    const remapped = remapCrossEdgeFromIds(rawEdges, feGraph)
    const nodeIds = new Set(feGraph.nodes.map(n => n.id))
    for (const edge of remapped) {
      if (edge.confidence === 'verified' || (edge.confidence === 'inferred' && edge.inferenceChain?.includes('dynamic-segment-match'))) {
        // matched edge: from should be in feGraph.nodes (after remap)
        expect(nodeIds.has(edge.from)).toBe(true)
      }
      // dangling edge: from === to (synthetic) — acceptable
    }
  })
})
