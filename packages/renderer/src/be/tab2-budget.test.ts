import { describe, it, expect } from 'vitest'
import type { IRGraph, ComponentNode, IREdge } from '@codebase-viz/types'
import { buildBeArchitectureDiagram } from './tab2.js'
import { CHUNK_SEPARATOR } from '../_shared/wrap-fallback.js'

// webview viewer.html mermaid.initialize 와 동일한 cap (per-chunk 적용).
const MAX_TEXT_SIZE = 1_000_000
const MAX_EDGES = 2000

function comp(id: string, name: string, filePath: string): ComponentNode {
  return {
    kind: 'component', id, name, filePath, runtime: 'server',
    provenance: { file: filePath, adapter: 'springboot@0.1', analyzerVersion: 't' },
    confidence: 'verified',
  } as unknown as ComponentNode
}
function calls(from: string, to: string): IREdge {
  return {
    kind: 'calls', id: `e_${from}_${to}`, from, to,
    provenance: { file: 'x', adapter: 'springboot@0.1', analyzerVersion: 't' }, confidence: 'verified',
  } as unknown as IREdge
}

// 한 top-level 패키지(bigdomain) 아래 N개 sub-package, 각 Controller→Service→Repository DI 체인.
// + LCP가 [com,corp]에서 멈추도록 별도 small 도메인 1개 → bigdomain이 단일 거대 top chunk가 된다.
function buildBigGraph(n: number): IRGraph {
  const nodes: ComponentNode[] = []
  const edges: IREdge[] = []
  const base = 'src/main/java/com/corp'
  for (let i = 0; i < n; i++) {
    const ctrl = comp(`c${i}`, `Svc${i}Controller`, `${base}/bigdomain/sub${i}/controller/Svc${i}Controller.java`)
    const svc = comp(`s${i}`, `Svc${i}Service`, `${base}/bigdomain/sub${i}/service/Svc${i}Service.java`)
    const repo = comp(`r${i}`, `Svc${i}Repository`, `${base}/bigdomain/sub${i}/repository/Svc${i}Repository.java`)
    nodes.push(ctrl, svc, repo)
    edges.push(calls(ctrl.id, svc.id), calls(svc.id, repo.id))
  }
  // small 도메인 — LCP를 [com,corp]로 끌어내림
  const oc = comp('oc', 'OtherController', `${base}/otherdomain/controller/OtherController.java`)
  const os = comp('os', 'OtherService', `${base}/otherdomain/service/OtherService.java`)
  nodes.push(oc, os)
  edges.push(calls(oc.id, os.id))
  return {
    schemaVersion: 1, analyzerVersion: 't', repoRoot: '/x', nodes, edges,
  } as unknown as IRGraph
}

function splitChunks(diagram: string): string[] {
  if (!diagram.includes(CHUNK_SEPARATOR)) return [diagram]
  return diagram.split(`\n${CHUNK_SEPARATOR}\n`).map(c => c.replace(/^%% chunk:\d+\/\d+\n/, '')).filter(c => c.trim())
}
function countEdges(chunk: string): number {
  return (chunk.match(/-->|-\.->/g) ?? []).length
}

describe('BE Tab2 대형 도메인 — budget sub-chunk (v1.2.51 B 게이트)', () => {
  // edge-count는 노드 이름 길이에 무관 → byte-cap보다 강건한 게이트(합성 짧은 이름도 유효).
  // maxEdges(2000)가 ~640 byte/edge 실측에선 maxTextSize(1M, ~1500 edge)보다 늦게 터지나,
  // 두 cap 모두 edge 수를 bound하면 동시에 보장된다.
  it('800 컨트롤러 단일 도메인 → 분할 발생 + 각 청크 edges·bytes < webview cap', () => {
    const graph = buildBigGraph(800)
    const diagram = buildBeArchitectureDiagram(graph)
    const chunks = splitChunks(diagram)

    // (1) 단일 거대 도메인이 여러 청크로 쪼개졌다 (otherdomain 1 + bigdomain ≥다수).
    expect(chunks.length).toBeGreaterThan(3)

    // (2) 분할이 실제로 필요했음 — 전체 edge 수가 maxEdges 초과
    //     (= 미분할 시 단일 도메인 청크가 maxEdges를 터뜨렸을 것).
    expect(countEdges(diagram)).toBeGreaterThan(MAX_EDGES)

    // (3) 핵심 게이트: 각 청크는 두 cap 모두 이내 + 헤드룸. 이게 실제 버그를 닫는 단언.
    for (const c of chunks) {
      expect(countEdges(c)).toBeLessThan(MAX_EDGES)
      expect(countEdges(c)).toBeLessThan(1500) // 헤드룸 (budget 1500 proxy → ~750 edge 목표)
      expect(c.length).toBeLessThan(MAX_TEXT_SIZE)
    }

    // (4) 누락 0 — 800개 컨트롤러가 모두 어딘가의 청크에 존재.
    for (let i = 0; i < 800; i++) {
      expect(diagram).toContain(`Svc${i}Controller`)
    }
  })

  it('작은 그래프 → 분할 안 함 (회귀: 예산 미만은 단일/기존 청크 유지)', () => {
    const graph = buildBigGraph(3)
    const diagram = buildBeArchitectureDiagram(graph)
    const chunks = splitChunks(diagram)
    // bigdomain(3) + otherdomain → 예산 한참 미만 → top-level 패키지 2개만 (2차 분할 X)
    expect(chunks.length).toBeLessThanOrEqual(2)
    expect(diagram.length).toBeLessThan(MAX_TEXT_SIZE)
  })
})
