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
  readonly category = 'FE' as const

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
    const seenRouteIds = new Set<string>()
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
      seenRouteIds.add(routeId)
    }

    // v1.2.44 A1-2b: sync Identifier(`component: FooComponent`) 패턴 보강.
    // A1-2에서 route.filePath를 component.filePath로 치환했으므로 filePath 매칭으로 rendersEdge 생성.
    // loadComponentMap에서 이미 처리된 routeId는 skip (중복 방지).
    const compByFilePath = new Map(componentNodes.map(c => [c.filePath, c]))
    for (const r of routeNodes) {
      if (seenRouteIds.has(r.id)) continue
      const comp = compByFilePath.get(r.filePath)
      if (comp === undefined) continue
      rendersEdges.push(createEdge({
        id: makeEdgeId('renders', r.id, comp.id),
        from: r.id,
        to: comp.id,
        kind: 'renders',
        provenance: { file: comp.filePath, line: 1, adapter: 'angular@0.1', analyzerVersion },
        confidence: 'inferred',
        inferenceChain: ['route.filePath와 component.filePath 일치 매핑 (sync Identifier)'],
      }))
    }

    return { ...EMPTY_ADAPTER_RESULT, routeNodes, componentNodes, componentEdges: [...componentEdges, ...rendersEdges], tableNodes, mapperEdges }
  }
}

export const angularAdapter = new AngularAdapter()
