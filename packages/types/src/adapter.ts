import type { RouteNode, ComponentNode, TableNode, IREdge } from './ir.js'
import type { StackInfo, FrameworkKind, ParsingLevel } from './stack.js'

export interface AdapterContext {
  repoRoot: string
  stack: StackInfo
  analyzerVersion: string
}

export interface AdapterResult {
  routeNodes: RouteNode[]
  componentNodes: ComponentNode[]
  componentEdges: IREdge[]
  tableNodes: TableNode[]
  mapperEdges: IREdge[]
  serverNodes?: ComponentNode[]
  serverEdges?: IREdge[]
}

export type AdapterCategory = 'FE' | 'BE' | 'Fullstack'

export interface IAdapter {
  readonly id: string
  readonly framework: FrameworkKind
  readonly parsingLevel: ParsingLevel
  readonly category: AdapterCategory
  analyze(ctx: AdapterContext): Promise<AdapterResult>
}

export const EMPTY_ADAPTER_RESULT: AdapterResult = {
  routeNodes: [],
  componentNodes: [],
  componentEdges: [],
  tableNodes: [],
  mapperEdges: [],
}
