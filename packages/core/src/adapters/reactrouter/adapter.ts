import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseReactRoutes } from './parsers/route-parser.js'

export class ReactRouterAdapter implements IAdapter {
  readonly id = 'react-router'
  readonly framework = 'react-router' as const
  readonly parsingLevel = 'L1' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const routeNodes = await parseReactRoutes(repoRoot, analyzerVersion)
    return { ...EMPTY_ADAPTER_RESULT, routeNodes }
  }
}

export const reactRouterAdapter = new ReactRouterAdapter()
