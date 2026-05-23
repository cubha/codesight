import { makeEdgeId, type IRGraph, type IRNode, type IREdge, type NodeId } from '@codebase-viz/types'

// v1.2.45: dedup 키는 노드 정체성 기준. URL/심볼+파일위치 정규화로 같은 의미 노드의 중복 차단.
// - route: URL path + routeFileKind. (LLM=src/pages/X.tsx vs static=src/router.tsx 라우트가 같은 URL이면 1개로 합치기)
// - component: filePath 확장자 정규화 + 심볼명. (LLM=foo vs static=foo.tsx 컴포넌트 dedup)
const COMPONENT_EXT_RE = /\.(tsx?|jsx?|vue|svelte)$/

function nodeKey(node: IRNode): string {
  if (node.kind === 'route') return `route:${node.path}:${node.routeFileKind}`
  if (node.kind === 'component') {
    const fpNoExt = node.filePath.replace(COMPONENT_EXT_RE, '')
    return `component:${fpNoExt}:${node.name}`
  }
  return `table:${node.name}`
}

export function mergeGraphs(staticGraph: IRGraph, llmNodes: IRNode[], llmEdges: IREdge[]): IRGraph {
  const mergedNodes: IRNode[] = [...staticGraph.nodes]
  // v1.2.45 결함 #5: dedup된 LLM 노드의 NodeId가 그래프에서 사라져도 LLM edges는 그 ID를 가리키면
  // mermaid가 phantom 노드를 자동 생성한다. LLM_id → static_id remap 후 LLM edges from/to 치환.
  const keyToId = new Map<string, NodeId>()
  for (const n of staticGraph.nodes) keyToId.set(nodeKey(n), n.id)

  const idRemap = new Map<NodeId, NodeId>()
  for (const node of llmNodes) {
    const key = nodeKey(node)
    const existingId = keyToId.get(key)
    if (existingId !== undefined) {
      // 기존 노드(verified 우선) 유지. LLM의 ID는 기존 ID로 remap → edges에서 치환.
      if (existingId !== node.id) idRemap.set(node.id, existingId)
      continue
    }
    keyToId.set(key, node.id)
    mergedNodes.push(node)
  }

  const remap = (id: NodeId): NodeId => idRemap.get(id) ?? id

  const staticEdgeKeys = new Set(staticGraph.edges.map(e => `${e.from}:${e.to}:${e.kind}`))
  const mergedEdges: IREdge[] = [...staticGraph.edges]
  const mergedEdgeKeys = new Set(staticEdgeKeys)

  for (const edge of llmEdges) {
    const newFrom = remap(edge.from)
    const newTo = remap(edge.to)
    const key = `${newFrom}:${newTo}:${edge.kind}`
    if (mergedEdgeKeys.has(key)) continue
    mergedEdgeKeys.add(key)
    if (newFrom === edge.from && newTo === edge.to) {
      mergedEdges.push(edge)
    } else {
      // remap된 경우 edge.id도 from/to 기반이므로 재생성
      mergedEdges.push({ ...edge, from: newFrom, to: newTo, id: makeEdgeId(edge.kind, newFrom, newTo) })
    }
  }

  return { ...staticGraph, nodes: mergedNodes, edges: mergedEdges }
}
