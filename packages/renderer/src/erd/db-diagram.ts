import type { IRGraph, IRNode } from '@codebase-viz/types'
import { isTableNode, isRouteNode, isComponentNode } from '@codebase-viz/types'
import { sanitizeId } from '../helpers/ids.js'
import { DB_DIAGRAM_INIT } from '../helpers/constants.js'
import { metadataToInfra } from '../fe/infra.js'
import { buildFeApiCallDiagram } from '../fe/tab3-api.js'
import { isBeRepository } from '../be/leaf.js'

// - group route `(marketing)` · 동적 route `[slug]` 등 URL≠파일경로 케이스에서 가치 큼
// - LLM enabled에서도 ComponentNode.filePath 정적 기반이라 동일 동작
export function getSourceLabel(node: IRNode): string | undefined {
  if (isRouteNode(node)) {
    const clean = node.path.replace(/\//g, '_').replace(/^_/, '') || 'root'
    return sanitizeId(clean)
  }
  if (isComponentNode(node)) return sanitizeId(node.name)
  return undefined
}

export function buildDbScreenDiagram(graph: IRGraph): string {
  const tableNodes = graph.nodes.filter(isTableNode)

  // Tab3 분기
  //   1. BE 어댑터 → 현행 ER + Repository 합성 (이 함수 하단 'adapterCategory==='BE'' 블록 유지)
  //   2. react-router FE + tables===0 → 신규 FE API 호출 다이어그램 (axios/fetch/react-query)
  //   3. 그 외(Next.js+Supabase·Vite·Nuxt·SvelteKit·Vue SPA 등 FE+tables>0) → 현행 ER 다이어그램 (회귀 0)
  if (graph.metadata?.adapterCategory !== 'BE' && tableNodes.length === 0) {
    const infra = metadataToInfra(graph.metadata)
    if (infra.hasReactRouter) {
      return buildFeApiCallDiagram(graph)
    }
  }

  const queriesEdges = graph.edges.filter(e => e.kind === 'queries')

  // Deduplicate query sources (routes + components that actually query tables)
  const sourcesMap = new Map<string, string>()
  for (const edge of queriesEdges) {
    if (sourcesMap.has(edge.from)) continue
    const src = graph.nodes.find(n => n.id === edge.from)
    if (src === undefined || isTableNode(src)) continue
    const label = getSourceLabel(src)
    if (label !== undefined) sourcesMap.set(edge.from, label)
  }

  const lines: string[] = [DB_DIAGRAM_INIT, 'erDiagram']

  for (const t of tableNodes) {
    const file = t.provenance.file
    if (file !== undefined && file !== '') {
      lines.push(`%% table:${sanitizeId(t.name)} path:${file}`)
    }
  }

  for (const t of tableNodes) {
    lines.push(`  ${sanitizeId(t.name)} {`)
    for (const col of t.columns) {
      const pkFlag = col.isPrimaryKey === true ? ' PK' : ''
      const fkFlag = col.references !== undefined ? ' FK' : ''
      lines.push(`    ${sanitizeId(col.type)} ${sanitizeId(col.name)}${pkFlag}${fkFlag}`)
    }
    lines.push('  }')
  }

  // BE-specific: include Repository/Dao/Mapper components even without queries edges.
  // Ensures Tab3 tracks the same Repository nodes as Tab2 (cross-tab traceability).
  if (graph.metadata?.adapterCategory === 'BE') {
    for (const node of graph.nodes) {
      if (!isComponentNode(node)) continue
      if (!isBeRepository(node.name)) continue
      if (!sourcesMap.has(node.id)) sourcesMap.set(node.id, sanitizeId(node.name))
    }
  }

  // Source (route/component/action) proxy entities
  for (const label of new Set(sourcesMap.values())) {
    lines.push(`  ${label} {`)
    lines.push(`    string name`)
    lines.push('  }')
  }

  // Table ↔ Table FK relationships (from ColumnDef.references)
  const tableNameSet = new Set(tableNodes.map(t => sanitizeId(t.name)))
  for (const t of tableNodes) {
    for (const col of t.columns) {
      if (col.references === undefined) continue
      const target = sanitizeId(col.references.table)
      if (tableNameSet.has(target)) {
        lines.push(`  ${sanitizeId(t.name)} }o--|| ${target} : "${col.name}"`)
      }
    }
  }

  // Source → Table queries edges
  for (const edge of queriesEdges) {
    const srcLabel = sourcesMap.get(edge.from)
    const tblNode = graph.nodes.find(n => n.id === edge.to)
    if (srcLabel === undefined || tblNode === undefined || !isTableNode(tblNode)) continue
    lines.push(`  ${srcLabel} }|--|| ${sanitizeId(tblNode.name)} : "queries"`)
  }

  return lines.join('\n')
}
