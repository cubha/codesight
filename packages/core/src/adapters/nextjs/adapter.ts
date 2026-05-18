import * as path from 'node:path'
import {
  createIRGraph,
  createEdge,
  makeEdgeId,
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  type IREdge,
  type RouteNode,
  type ComponentNode,
  type NodeId,
} from '@codebase-viz/types'
import { parseRoutes } from './parsers/route-parser.js'
import { parseComponents } from './parsers/component-parser.js'
import { parseTables } from './parsers/db-parser.js'
import { mapScreenToTable, mapServerFilesToTable } from './mapper/screen-mapper.js'
import { detectTsOrmTables } from '../../db/index.js'

function buildRendersEdges(
  routeNodes: RouteNode[],
  componentNodes: ComponentNode[],
  importEdges: IREdge[],
  analyzerVersion: string,
): IREdge[] {
  const rendersEdges: IREdge[] = []

  const fileToCompId = new Map<string, NodeId>()
  for (const c of componentNodes) fileToCompId.set(c.filePath, c.id)

  const compToImports = new Map<NodeId, NodeId[]>()
  for (const e of importEdges) {
    if (e.kind !== 'imports') continue
    const list = compToImports.get(e.from) ?? []
    list.push(e.to)
    compToImports.set(e.from, list)
  }

  for (const route of routeNodes) {
    if (route.routeFileKind !== 'page') continue
    const pageCompId = fileToCompId.get(route.filePath)
    if (pageCompId === undefined) continue

    rendersEdges.push(
      createEdge({
        id: makeEdgeId('renders', route.id, pageCompId),
        from: route.id,
        to: pageCompId,
        kind: 'renders',
        provenance: { file: route.filePath, line: 1, adapter: 'nextjs-app-router@0.1', analyzerVersion },
        confidence: 'verified',
      })
    )

    const imported = compToImports.get(pageCompId) ?? []
    for (const importedId of imported) {
      rendersEdges.push(
        createEdge({
          id: makeEdgeId('renders', route.id, importedId),
          from: route.id,
          to: importedId,
          kind: 'renders',
          provenance: { file: route.filePath, line: 1, adapter: 'nextjs-app-router@0.1', analyzerVersion },
          confidence: 'inferred',
          inferenceChain: [`page imports component via static import`],
        })
      )
    }
  }

  return rendersEdges
}

export class NextJsAdapter implements IAdapter {
  readonly id = 'nextjs-app-router'
  readonly framework = 'nextjs-app-router' as const
  readonly parsingLevel = 'L1' as const
  readonly category = 'FE' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [routeNodes, components, supabaseTables, ormTables] = await Promise.all([
      parseRoutes(repoRoot),
      parseComponents(repoRoot),
      stack.hasSupabase ? parseTables(repoRoot) : Promise.resolve([]),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    const tableNodes = [...supabaseTables, ...ormTables]

    // mapScreenToTable expects IRGraph; build an in-memory graph just for mapping.
    const tempGraph = createIRGraph({
      analyzerVersion,
      repoRoot,
      projectName: path.basename(repoRoot),
      nodes: [...routeNodes, ...components.nodes, ...tableNodes],
      edges: components.edges,
    })

    const mapperEdges = await mapScreenToTable(tempGraph)
    const serverFiles = await mapServerFilesToTable(repoRoot, tableNodes)
    const rendersEdges = buildRendersEdges(routeNodes, components.nodes, components.edges, analyzerVersion)

    return {
      routeNodes,
      componentNodes: components.nodes,
      componentEdges: [...components.edges, ...rendersEdges],
      tableNodes,
      mapperEdges,
      serverNodes: serverFiles.nodes,
      serverEdges: serverFiles.edges,
    }
  }
}

export const nextJsAdapter = new NextJsAdapter()
