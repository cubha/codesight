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
  // 'infra'   — 인프라 boundary compound (Vercel/Node.js/Next.js/React)
  // 'backend' — 백엔드 서비스 노드 (LLM에서 추출된 IRGraphMetadata.backends)
  // 'db'      — 데이터베이스 노드 (PostgreSQL/MySQL/Mongo)
  kind: 'route' | 'component' | 'table' | 'group' | 'infra' | 'backend' | 'db'
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
  // backend/db 보조 메타.
  framework?: string
  dbType?: string
}

export interface CyEdgeData {
  id: string
  source: string
  target: string
  // 'fk' — Table.columns[].references에서 derive된 합성 FK edge.
  edgeKind: 'renders' | 'imports' | 'queries' | 'calls' | 'fe-be-call' | 'fk'
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
  // mermaid renderer가 IR에서 derive하는 정보(infra boundary / backends / FK edges)도 함께 emit.
  // 기본 true — PoC v1.2.0-poc.2부터 default ON (mermaid 동등 정보량 목표).
  includeMetadata?: boolean
  // FK edges (TableNode.columns[].references → table-table edge) emit 여부. 기본 true.
  includeFkEdges?: boolean
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

// IRGraphMetadata 기반 infra boundary compound (Vercel→Node.js→Next.js→React 등).
// mermaid renderer의 metadataToInfra() 분기와 동일 의미 — derived information 동등성 확보.
// 반환값: innermost group id (Tab1에서 routes의 최외곽 parent로 사용). 없으면 undefined.
function buildInfraCompound(graph: IRGraph, groupNodes: Map<string, CyNode>): string | undefined {
  const meta = graph.metadata
  if (meta === undefined) return undefined
  const fw = meta.framework.toLowerCase()
  const hasNextjs = fw === 'nextjs-app-router' || fw === 'nextjs-pages' || fw.startsWith('next')
  const hasVite = fw === 'vite-react' || fw.includes('vite')
  const hasExpo = fw === 'expo' || fw.includes('expo') || meta.deployTarget === 'mobile'

  // 모든 route가 CSR인지 — mermaid renderer의 allCSR 분기에 맞추기 위해.
  const routes = graph.nodes.filter(isRouteNode)
  const allCSR = routes.length > 0 && routes.every(r => r.renderingMode === 'CSR')

  let chain: Array<[string, string]> | undefined
  if (hasNextjs && !allCSR) {
    chain = [
      ['INFRA', '☁ VERCEL · Edge Network'],
      ['RUNTIME', '⚙ Node.js · Server Runtime'],
      ['FRAMEWORK', '▲ Next.js · App Router'],
      ['REACT', '⚛ React · SSR Engine'],
    ]
  } else if (hasNextjs && allCSR) {
    chain = [
      ['BROWSER', '🌐 Browser · Client-Side App'],
      ['FRAMEWORK', '▲ Next.js · App Router'],
      ['REACT', '⚛ React · CSR Engine'],
    ]
  } else if (hasVite) {
    chain = [
      ['BROWSER', '🌐 Browser · Client-Side App'],
      ['BUNDLER', '⚡ Vite · Dev/Build'],
      ['REACT', '⚛ React · CSR Engine'],
    ]
  } else if (hasExpo) {
    chain = [
      ['MOBILE', '📱 Mobile · iOS / Android'],
      ['RN', '⚛ React Native · Expo'],
    ]
  } else {
    // backend-only framework (Spring/Django/FastAPI/Flask) — infra boundary 없음.
    return undefined
  }

  let prevId: string | undefined
  for (const [id, label] of chain) {
    const data: CyNodeData = { id, label, kind: 'infra' }
    if (prevId !== undefined) data.parent = prevId
    groupNodes.set(id, { data })
    prevId = id
  }
  return prevId
}

// IRGraphMetadata.backends → backend service + db + REST edge.
// LLM 분석으로 추출된 monorepo backend metadata 표현.
function buildBackendServices(
  graph: IRGraph,
  groupNodes: Map<string, CyNode>,
  nodes: CyNode[],
  edges: CyEdge[],
  aliveNodeIds: Set<string>,
  frontendRef: string | undefined,
): void {
  const backends = graph.metadata?.backends ?? []
  for (let i = 0; i < backends.length; i++) {
    const be = backends[i]
    if (be === undefined) continue
    const beId = `BACKEND_${i}`
    const dbId = `DB_${i}`
    const dbLabel = be.dbType === 'postgresql' ? '🐘 PostgreSQL' :
                    be.dbType === 'mysql' ? '🐬 MySQL' :
                    be.dbType === 'mongodb' ? '🍃 MongoDB' : '🗄 Database'

    const beData: CyNodeData = {
      id: beId,
      label: `⚙ ${be.name} · ${be.framework}`,
      kind: 'backend',
      framework: be.framework,
    }
    groupNodes.set(beId, { data: beData })

    const visibleMods = (be.modules ?? []).slice(0, 8)
    for (const mod of visibleMods) {
      const modId = `${sanitizeId(mod)}_be${i}`
      nodes.push({ data: { id: modId, label: mod, kind: 'component', parent: beId, runtime: 'server' } })
      aliveNodeIds.add(modId)
    }

    const dbData: CyNodeData = { id: dbId, label: dbLabel, kind: 'db', parent: beId }
    if (be.dbType !== undefined) dbData.dbType = be.dbType
    nodes.push({ data: dbData })
    aliveNodeIds.add(dbId)

    // modules → db
    for (const mod of visibleMods) {
      const modId = `${sanitizeId(mod)}_be${i}`
      edges.push({
        data: {
          id: `e_be${i}_${sanitizeId(mod)}_db`,
          source: modId, target: dbId,
          edgeKind: 'queries',
          confidence: 'inferred',
          inferenceChain: ['llm-backend-detection'],
          file: 'metadata',
          line: 0,
        },
      })
    }

    // frontend → backend (REST)
    if (frontendRef !== undefined) {
      edges.push({
        data: {
          id: `e_rest_${i}`,
          source: frontendRef, target: beId,
          edgeKind: 'fe-be-call',
          confidence: 'inferred',
          inferenceChain: ['llm-backend-detection'],
          file: 'metadata',
          line: 0,
        },
      })
    }
  }
}

// TableNode.columns[].references → table-table FK edges (합성).
// mermaid renderer가 ERD에서 그리는 column-level relationship과 동등 정보량.
function buildFkEdges(
  graph: IRGraph,
  edges: CyEdge[],
  aliveNodeIds: Set<string>,
): void {
  // table name → cy id 맵 (name으로 찾기 위해)
  const nameToCyId = new Map<string, string>()
  for (const n of graph.nodes) {
    if (isTableNode(n)) {
      const cyId = nodeIdToCyId(n.id)
      if (aliveNodeIds.has(cyId)) nameToCyId.set(n.name, cyId)
    }
  }
  for (const t of graph.nodes) {
    if (!isTableNode(t)) continue
    const fromId = nodeIdToCyId(t.id)
    if (!aliveNodeIds.has(fromId)) continue
    for (const col of t.columns) {
      if (col.references === undefined) continue
      const toId = nameToCyId.get(col.references.table)
      if (toId === undefined) continue
      edges.push({
        data: {
          id: `e_fk_${fromId}_${sanitizeId(col.name)}_${toId}`,
          source: fromId, target: toId,
          edgeKind: 'fk',
          confidence: 'verified',
          file: t.provenance.file,
          line: t.provenance.line,
        },
      })
    }
  }
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

  // ── derived information (mermaid 동등성) ──────────────────────────────
  // includeMetadata=true 시 infra compound + backends + REST edge를 함께 emit.
  let innermostInfra: string | undefined
  if (opts.includeMetadata === true) {
    innermostInfra = buildInfraCompound(graph, groupNodes)
    if (innermostInfra !== undefined) {
      // route-prefix grouping의 최상위 group들을 innermost 안으로 nest.
      // 또는 route 노드 자체가 parent 없으면 innermost가 parent.
      for (const g of groupNodes.values()) {
        if (g.data.kind === 'group' && g.data.parent === undefined) {
          g.data.parent = innermostInfra
        }
      }
      for (const n of nodes) {
        if (n.data.kind === 'route' && n.data.parent === undefined) {
          n.data.parent = innermostInfra
        }
      }
    }
  }

  // edge: 양 끝 노드가 모두 살아있을 때만 emit (filter로 제외된 노드는 dangling edge 방지).
  const edges: CyEdge[] = []
  for (const e of graph.edges) {
    const cy = mapEdge(e)
    if (aliveNodeIds.has(cy.data.source) && aliveNodeIds.has(cy.data.target)) {
      edges.push(cy)
    }
  }

  // backends (LLM이 추출한 monorepo backend metadata) — frontend가 있으면 REST edge도.
  if (opts.includeMetadata === true) {
    buildBackendServices(graph, groupNodes, nodes, edges, aliveNodeIds, innermostInfra)
  }

  // FK column-level edges (Tab3 ERD).
  if (opts.includeFkEdges === true) {
    buildFkEdges(graph, edges, aliveNodeIds)
  }

  // group 노드를 nodes 배열 앞에 prepend (cytoscape compound 요구 — parent가 children 보다 먼저).
  // groupNodes는 backend service node도 포함 (kind='backend'는 compound parent 역할).
  const groupNodesArr = Array.from(groupNodes.values())
  const allNodes = [...groupNodesArr, ...nodes]

  return { nodes: allNodes, edges }
}

// 편의 헬퍼 — Tab1 (route hierarchy) / Tab2 (component tree) / Tab3 (table ERD) 별 mapper.
// 기본 default ON: includeMetadata (infra/backends) for Tab1, includeFkEdges for Tab3.
export function buildTab1Elements(graph: IRGraph, maxDepth?: number): CytoscapeElements {
  const opts: MapperOptions = {
    filter: (n) => isRouteNode(n),
    group: 'route-prefix',
    includeMetadata: true,
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
    includeFkEdges: true,
  })
}
