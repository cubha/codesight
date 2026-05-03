import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseUrls } from './parsers/urls-parser.js'

export class DjangoAdapter implements IAdapter {
  readonly id = 'django'
  readonly framework = 'django' as const
  readonly parsingLevel = 'L1' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const routeNodes = await parseUrls(repoRoot, analyzerVersion)
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
    }
  }
}

export const djangoAdapter = new DjangoAdapter()
