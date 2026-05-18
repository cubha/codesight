import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
} from '@codebase-viz/types'
import { parseNextPagesRoutes } from './parsers/route-parser.js'
import { parseNextPagesComponents } from './parsers/component-parser.js'
import { detectTsOrmTables, parseSupabaseTables } from '../../db/index.js'
import { buildMapperEdges } from '../_shared/mapper-utils.js'

export class NextJsPagesAdapter implements IAdapter {
  readonly id = 'nextjs-pages'
  readonly framework = 'nextjs-pages' as const
  readonly parsingLevel = 'L2' as const
  readonly category = 'FE' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [routeNodes, components, supabaseTables, ormTables] = await Promise.all([
      parseNextPagesRoutes(repoRoot, analyzerVersion),
      parseNextPagesComponents(repoRoot, analyzerVersion),
      stack.hasSupabase ? parseSupabaseTables(repoRoot, analyzerVersion) : Promise.resolve([]),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    const tableNodes = [...supabaseTables, ...ormTables]
    const mapperEdges = buildMapperEdges(routeNodes, components.nodes, tableNodes, analyzerVersion)
    return {
      routeNodes,
      componentNodes: components.nodes,
      componentEdges: components.edges,
      tableNodes,
      mapperEdges,
    }
  }
}

export const nextJsPagesAdapter = new NextJsPagesAdapter()
