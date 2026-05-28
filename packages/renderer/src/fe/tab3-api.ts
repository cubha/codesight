import type { IRGraph, IREdge, RouteNode, ComponentNode } from '@codebase-viz/types'
import { isRouteNode, isComponentNode } from '@codebase-viz/types'
import type { NestedGroup } from '../url-grouper.js'
import { groupRoutesByUrl } from '../url-grouper.js'
import { sanitizeId, modeClass } from '../helpers/ids.js'
import { RENDERING_INIT, CLASS_DEFS } from '../helpers/constants.js'
import { groupSubgraphId, sectionLabel } from './labels.js'

// 읽기 전용 lookup 묶음. T1 lookup table·T4 시퀀스 신규 빌더는 본 ctx에 필드 추가만으로 주입 가능.
export interface ApiCallCtx {
  routeToComp: Map<string, string>
  compById: Map<string, ComponentNode>
  compToApiCalls: Map<string, IREdge[]>
}

// React Router Tab3 = Route별 API 호출 다이어그램.
// - 도메인 subgraph (Tab1·Tab2와 일관)
// - 각 라우트 leaf → rendersEdge로 매핑된 Page Component → api-call edges
// - API endpoint 노드는 method+path를 라벨로 합성 (graph.nodes에 미등록, edge.to NodeId로만 식별)
// - library별 클래스 차등 (axios/fetch/react-query)
export function buildFeApiCallDiagram(graph: IRGraph): string {
  const routeNodes = graph.nodes.filter(isRouteNode).filter(r => r.routeFileKind === 'page')
  const componentNodes = graph.nodes.filter(isComponentNode)
  const rendersEdges = graph.edges.filter(e => e.kind === 'renders')
  const apiCallEdges = graph.edges.filter(e => e.kind === 'api-call')

  if (routeNodes.length === 0) return 'graph TD\n  empty["(no routes found)"]'
  if (apiCallEdges.length === 0) return 'graph TD\n  empty["(no API calls detected)"]'

  const compById = new Map(componentNodes.map(c => [c.id, c]))
  const routeToComp = new Map<string, string>()
  for (const e of rendersEdges) {
    if (!routeToComp.has(e.from)) routeToComp.set(e.from, e.to)
  }
  const compToApiCalls = new Map<string, typeof apiCallEdges>()
  for (const e of apiCallEdges) {
    const list = compToApiCalls.get(e.from) ?? []
    list.push(e)
    compToApiCalls.set(e.from, list)
  }
  const ctx: ApiCallCtx = { routeToComp, compById, compToApiCalls }

  const lines: string[] = [RENDERING_INIT, 'graph LR', CLASS_DEFS]
  lines.push('  classDef apiAxios fill:#1a0d1a,stroke:#a855f7,color:#e9d5ff')
  lines.push('  classDef apiFetch fill:#0d1a1a,stroke:#06b6d4,color:#a5f3fc')
  lines.push('  classDef apiQuery fill:#1a0d0d,stroke:#f43f5e,color:#fecdd3')
  const edgeLines: string[] = []
  const endpointEmitted = new Set<string>()

  const routeGroups = groupRoutesByUrl(routeNodes)
  emitFeApiCallTreeLines(routeGroups, '  ', ctx, lines, edgeLines, endpointEmitted)
  lines.push(...edgeLines)
  return lines.join('\n')
}

export function emitFeApiCallTreeLines(
  groups: NestedGroup[],
  indent: string,
  ctx: ApiCallCtx,
  lines: string[],
  edges: string[],
  endpointEmitted: Set<string>,
): void {
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) {
        emitRouteApiCalls(r, indent, ctx, lines, edges, endpointEmitted)
      }
      if (group.children.length > 0) {
        emitFeApiCallTreeLines(group.children, indent, ctx, lines, edges, endpointEmitted)
      }
      continue
    }
    const sgId = groupSubgraphId(group.groupKey).replace(/_G$/, '_API')
    lines.push(`${indent}subgraph ${sgId}["${sectionLabel(leafSeg)}"]`)
    for (const r of group.routes) {
      emitRouteApiCalls(r, i2, ctx, lines, edges, endpointEmitted)
    }
    if (group.children.length > 0) {
      emitFeApiCallTreeLines(group.children, i2, ctx, lines, edges, endpointEmitted)
    }
    lines.push(`${indent}end`)
  }
}

export function emitRouteApiCalls(
  r: RouteNode,
  indent: string,
  ctx: ApiCallCtx,
  lines: string[],
  edges: string[],
  endpointEmitted: Set<string>,
): void {
  const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
  const displayPath = r.path.split('/').filter(Boolean).pop() ?? r.path
  lines.push(`${indent}${sanitizeId(r.id)}["${displayPath} · ${badge}"]:::${modeClass(r.renderingMode)}`)

  const compId = ctx.routeToComp.get(r.id)
  if (compId === undefined) return
  const calls = ctx.compToApiCalls.get(compId) ?? []
  for (const call of calls) {
    if (call.apiCall === undefined) continue
    const { method, path: apiPath, library } = call.apiCall
    const endpointId = `ep_${sanitizeId(`${method}_${apiPath}`)}`
    if (!endpointEmitted.has(endpointId)) {
      endpointEmitted.add(endpointId)
      const cls = library === 'fetch' ? 'apiFetch' : library === 'react-query' ? 'apiQuery' : 'apiAxios'
      const arrow = call.confidence === 'inferred' ? '⟿' : '→'
      lines.push(`${indent}${endpointId}["${method} ${apiPath} ${arrow} ${library}"]:::${cls}`)
    }
    const edgeArrowChar = call.confidence === 'inferred' ? '-.->' : '-->'
    edges.push(`  ${sanitizeId(r.id)} ${edgeArrowChar} ${endpointId}`)
  }
}
