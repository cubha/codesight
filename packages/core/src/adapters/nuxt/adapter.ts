import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
} from '@codebase-viz/types'
import { parseRoutes } from './parsers/route-parser.js'

export class NuxtAdapter implements IAdapter {
  readonly id = 'nuxt'
  readonly framework = 'nuxt' as const
  readonly parsingLevel = 'L1' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const routeNodes = await parseRoutes(repoRoot, analyzerVersion)
    return {
      routeNodes,
      componentNodes: [],
      componentEdges: [],
      tableNodes: [],
      mapperEdges: [],
    }
  }
}

export const nuxtAdapter = new NuxtAdapter()
