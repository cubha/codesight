import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseDecorators } from './parsers/decorator-parser.js'

export class FastApiAdapter implements IAdapter {
  readonly id = 'fastapi'
  readonly framework = 'fastapi' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const routeNodes = await parseDecorators(repoRoot, analyzerVersion)
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
    }
  }
}

export const fastApiAdapter = new FastApiAdapter()
