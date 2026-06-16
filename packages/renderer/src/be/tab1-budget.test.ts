import { describe, it, expect } from 'vitest'
import type { IRGraph, RouteNode } from '@codebase-viz/types'
import { buildBeRenderingDiagram } from './tab1.js'
import { CHUNK_SEPARATOR } from '../_shared/wrap-fallback.js'

const MAX_TEXT_SIZE = 1_000_000
const MAX_EDGES = 2000

function route(id: string, filePath: string, p: string, method: string): RouteNode {
  return {
    kind: 'route', id, path: p, filePath, routeFileKind: 'page',
    dynamicSegmentType: 'static', isGroupRoute: false, renderingMode: 'ssr', httpMethod: method,
    provenance: { file: filePath, adapter: 'springboot@0.1', analyzerVersion: 't' },
    confidence: 'verified',
  } as unknown as RouteNode
}

// 한 top-level 도메인(bigdomain) 아래 N개 controller 파일, 각 4 endpoint.
// + admin 소도메인 → LCP가 [com,corp]에서 멈춰 bigdomain이 단일 거대 top chunk가 된다.
function buildBigRouteGraph(n: number): IRGraph {
  const nodes: RouteNode[] = []
  const base = 'src/main/java/com/corp'
  const mk = (domain: string, i: number): void => {
    const fp = `${base}/${domain}/f${i}/controller/F${i}Controller.java`
    for (const [j, m] of [['list', 'GET'], ['one', 'GET'], ['create', 'POST'], ['remove', 'DELETE']] as const) {
      nodes.push(route(`${domain}_${i}_${j}`, fp, `/api/${domain}/f${i}/${j}`, m))
    }
  }
  for (let i = 0; i < n; i++) mk('bigdomain', i)
  for (let i = 0; i < 3; i++) mk('admin', i)
  return { schemaVersion: 1, analyzerVersion: 't', repoRoot: '/x', nodes, edges: [] } as unknown as IRGraph
}

function splitChunks(diagram: string): string[] {
  if (!diagram.includes(CHUNK_SEPARATOR)) return [diagram]
  return diagram.split(`\n${CHUNK_SEPARATOR}\n`).map(c => c.replace(/^%% chunk:\d+\/\d+\n/, '')).filter(c => c.trim())
}
function countEdges(chunk: string): number {
  return (chunk.match(/-->|-\.->|---/g) ?? []).length
}

describe('BE Tab1 대형 도메인 — budget sub-chunk (v1.2.51 B 게이트)', () => {
  it('500 endpoint-heavy 컨트롤러 단일 도메인 → 분할 발생 + 각 청크 < webview cap', () => {
    const graph = buildBigRouteGraph(500)
    const diagram = buildBeRenderingDiagram(graph)
    const chunks = splitChunks(diagram)

    expect(chunks.length).toBeGreaterThan(2) // bigdomain ≥다수 + admin
    expect(countEdges(diagram)).toBeGreaterThan(MAX_EDGES) // 미분할 시 단일 청크가 터졌을 증거
    for (const c of chunks) {
      expect(countEdges(c)).toBeLessThan(MAX_EDGES)
      expect(c.length).toBeLessThan(MAX_TEXT_SIZE)
    }
    for (let i = 0; i < 500; i++) expect(diagram).toContain(`F${i}Controller`)
  })

  it('작은 그래프 → 분할 안 함 (회귀: 예산 미만 기존 출력 유지)', () => {
    const graph = buildBigRouteGraph(3)
    const diagram = buildBeRenderingDiagram(graph)
    expect(splitChunks(diagram).length).toBeLessThanOrEqual(2)
  })
})
