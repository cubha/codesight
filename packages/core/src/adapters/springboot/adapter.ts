import {
  type IAdapter,
  type AdapterContext,
  type AdapterResult,
  EMPTY_ADAPTER_RESULT,
} from '@codebase-viz/types'
import { parseAnnotations } from './parsers/annotation-parser.js'
import { parseSpringComponents } from './parsers/component-parser.js'
import { parseJpaEntities } from './parsers/orm-parser.js'
import { buildMapperEdges } from '../_shared/mapper-utils.js'

export class SpringBootAdapter implements IAdapter {
  readonly id = 'springboot'
  readonly framework = 'springboot' as const
  readonly parsingLevel = 'L2' as const

  async analyze(ctx: AdapterContext): Promise<AdapterResult> {
    const { repoRoot, analyzerVersion } = ctx
    const [routeNodes, componentNodes, tableNodes] = await Promise.all([
      parseAnnotations(repoRoot, analyzerVersion).catch(() => []),
      parseSpringComponents(repoRoot, analyzerVersion).catch(() => []),
      parseJpaEntities(repoRoot, analyzerVersion).catch(() => []),
    ])
    const mapperEdges = buildMapperEdges(routeNodes, componentNodes, tableNodes, analyzerVersion)
    return {
      ...EMPTY_ADAPTER_RESULT,
      routeNodes,
      componentNodes,
      tableNodes,
      mapperEdges,
    }
  }
}

export const springBootAdapter = new SpringBootAdapter()
