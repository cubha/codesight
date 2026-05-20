import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseReactRouterFull } from './parsers/route-parser.js'
import { parseApiCalls } from './parsers/api-call-parser.js'
import { detectTsOrmTables, parseSupabaseTables } from '../../db/index.js'
import { buildMapperEdges } from '../_shared/mapper-utils.js'

export class ReactRouterAdapter implements IAdapter {
  readonly id = 'react-router'
  readonly framework = 'react-router' as const
  readonly parsingLevel = 'L2' as const
  readonly category = 'FE' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion, stack } = ctx
    const hasAnyTsOrm = stack.hasPrisma || stack.hasDrizzle || stack.hasTypeOrm

    const [{ routeNodes, componentNodes, rendersEdges }, supabaseTables, ormTables] = await Promise.all([
      parseReactRouterFull(repoRoot, analyzerVersion),
      stack.hasSupabase ? parseSupabaseTables(repoRoot, analyzerVersion) : Promise.resolve([]),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    const tableNodes = [...supabaseTables, ...ormTables]
    const mapperEdges = buildMapperEdges(routeNodes, componentNodes, tableNodes, analyzerVersion)
    const apiCallEdges = await parseApiCalls(repoRoot, componentNodes, analyzerVersion)
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
      componentNodes,
      componentEdges: [...rendersEdges, ...apiCallEdges],
      tableNodes,
      mapperEdges,
    }
  }
}

export const reactRouterAdapter = new ReactRouterAdapter()
