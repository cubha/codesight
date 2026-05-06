import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
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

    const [routeNodes, { nodes: componentNodes, edges: componentEdges }, supabaseTables, ormTables] = await Promise.all([
      parseAngularRoutes(repoRoot, analyzerVersion),
      parseAngularComponents(repoRoot, analyzerVersion),
      stack.hasSupabase ? parseSupabaseTables(repoRoot, analyzerVersion) : Promise.resolve([]),
      hasAnyTsOrm ? detectTsOrmTables(repoRoot, analyzerVersion) : Promise.resolve([]),
    ])
    const tableNodes = [...supabaseTables, ...ormTables]
    const mapperEdges = buildMapperEdges(routeNodes, componentNodes, tableNodes, analyzerVersion)
    return { ...EMPTY_ADAPTER_RESULT, routeNodes, componentNodes, componentEdges, tableNodes, mapperEdges }
  }
}

export const angularAdapter = new AngularAdapter()
