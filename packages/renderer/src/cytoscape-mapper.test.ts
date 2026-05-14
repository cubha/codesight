import { describe, it, expect } from 'vitest'
import {
  createIRGraph,
  createRouteNode,
  createComponentNode,
  createTableNode,
  createEdge,
  makeNodeId,
  makeEdgeId,
  type IRGraph,
  type Provenance,
} from '@codebase-viz/types'
import {
  buildCytoscapeElements,
  buildTab1Elements,
  buildTab2Elements,
  buildTab3Elements,
} from './cytoscape-mapper.js'

const PROV: Provenance = {
  file: 'src/app/page.tsx',
  line: 1,
  adapter: 'test',
  analyzerVersion: 'test@0.1',
}

function makeRoute(p: string, file = `src/app${p}/page.tsx`) {
  return createRouteNode({
    id: makeNodeId('route', file, 'page'),
    path: p,
    filePath: file,
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'SSR',
    confidence: 'verified',
    provenance: { ...PROV, file },
  })
}

function makeComponent(name: string, file: string) {
  return createComponentNode({
    id: makeNodeId('component', file, name),
    name,
    filePath: file,
    runtime: 'server',
    confidence: 'verified',
    provenance: { ...PROV, file },
  })
}

function makeTable(name: string) {
  return createTableNode({
    id: makeNodeId('table', 'supabase', name),
    name,
    columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true }],
    confidence: 'verified',
    provenance: { ...PROV, file: 'supabase/schema.sql' },
  })
}

function makeGraph(): IRGraph {
  const r1 = makeRoute('/api/v1/admin/users')
  const r2 = makeRoute('/api/v1/admin/users/list')
  const r3 = makeRoute('/api/v1/billing/invoices')
  const c1 = makeComponent('UserList', 'src/components/admin/UserList.tsx')
  const c2 = makeComponent('UserCard', 'src/components/admin/UserCard.tsx')
  const t1 = makeTable('users')
  const t2 = makeTable('invoices')
  const e1 = createEdge({
    id: makeEdgeId('renders', r1.id, c1.id),
    from: r1.id,
    to: c1.id,
    kind: 'renders',
    confidence: 'verified',
    provenance: PROV,
  })
  const e2 = createEdge({
    id: makeEdgeId('imports', c1.id, c2.id),
    from: c1.id,
    to: c2.id,
    kind: 'imports',
    importDepth: 1,
    confidence: 'inferred',
    inferenceChain: ['import-statement'],
    provenance: PROV,
  })
  const e3 = createEdge({
    id: makeEdgeId('queries', c1.id, t1.id),
    from: c1.id,
    to: t1.id,
    kind: 'queries',
    confidence: 'verified',
    provenance: PROV,
  })
  return createIRGraph({
    analyzerVersion: 'test@0.1',
    repoRoot: '/x',
    nodes: [r1, r2, r3, c1, c2, t1, t2],
    edges: [e1, e2, e3],
  })
}

describe('cytoscape-mapper', () => {
  it('보존: 정보량 — IR.nodes 수 === cy.nodes 수 (그룹 별도 카운트)', () => {
    const g = makeGraph()
    const els = buildCytoscapeElements(g)
    const nonGroup = els.nodes.filter(n => n.data.kind !== 'group')
    expect(nonGroup).toHaveLength(g.nodes.length)
    expect(els.edges).toHaveLength(g.edges.length)
  })

  it('보존: provenance/confidence — data 속성에 1:1 전달', () => {
    const g = makeGraph()
    const els = buildCytoscapeElements(g)
    // route 노드 1개를 골라 확인.
    const cyR = els.nodes.find(n => n.data.kind === 'route')
    expect(cyR?.data.file).toBeDefined()
    expect(cyR?.data.line).toBe(1)
    expect(cyR?.data.confidence).toBe('verified')

    // inferred edge의 inferenceChain 보존 확인.
    const inferredEdge = els.edges.find(e => e.data.confidence === 'inferred')
    expect(inferredEdge?.data.inferenceChain).toEqual(['import-statement'])
    expect(inferredEdge?.data.importDepth).toBe(1)
  })

  it('Tab1: route-prefix grouping — /api/v1/admin/users 가 nested group을 만든다', () => {
    const g = makeGraph()
    const els = buildTab1Elements(g)
    // route 노드만 살아남고 component/table은 제외됨.
    const routeNodes = els.nodes.filter(n => n.data.kind === 'route')
    expect(routeNodes).toHaveLength(3)

    // group 노드: /api, /api/v1, /api/v1/admin, /api/v1/admin/users, /api/v1/billing, /api/v1/billing/invoices?
    // 단, 마지막 segment(route 자신)는 group이 아님 → /api/v1/admin/users/list 는 [api, v1, admin, users] 4개 group
    // /api/v1/admin/users 는 [api, v1, admin] 3개 group → 'users' 자체는 route
    // 그러나 list 라우트의 'users' group은 admin/users route id와 충돌하지 않음 (g_ prefix 다름).
    const groups = els.nodes.filter(n => n.data.kind === 'group')
    const labels = groups.map(g => g.data.label).sort()
    expect(labels).toContain('/api')
    expect(labels).toContain('/api/v1')
    expect(labels).toContain('/api/v1/admin')
    expect(labels).toContain('/api/v1/billing')

    // 각 route 노드는 parent를 가진다.
    for (const r of routeNodes) {
      expect(r.data.parent).toBeDefined()
      expect(r.data.parent).toMatch(/^g_/)
    }
  })

  it('Tab2: file-dir grouping — components가 dirname compound로 묶인다', () => {
    const g = makeGraph()
    const els = buildTab2Elements(g)
    const compNodes = els.nodes.filter(n => n.data.kind === 'component')
    expect(compNodes).toHaveLength(2)
    // 두 component 모두 src/components/admin/ 에 있음 → 동일 parent.
    expect(compNodes[0]?.data.parent).toBe(compNodes[1]?.data.parent)
  })

  it('Tab3: tables 만 살아남고 group은 없음', () => {
    const g = makeGraph()
    const els = buildTab3Elements(g)
    expect(els.nodes.every(n => n.data.kind === 'table')).toBe(true)
    expect(els.nodes).toHaveLength(2)
  })

  it('dangling edge 방지 — filter로 제외된 노드의 edge는 emit 안 됨', () => {
    const g = makeGraph()
    // Tab1 → route만, component/table 노드 제외 → renders/imports/queries 전부 dangling
    const els = buildTab1Elements(g)
    expect(els.edges).toHaveLength(0)
  })

  it('cytoscape id sanitize — IRGraph NodeId의 콜론/슬래시 제거', () => {
    const g = makeGraph()
    const els = buildCytoscapeElements(g)
    for (const n of els.nodes) {
      expect(n.data.id).toMatch(/^[a-zA-Z0-9_]+$/)
    }
    for (const e of els.edges) {
      expect(e.data.id).toMatch(/^[a-zA-Z0-9_]+$/)
      expect(e.data.source).toMatch(/^[a-zA-Z0-9_]+$/)
      expect(e.data.target).toMatch(/^[a-zA-Z0-9_]+$/)
    }
  })

  it('cytoscape compound 순서 — group이 children보다 먼저 등장', () => {
    const g = makeGraph()
    const els = buildTab1Elements(g)
    // 모든 'group' 노드의 index가 그 children보다 작아야 함.
    for (let i = 0; i < els.nodes.length; i++) {
      const node = els.nodes[i]
      if (node === undefined) continue
      const parent = node.data.parent
      if (parent === undefined) continue
      const parentIdx = els.nodes.findIndex(n => n.data.id === parent)
      expect(parentIdx).toBeLessThan(i)
    }
  })

  // ─── v1.2.0-poc.2 derived information 확장 ─────────────────────────────
  it('Tab1: Next.js metadata가 있으면 Vercel→Node→Next→React infra compound 생성', () => {
    const g = makeGraph()
    g.metadata = {
      framework: 'nextjs-app-router',
      hasSupabase: false,
      hasPrisma: false,
      hasDexie: false,
      hasFirebase: false,
    }
    const els = buildTab1Elements(g)
    const infraIds = els.nodes.filter(n => n.data.kind === 'infra').map(n => n.data.id)
    expect(infraIds).toEqual(expect.arrayContaining(['INFRA', 'RUNTIME', 'FRAMEWORK', 'REACT']))

    // 최상위 route-prefix group의 parent가 innermost(REACT)인지.
    const routePrefixGroups = els.nodes.filter(n => n.data.kind === 'group')
    const rootRouteGroup = routePrefixGroups.find(n => n.data.label === '/api')
    expect(rootRouteGroup?.data.parent).toBe('REACT')
  })

  it('Tab1: backend-only framework(Spring)는 infra compound 없음', () => {
    const g = makeGraph()
    g.metadata = {
      framework: 'spring-boot',
      hasSupabase: false,
      hasPrisma: false,
      hasDexie: false,
      hasFirebase: false,
    }
    const els = buildTab1Elements(g)
    const infraNodes = els.nodes.filter(n => n.data.kind === 'infra')
    expect(infraNodes).toHaveLength(0)
  })

  it('Tab1: IRGraphMetadata.backends → backend compound + db + REST edge', () => {
    const g = makeGraph()
    g.metadata = {
      framework: 'nextjs-app-router',
      hasSupabase: false, hasPrisma: false, hasDexie: false, hasFirebase: false,
      backends: [{
        name: 'NestJS API',
        framework: 'nestjs',
        modules: ['Auth', 'Users', 'Orders'],
        dbType: 'postgresql',
      }],
    }
    const els = buildTab1Elements(g)
    const backendNode = els.nodes.find(n => n.data.kind === 'backend')
    expect(backendNode).toBeDefined()
    expect(backendNode?.data.framework).toBe('nestjs')

    const dbNode = els.nodes.find(n => n.data.kind === 'db')
    expect(dbNode?.data.label).toBe('🐘 PostgreSQL')
    expect(dbNode?.data.parent).toBe('BACKEND_0')

    const restEdge = els.edges.find(e => e.data.edgeKind === 'fe-be-call')
    expect(restEdge).toBeDefined()
    expect(restEdge?.data.target).toBe('BACKEND_0')
  })

  it('Tab3: FK column-level edges 합성 (TableNode.columns[].references)', () => {
    const t1 = createTableNode({
      id: makeNodeId('table', 'sb', 'orders'),
      name: 'orders',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'users', column: 'id' } },
      ],
      confidence: 'verified',
      provenance: { ...PROV, file: 'sb/schema.sql' },
    })
    const t2 = createTableNode({
      id: makeNodeId('table', 'sb', 'users'),
      name: 'users',
      columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true }],
      confidence: 'verified',
      provenance: { ...PROV, file: 'sb/schema.sql' },
    })
    const g = createIRGraph({
      analyzerVersion: 'test@0.1',
      repoRoot: '/x',
      nodes: [t1, t2],
      edges: [],
    })
    const els = buildTab3Elements(g)
    const fkEdges = els.edges.filter(e => e.data.edgeKind === 'fk')
    expect(fkEdges).toHaveLength(1)
    expect(fkEdges[0]?.data.confidence).toBe('verified')
  })
})
