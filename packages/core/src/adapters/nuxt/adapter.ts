import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
} from '@codebase-viz/types'
import { parseRoutes } from './parsers/route-parser.js'
import { parseNuxtComponents } from './parsers/component-parser.js'
import { detectTsOrmTables } from '../../db/index.js'

export class NuxtAdapter implements IAdapter {
  readonly id = 'nuxt'
  readonly framework = 'nuxt' as const
  readonly parsingLevel = 'L1' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasSupabase || stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [routeNodes, components] = await Promise.all([
      parseRoutes(repoRoot, analyzerVersion),
      parseNuxtComponents(repoRoot, analyzerVersion),
    ])
    const tableNodes = hasAnyTsOrm ? await detectTsOrmTables(repoRoot, analyzerVersion) : []

    return {
      routeNodes,
      componentNodes: components.nodes,
      componentEdges: components.edges,
      tableNodes,
      mapperEdges: [],
    }
  }
}

export const nuxtAdapter = new NuxtAdapter()
