import type { NestedGroup } from '../url-grouper.js'
import { sanitizeId } from '../helpers/ids.js'
import { emitInnerRowSubgraphs } from '../helpers/layout.js'
import { RENDERING_INIT, CLASS_DEFS } from '../helpers/constants.js'
import { renderingRouteLabel, groupSubgraphId, sectionLabel } from './labels.js'

// buildNestedSubgraphLines는 children 사이 chain만 emit한다.
// 호출자(buildRenderingDiagram, buildFeFileTreeScreenDiagram)가 top-level group이 2개 이상이면
// 자체적으로 chain emit해야 한다 — outer wrapper(BROWSER/ROUTER/REACT) 안의 sibling top-level은
// outer wrapper도 outer wrapper 안 sibling 자동 가로배치를 못 함 (mermaid v11 dagre).
export function emitTopLevelSiblingChain(groups: NestedGroup[], indent: string): string | undefined {
  if (groups.length < 2) return undefined
  const ids: string[] = []
  for (const g of groups) {
    const segs = g.groupKey.split('/').filter(Boolean)
    if (segs.length === 0) continue
    // FE 표준 v1.1 (R-T1.2 amendment): 평탄화된 leaf 자식은 subgraph 없이 route node로 emit됨.
    // chain 참조도 route node ID 사용해야 phantom subgraph 노드 생성 안 됨.
    const leafSeg = segs[segs.length - 1]!
    const isDyn = /^\[.+\]$/.test(leafSeg) || leafSeg.startsWith(':')
    const isGrp = /^\(.+\)$/.test(leafSeg)
    if (g.children.length === 0 && g.routes.length === 1 && !isDyn && !isGrp) {
      ids.push(sanitizeId(g.routes[0]!.id))
    } else {
      ids.push(groupSubgraphId(g.groupKey))
    }
  }
  if (ids.length < 2) return undefined
  return `${indent}${ids.join(' ~~~ ')}`
}

// Emit nested Mermaid subgraphs from NestedGroup[]. Used by buildRenderingDiagram and buildCombinedDiagram.
// FE 표준 v1.1 (R-T1.2 amendment, 2026-05-23): mermaid v11은 nested subgraph 내부 자식들의 LR direction을
// 보장하지 못한다(webview 실측 입증). top-level 형제 X축 보장은 outer wrapper 안 chain emit으로 처리하고,
// nested 자식은 Y축 stack을 기본 표준으로 한다. 본 함수의 `~~~` chain emit은 top-level X축 보장용이며,
// nested level에서 chain이 X축으로 작동하는 케이스가 있어도 표준 약속에 포함하지 않는다 (보너스 효과).
export function buildNestedSubgraphLines(groups: NestedGroup[], indent: string, parentGroupKey?: string): string[] {
  const lines: string[] = []
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) lines.push(renderingRouteLabel(r, indent))
      if (group.children.length > 0) lines.push(...buildNestedSubgraphLines(group.children, indent, parentGroupKey))
    } else if (
      group.children.length === 0 &&
      group.routes.length === 1 &&
      !/^\[.+\]$/.test(leafSeg) &&
      !leafSeg.startsWith(':') &&
      !/^\(.+\)$/.test(leafSeg)
    ) {
      // FE 표준 v1.1 (R-T1.2 amendment): 단일 route + 자식 0개 + dynamic/group route 아닌 leaf는 wrapper 중복.
      // route node만 부모 indent로 emit하여 의미 없는 leaf subgraph 제거. R-T1.3·R-T1.4는 보존.
      // parentGroupKey 있으면 stripPrefix 적용(부모 라벨과 prefix 중복 회피). root level은 full path 유지.
      lines.push(renderingRouteLabel(group.routes[0]!, indent, parentGroupKey))
    } else {
      const sgId = groupSubgraphId(group.groupKey)
      const label = sectionLabel(leafSeg)
      lines.push(`${indent}subgraph ${sgId}["${label}"]`)
      lines.push(...emitInnerRowSubgraphs(i2, sgId, group.routes.length,
        (i, ind) => renderingRouteLabel(group.routes[i]!, ind, group.groupKey)))
      if (group.children.length > 0) {
        lines.push(...buildNestedSubgraphLines(group.children, i2, group.groupKey))
      }
      lines.push(`${indent}end`)
      // FE 표준 v1.1: children >= 2면 형제 ID들을 ~~~ chain으로 연결 (top-level은 X축 보장, nested는 보너스).
      // chain은 cluster 끝(end) 직후, 즉 조부모 indent에 위치 — 부모 cluster 안에 두면 mermaid v11이 무시.
      // 평탄화된 leaf 자식(R-T1.2 v1.1)은 subgraph 없이 route node로 emit되므로 chain ID도 route node ID 사용.
      if (group.children.length >= 2) {
        const childIds = group.children.map(c => {
          const cLeaf = c.groupKey.split('/').filter(Boolean).pop() ?? ''
          const isDyn = /^\[.+\]$/.test(cLeaf) || cLeaf.startsWith(':')
          const isGrp = /^\(.+\)$/.test(cLeaf)
          if (c.children.length === 0 && c.routes.length === 1 && !isDyn && !isGrp) {
            return sanitizeId(c.routes[0]!.id)
          }
          return groupSubgraphId(c.groupKey)
        }).join(' ~~~ ')
        lines.push(`${indent}${childIds}`)
      }
    }
  }
  return lines
}

// Row 다이어그램(chunked 경로): NestedGroup tree를 그대로 보존하여 nested subgraph emit.
// 이전: collectNestedRoutes로 평면화 → 재귀 그룹핑 결과 폐기 → /api 안에 100+ 형제 평면 배치 → mermaid 세로 압축
// buildNestedSubgraphLines 재사용 → /api → /v1 → /admin → /users 식 depth 보존 → leaf subgraph 노드 수 자연 감소
export function buildRouteRowDiagram(groups: NestedGroup[]): string {
  // FE chunked 경로도 graph LR (표준 1 형제 X축 배치, 단일 chunk 안에 여러 형제 가능).
  const lines = [RENDERING_INIT, 'graph LR', CLASS_DEFS]
  lines.push(...buildNestedSubgraphLines(groups, '  '))
  return lines.join('\n')
}
