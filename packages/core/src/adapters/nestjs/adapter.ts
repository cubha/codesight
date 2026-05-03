import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
} from '@codebase-viz/types'
import { parseControllers, parseModulesAndProviders } from './parsers/decorator-parser.js'

export class NestJsAdapter implements IAdapter {
  readonly id = 'nestjs'
  readonly framework = 'nestjs' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const [controllerResult, moduleResult] = await Promise.all([
      parseControllers(repoRoot, analyzerVersion),
      parseModulesAndProviders(repoRoot, analyzerVersion),
    ])
    return {
      routeNodes: controllerResult.routes,
      componentNodes: [
        ...controllerResult.controllers,
        ...moduleResult.modules,
        ...moduleResult.services,
      ],
      componentEdges: moduleResult.edges,
      tableNodes: [],
      mapperEdges: [],
    }
  }
}

export const nestJsAdapter = new NestJsAdapter()
