import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  type NodeId,
  type IREdge,
  EMPTY_ADAPTER_RESULT,
  createEdge,
  makeEdgeId,
} from '@codebase-viz/types'
import { parseAngularRoutes } from './parsers/route-parser.js'
import { parseAngularComponents } from './parsers/component-parser.js'
import { detectTsOrmTables, parseSupabaseTables } from '../../db/index.js'
import { buildMapperEdges } from '../_shared/mapper-utils.js'

export class AngularAdapter implements IAdapter {
  readonly id = 'angular'
  readonly framework = 'angular' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [{ routes: routeNodes, loadComponentMap }, { nodes: componentNodes, edges: componentEdges }, supabaseTables, ormTables] = await Promise.all([
      parseAngularRoutes(repoRoot, analyzerVersion),
      parseAngularComponents(repoRoot, analyzerVersion),
      stack.hasSupabase ? parseSupabaseTables(repoRoot, analyzerVersion) : Promise.resolve([]),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    const tableNodes = [...supabaseTables, ...ormTables]
    const mapperEdges = buildMapperEdges(routeNodes, componentNodes, tableNodes, analyzerVersion)

    const rendersEdges: IREdge[] = []
    for (const [routeId, className] of loadComponentMap) {
      const compNode = componentNodes.find(n => n.name === className)
      if (compNode === undefined) continue
      rendersEdges.push(
        createEdge({
          id: makeEdgeId('renders', routeId as NodeId, compNode.id),
          from: routeId as NodeId,
          to: compNode.id,
          kind: 'renders',
          provenance: { file: compNode.filePath, line: 1, adapter: 'angular@0.1', analyzerVersion },
          confidence: 'inferred',
          inferenceChain: [`loadComponent: () => import(...).then(m => m.${className})`],
        }),
      )
    }

    return { ...EMPTY_ADAPTER_RESULT, routeNodes, componentNodes, componentEdges: [...componentEdges, ...rendersEdges], tableNodes, mapperEdges }
  }
}

export const angularAdapter = new AngularAdapter()
