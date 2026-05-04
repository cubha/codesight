import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseReactRouterFull } from './parsers/route-parser.js'
import { detectTsOrmTables } from '../../db/index.js'

export class ReactRouterAdapter implements IAdapter {
  readonly id = 'react-router'
  readonly framework = 'react-router' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm || stack.hasSupabase

    const [{ routeNodes, componentNodes, rendersEdges }, tableNodes] = await Promise.all([
      parseReactRouterFull(repoRoot, analyzerVersion),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
      componentNodes,
      componentEdges: rendersEdges,
      tableNodes,
    }
  }
}

export const reactRouterAdapter = new ReactRouterAdapter()
