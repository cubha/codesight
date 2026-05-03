import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseAnnotations } from './parsers/annotation-parser.js'

export class SpringBootAdapter implements IAdapter {
  readonly id = 'springboot'
  readonly framework = 'springboot' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const routeNodes = await parseAnnotations(repoRoot, analyzerVersion)
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
    }
  }
}

export const springBootAdapter = new SpringBootAdapter()
