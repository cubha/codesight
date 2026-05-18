import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseUrls } from './parsers/urls-parser.js'
import { parseDjangoComponents } from './parsers/component-parser.js'
import { parseDjangoOrmModels } from './parsers/orm-parser.js'
import { parseFlywayMigrations, mergeFlywayTables } from '../../db/flyway-parser.js'

export class DjangoAdapter implements IAdapter {
  readonly id = 'django'
  readonly framework = 'django' as const
  readonly parsingLevel = 'L1' as const
  readonly category = 'BE' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const [routeNodes, componentNodes, ormTables, flywayNodes] = await Promise.all([
      parseUrls(repoRoot, analyzerVersion).catch(() => []),
      parseDjangoComponents(repoRoot, analyzerVersion).catch(() => []),
      parseDjangoOrmModels(repoRoot, analyzerVersion).catch(() => []),
      parseFlywayMigrations(repoRoot).catch(() => []),
    ])

    // Django ORM models take precedence; Flyway DDL supplements missing tables/columns
    const tableNodes = mergeFlywayTables(ormTables, flywayNodes)

    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
      componentNodes,
      tableNodes,
    }
  }
}

export const djangoAdapter = new DjangoAdapter()
