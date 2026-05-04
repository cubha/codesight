import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseAngularRoutes } from './parsers/route-parser.js'
import { parseAngularComponents } from './parsers/component-parser.js'
import { detectTsOrmTables } from '../../db/index.js'

export class AngularAdapter implements IAdapter {
  readonly id = 'angular'
  readonly framework = 'angular' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm || stack.hasSupabase

    const [routeNodes, { nodes: componentNodes, edges: componentEdges }, tableNodes] = await Promise.all([
      parseAngularRoutes(repoRoot, analyzerVersion),
      parseAngularComponents(repoRoot, analyzerVersion),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    return { ...EMPTY_ADAPTER_RESULT, routeNodes, componentNodes, componentEdges, tableNodes }
  }
}

export const angularAdapter = new AngularAdapter()
