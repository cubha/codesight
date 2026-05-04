import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
} from '@codebase-viz/types'
import { parseNextPagesRoutes } from './parsers/route-parser.js'
import { parseNextPagesComponents } from './parsers/component-parser.js'
import { detectTsOrmTables } from '../../db/index.js'
import { buildMapperEdges } from '../_shared/mapper-utils.js'

export class NextJsPagesAdapter implements IAdapter {
  readonly id = 'nextjs-pages'
  readonly framework = 'nextjs-pages' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasSupabase || stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [routeNodes, components, tableNodes] = await Promise.all([
      parseNextPagesRoutes(repoRoot, analyzerVersion),
      parseNextPagesComponents(repoRoot, analyzerVersion),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
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
