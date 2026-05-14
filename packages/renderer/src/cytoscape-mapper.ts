// IRGraph → Cytoscape elements 변환기 (Task 1 PoC).
// .codesight/*.mmd 정적 출력은 mermaid-renderer.ts 유지 (dual rendering).
// 본 mapper는 webview용 cytoscape adapter 전용 — IR 본질(provenance/confidence) 1:1 보존.

import {
  isRouteNode,
  isComponentNode,
  isTableNode,
  type IRGraph,
  type IRNode,
  type IREdge,
} from '@codebase-viz/types'

// Cytoscape element shape — cy plugin 외부 타입을 안 끌어오기 위해 최소 정의.
// 본질 보존: provenance / confidence는 data 속성으로 그대로 전달.
export interface CyNodeData {
  id: string
  label?: string
  kind: 'route' | 'component' | 'table' | 'group'
  parent?: string
  file?: string
  line?: number
  confidence?: 'verified' | 'inferred' | 'manual'
  inferenceChain?: string[]
  routeFileKind?: string
  renderingMode?: string
  httpMethod?: string
  runtime?: string
  columnsCount?: number
}

export interface CyEdgeData {
  id: string
  source: string
  target: string
  edgeKind: 'renders' | 'imports' | 'queries' | 'calls' | 'fe-be-call'
  file?: string
  line?: number
  confidence?: 'verified' | 'inferred' | 'manual'
  inferenceChain?: string[]
  importDepth?: number
}

export interface CyNode {
  data: CyNodeData
}

export interface CyEdge {
  data: CyEdgeData
}

export interface CytoscapeElements {
  nodes: CyNode[]
  edges: CyEdge[]
}

export interface MapperOptions {
  filter?: (node: IRNode) => boolean
  // 'route-prefix' : route.path를 / 단위로 쪼개 compound group 생성 (Tab1)
  // 'file-dir'     : node.filePath의 dirname을 따라 compound group 생성 (Tab2/Tab3)
  // 'none'         : group 없음 (flat)
  group?: 'route-prefix' | 'file-dir' | 'none'
  maxDepth?: number
}

const DEFAULT_MAX_DEPTH = 8

// cytoscape는 id에 ASCII 영숫자/언더스코어/하이픈 외 문자를 dot syntax로 오해할 수 있다.
// Day 0 spike에서 검증된 sanitize 규칙: 영숫자 외 → '_'.
function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '')
}

function makeGroupId(prefix: string): string {
  return 'g_' + sanitizeId(prefix)
}

function nodeIdToCyId(rawId: string): string {
  // IRGraph NodeId는 "kind:path:symbol" 형식이라 sanitize 필요.
  return 'n_' + sanitizeId(rawId)
}

function edgeIdToCyId(rawId: string): string {
  return 'e_' + sanitizeId(rawId)
}

// 공통 data 속성 — provenance / confidence 보존.
function commonNodeData(node: IRNode): Partial<CyNodeData> {
  const data: Partial<CyNodeData> = {
    file: node.provenance.file,
    line: node.provenance.line,
    confidence: node.confidence,
  }
  if (node.confidence === 'inferred') {
    data.inferenceChain = node.inferenceChain
  }
  return data
}

// route.path 의 prefix 트리를 따라 compound group을 추가한다.
// 반환값: 해당 route 노드의 parent group id (없으면 undefined).
function ensureRoutePrefixGroups(
  routePath: string,
  groupNodes: Map<string, CyNode>,
  maxDepth: number,
): string | undefined {
  const segments = routePath.split('/').filter(Boolean)
  if (segments.length === 0) return undefined

  // 마지막 segment는 route 자신, 그 이전 segment들을 group으로 변환.
  const groupSegments = segments.slice(0, -1)
  if (groupSegments.length === 0) return undefined

  // depth 제한 — group nesting을 너무 깊게 만들지 않음.
  const cap = Math.min(groupSegments.length, maxDepth)
  let parent: string | undefined
  let acc = ''
  for (let i = 0; i < cap; i++) {
    const seg = groupSegments[i]
    if (seg === undefined) break
    acc += '/' + seg
    const id = makeGroupId(acc)
    if (!groupNodes.has(id)) {
      const data: CyNodeData = {
        id,
        label: acc,
        kind: 'group',
      }
      if (parent !== undefined) data.parent = parent
      groupNodes.set(id, { data })
    }
    parent = id
  }
  return parent
}

// filePath 의 dirname을 따라 compound group을 추가한다.
function ensureFileDirGroups(
  filePath: string,
  groupNodes: Map<string, CyNode>,
  maxDepth: number,
): string | undefined {
  const segments = filePath.split('/').filter(Boolean)
  if (segments.length <= 1) return undefined

  // 마지막 segment(파일명) 제외.
  const dirSegments = segments.slice(0, -1)
  const cap = Math.min(dirSegments.length, maxDepth)
  let parent: string | undefined
  let acc = ''
  for (let i = 0; i < cap; i++) {
    const seg = dirSegments[i]
    if (seg === undefined) break
    acc += '/' + seg
    const id = makeGroupId(acc)
    if (!groupNodes.has(id)) {
      const data: CyNodeData = {
        id,
        label: acc,
        kind: 'group',
      }
      if (parent !== undefined) data.parent = parent
      groupNodes.set(id, { data })
    }
    parent = id
  }
  return parent
}

function mapRouteNode(
  node: Extract<IRNode, { kind: 'route' }>,
  parent: string | undefined,
): CyNode {
  const data: CyNodeData = {
    id: nodeIdToCyId(node.id),
    label: node.path,
    kind: 'route',
    routeFileKind: node.routeFileKind,
    renderingMode: node.renderingMode,
    ...commonNodeData(node),
  }
  if (node.httpMethod !== undefined) data.httpMethod = node.httpMethod
  if (parent !== undefined) data.parent = parent
  return { data }
}

function mapComponentNode(
  node: Extract<IRNode, { kind: 'component' }>,
  parent: string | undefined,
): CyNode {
  const data: CyNodeData = {
    id: nodeIdToCyId(node.id),
    label: node.name,
    kind: 'component',
    runtime: node.runtime,
    ...commonNodeData(node),
  }
  if (parent !== undefined) data.parent = parent
  return { data }
}

function mapTableNode(
  node: Extract<IRNode, { kind: 'table' }>,
  parent: string | undefined,
): CyNode {
  const data: CyNodeData = {
    id: nodeIdToCyId(node.id),
    label: node.name,
    kind: 'table',
    columnsCount: node.columns.length,
    ...commonNodeData(node),
  }
  if (parent !== undefined) data.parent = parent
  return { data }
}

function mapEdge(edge: IREdge): CyEdge {
  const data: CyEdgeData = {
    id: edgeIdToCyId(edge.id),
    source: nodeIdToCyId(edge.from),
    target: nodeIdToCyId(edge.to),
    edgeKind: edge.kind,
    confidence: edge.confidence,
    file: edge.provenance.file,
    line: edge.provenance.line,
  }
  if (edge.confidence === 'inferred') data.inferenceChain = edge.inferenceChain
  if (edge.importDepth !== undefined) data.importDepth = edge.importDepth
  return { data }
}

export function buildCytoscapeElements(
  graph: IRGraph,
  opts: MapperOptions = {},
): CytoscapeElements {
  const filter = opts.filter ?? (() => true)
  const groupMode = opts.group ?? 'none'
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH

  const groupNodes = new Map<string, CyNode>()
  const nodes: CyNode[] = []

  // 살아남은 노드 id를 추적해 edge 필터링에 사용.
  const aliveNodeIds = new Set<string>()

  for (const node of graph.nodes) {
    if (!filter(node)) continue

    let parent: string | undefined
    if (groupMode === 'route-prefix' && isRouteNode(node)) {
      parent = ensureRoutePrefixGroups(node.path, groupNodes, maxDepth)
    } else if (groupMode === 'file-dir') {
      parent = ensureFileDirGroups(node.provenance.file, groupNodes, maxDepth)
    }

    let cyNode: CyNode
    if (isRouteNode(node)) {
      cyNode = mapRouteNode(node, parent)
    } else if (isComponentNode(node)) {
      cyNode = mapComponentNode(node, parent)
    } else if (isTableNode(node)) {
      cyNode = mapTableNode(node, parent)
    } else {
      continue
    }
    nodes.push(cyNode)
    aliveNodeIds.add(cyNode.data.id)
  }

  // group 노드를 nodes 배열 앞에 prepend (cytoscape compound 요구 — parent가 children 보다 먼저).
  const groupNodesArr = Array.from(groupNodes.values())
  const allNodes = [...groupNodesArr, ...nodes]

  // edge는 양 끝 노드가 모두 살아있을 때만 emit (filter로 제외된 노드는 dangling edge 방지).
  const edges: CyEdge[] = []
  for (const e of graph.edges) {
    const cy = mapEdge(e)
    if (aliveNodeIds.has(cy.data.source) && aliveNodeIds.has(cy.data.target)) {
      edges.push(cy)
    }
  }

  return { nodes: allNodes, edges }
}

// 편의 헬퍼 — Tab1 (route hierarchy) / Tab2 (component tree) / Tab3 (table ERD) 별 mapper.
export function buildTab1Elements(graph: IRGraph, maxDepth?: number): CytoscapeElements {
  const opts: MapperOptions = {
    filter: (n) => isRouteNode(n),
    group: 'route-prefix',
  }
  if (maxDepth !== undefined) opts.maxDepth = maxDepth
  return buildCytoscapeElements(graph, opts)
}

export function buildTab2Elements(graph: IRGraph, maxDepth?: number): CytoscapeElements {
  const opts: MapperOptions = {
    filter: (n) => isComponentNode(n) || isRouteNode(n),
    group: 'file-dir',
  }
  if (maxDepth !== undefined) opts.maxDepth = maxDepth
  return buildCytoscapeElements(graph, opts)
}

export function buildTab3Elements(graph: IRGraph): CytoscapeElements {
  return buildCytoscapeElements(graph, {
    filter: (n) => isTableNode(n),
    group: 'none',
  })
}
