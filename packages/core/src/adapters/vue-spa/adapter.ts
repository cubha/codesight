import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseVueRoutes } from './parsers/route-parser.js'
import { parseVueSpaComponents } from './parsers/component-parser.js'
import { detectTsOrmTables } from '../../db/index.js'

export class VueSpaAdapter implements IAdapter {
  readonly id = 'vue-spa'
  readonly framework = 'vue-spa' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm || stack.hasSupabase

    const [routeNodes, components, tableNodes] = await Promise.all([
      parseVueRoutes(repoRoot, analyzerVersion),
      parseVueSpaComponents(repoRoot, analyzerVersion),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
      componentNodes: components.nodes,
      componentEdges: components.edges,
      tableNodes,
    }
  }
}

export const vueSpaAdapter = new VueSpaAdapter()
