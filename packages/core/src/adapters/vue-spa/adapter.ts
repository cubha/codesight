import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  type IREdge,
  EMPTY_ADAPTER_RESULT,
  createEdge,
  makeEdgeId,
} from '@codebase-viz/types'
import { parseVueRoutes } from './parsers/route-parser.js'
import { parseVueSpaComponents } from './parsers/component-parser.js'
import { detectTsOrmTables, parseSupabaseTables } from '../../db/index.js'
import { buildMapperEdges } from '../_shared/mapper-utils.js'

export class VueSpaAdapter implements IAdapter {
  readonly id = 'vue-spa'
  readonly framework = 'vue-spa' as const
  readonly parsingLevel = 'L2' as const
  readonly category = 'FE' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [routeNodes, components, supabaseTables, ormTables] = await Promise.all([
      parseVueRoutes(repoRoot, analyzerVersion),
      parseVueSpaComponents(repoRoot, analyzerVersion),
      stack.hasSupabase ? parseSupabaseTables(repoRoot, analyzerVersion) : Promise.resolve([]),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    const tableNodes = [...supabaseTables, ...ormTables]
    const mapperEdges = buildMapperEdges(routeNodes, components.nodes, tableNodes, analyzerVersion)

    // v1.2.44 A1-1b: route.filePath ↔ component.filePath 매칭으로 rendersEdge 생성
    // (A1-1에서 route.filePath를 컴포넌트 파일로 치환했으므로 자명한 매핑)
    const rendersEdges: IREdge[] = []
    const compByFilePath = new Map(components.nodes.map(c => [c.filePath, c]))
    for (const r of routeNodes) {
      const comp = compByFilePath.get(r.filePath)
      if (comp === undefined) continue
      rendersEdges.push(createEdge({
        id: makeEdgeId('renders', r.id, comp.id),
        from: r.id,
        to: comp.id,
        kind: 'renders',
        provenance: { file: comp.filePath, line: 1, adapter: 'vue-spa@0.1', analyzerVersion },
        confidence: 'inferred',
        inferenceChain: ['route.filePath와 component.filePath 일치 매핑'],
      }))
    }

    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
      componentNodes: components.nodes,
      componentEdges: [...components.edges, ...rendersEdges],
      tableNodes,
      mapperEdges,
    }
  }
}

export const vueSpaAdapter = new VueSpaAdapter()
