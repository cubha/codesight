import type { IREdge, ComponentNode } from '@codebase-viz/types'
import type { NestedGroup } from '../url-grouper.js'
import { sanitizeId, modeClass, edgeArrow } from '../helpers/ids.js'
import { RENDERING_INIT, CLASS_DEFS } from '../helpers/constants.js'
import { emitInnerRowSubgraphs, collectNestedRoutes, chunkGroups, GROUPS_PER_ROW } from '../helpers/layout.js'
import { groupSubgraphId, sectionLabel, stripGroupPrefix, routeUrlLine } from './labels.js'

// 읽기 전용 lookup 묶음. T1 lookup table·T4 시퀀스 신규 빌더는 본 ctx에 필드 추가만으로 주입 가능.
export interface ScreenCtx {
  routeToComps: Map<string, string[]>
  rendersEdges: IREdge[]
  connectedComponents: ComponentNode[]
}

export function buildScreenSubgraphLines(
  groups: NestedGroup[],
  indent: string,
  ctx: ScreenCtx,
  compNodeRendered: Set<string>,
  allEdges: string[],
): string[] {
  const lines: string[] = []
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) {
        const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
        lines.push(`${indent}${sanitizeId(r.id)}["${r.path} · ${badge}"]:::${modeClass(r.renderingMode)}`)
      }
      if (group.children.length > 0) {
        lines.push(...buildScreenSubgraphLines(group.children, indent, ctx, compNodeRendered, allEdges))
      }
      continue
    }
    const sgId = groupSubgraphId(group.groupKey).replace(/_G$/, '_S')
    lines.push(`${indent}subgraph ${sgId}["${sectionLabel(leafSeg)}"]`)
    lines.push(...emitInnerRowSubgraphs(i2, sgId, group.routes.length, (i, ind) => {
      const r = group.routes[i]!
      const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
      const displayPath = stripGroupPrefix(r.path, group.groupKey)
      return `${ind}${sanitizeId(r.id)}["${displayPath} · ${badge}<br/>${routeUrlLine(r)}"]:::${modeClass(r.renderingMode)}`
    }))

    const compsInGroup: string[] = []
    for (const r of group.routes) {
      const comps = ctx.routeToComps.get(r.id) ?? []
      for (const compId of comps) {
        const edge = ctx.rendersEdges.find(e => e.from === r.id && e.to === compId)
        if (edge !== undefined) {
          allEdges.push(`  ${sanitizeId(r.id)} ${edgeArrow(edge)} ${sanitizeId(compId)}`)
        }
        if (compNodeRendered.has(compId)) continue
        compNodeRendered.add(compId)
        const comp = ctx.connectedComponents.find(c => c.id === compId)
        if (comp === undefined) continue
        const label = comp.runtime === 'client' ? `${comp.name} [CSR]` : comp.name
        compsInGroup.push(`${sanitizeId(comp.id)}["${label}"]`)
      }
    }
    if (compsInGroup.length > 0) {
      const compSgId = sgId + '_C'
      lines.push(`${i2}subgraph ${compSgId}`)
      lines.push(...emitInnerRowSubgraphs(i2 + '  ', compSgId, compsInGroup.length,
        (i, ind) => `${ind}${compsInGroup[i]!}`))
      lines.push(`${i2}end`)
    }

    // Tab2도 자식 subgraph가 GROUPS_PER_ROW 초과 시 invisible row 래퍼 + direction LR.
    // mermaid v11: 외부 edge는 immediate parent subgraph direction만 무시. ROW wrapper는
    // ancestor이므로 direction LR 유효.
    if (group.children.length > 0) {
      if (group.children.length <= GROUPS_PER_ROW) {
        lines.push(...buildScreenSubgraphLines(group.children, i2, ctx, compNodeRendered, allEdges))
      } else {
        const i3 = i2 + '  '
        const rowChunks = chunkGroups(group.children, GROUPS_PER_ROW)
        rowChunks.forEach((chunk, rowIdx) => {
          const rowId = `${sgId}_CR${rowIdx}`
          lines.push(`${i2}subgraph ${rowId} [" "]`)
          lines.push(`${i3}direction LR`)
          lines.push(...buildScreenSubgraphLines(chunk, i3, ctx, compNodeRendered, allEdges))
          lines.push(`${i2}end`)
          lines.push(`${i2}style ${rowId} fill:none,stroke:none`)
        })
      }
    }
    lines.push(`${indent}end`)
  }
  return lines
}

export function renderScreenSection(
  routeGroups: NestedGroup[],
  allRendersEdges: IREdge[],
  importsEdges: IREdge[],
  allComponentNodes: ComponentNode[],
): string {
  const pageRoutes = collectNestedRoutes(routeGroups)
  const pageRouteIds = new Set(pageRoutes.map(r => r.id))
  const rowRendersEdges = allRendersEdges.filter(e => pageRouteIds.has(e.from))
  const connectedCompIds = new Set(rowRendersEdges.map(e => e.to))
  const connectedComponents = allComponentNodes.filter(c => connectedCompIds.has(c.id))

  const routeToComps = new Map<string, string[]>()
  for (const edge of rowRendersEdges) {
    if (!connectedCompIds.has(edge.to)) continue
    const list = routeToComps.get(edge.from) ?? []
    list.push(edge.to)
    routeToComps.set(edge.from, list)
  }

  const lines: string[] = [RENDERING_INIT, 'graph TB', CLASS_DEFS]
  const compNodeRendered = new Set<string>()
  const allEdges: string[] = []
  const ctx: ScreenCtx = { routeToComps, rendersEdges: rowRendersEdges, connectedComponents }

  lines.push(...buildScreenSubgraphLines(routeGroups, '  ', ctx, compNodeRendered, allEdges))

  for (const e of allEdges) lines.push(e)

  const connectedIdSet = new Set(connectedComponents.map(c => c.id))
  for (const edge of importsEdges) {
    if (connectedIdSet.has(edge.from) && connectedIdSet.has(edge.to)) {
      lines.push(`  ${sanitizeId(edge.from)} ${edgeArrow(edge)} ${sanitizeId(edge.to)}`)
    }
  }

  if (pageRoutes.length === 0 && connectedComponents.length === 0) {
    lines.push('  empty["(no screen/component data)"]')
  }

  return lines.join('\n')
}
