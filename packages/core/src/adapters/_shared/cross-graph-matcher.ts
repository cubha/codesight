import {
  createEdge,
  makeEdgeId,
  makeNodeId,
  isComponentNode,
  type IREdge,
  type IRGraph,
  type RouteNode,
} from '@codebase-viz/types'
import type { FeCall } from './fe-call-extractor.js'

export interface CrossGraphMatcherOpts {
  fromRepoRoot: string
  toRepoRoot: string
  analyzerVersion?: string
}

// Converts a BE route path pattern to a regex that matches FE literal URLs.
// Supports unified :param format (emitted by normalizeUrlPath for all BE adapters):
//   :slug?  → optional catch-all (.*) — must be checked before :slug*
//   :slug*  → catch-all (.+)
//   :param  → dynamic segment ([^/]+)
// Also supports legacy bracket formats for future-proofing:
//   [[...slug]] → optional catch-all
//   [...slug]   → catch-all
//   [slug]      → dynamic segment
function routePatternToRegex(routePath: string): RegExp {
  const segments = routePath.split('/')
  const converted = segments.map(segment => {
    // Unified :param format (normalizeUrlPath output)
    if (segment.endsWith('?') && segment.startsWith(':')) return '.*'   // optional catch-all
    if (segment.endsWith('*') && segment.startsWith(':')) return '.+'   // catch-all
    if (segment.startsWith(':')) return '[^/]+'                          // dynamic param

    // Legacy Next.js bracket format (fallback)
    if (segment.startsWith('[[...') && segment.endsWith(']]')) return '.*'  // [[...slug]]
    if (segment.startsWith('[...') && segment.endsWith(']')) return '.+'    // [...slug]
    if (segment.startsWith('[') && segment.endsWith(']')) return '[^/]+'    // [slug]

    // Static segment — escape for regex
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  return new RegExp('^' + converted.join('/') + '$')
}

// Normalises a URL for comparison: strips query string, trailing slash (except root), lowercases.
function normalizeUrl(url: string): string {
  const withoutQuery = url.split('?')[0] ?? url
  const withoutHash = withoutQuery.split('#')[0] ?? withoutQuery
  if (withoutHash !== '/' && withoutHash.endsWith('/')) {
    return withoutHash.slice(0, -1).toLowerCase()
  }
  return withoutHash.toLowerCase()
}

function makeDanglingEdge(feCall: FeCall, analyzerVersion: string): IREdge {
  const fromId = makeNodeId('component', feCall.filePath, feCall.url)
  const edge = createEdge({
    id: makeEdgeId('fe-be-call', fromId, fromId),
    from: fromId,
    to: fromId,
    kind: 'fe-be-call',
    provenance: {
      file: feCall.filePath,
      line: feCall.line,
      adapter: 'cross-graph-matcher@0.1',
      analyzerVersion,
    },
    confidence: 'inferred',
    inferenceChain: ['no-route-match'],
  })
  return edge
}

export function remapCrossEdgeFromIds(edges: IREdge[], feGraph: IRGraph): IREdge[] {
  return edges.map(edge => {
    if (edge.kind !== 'fe-be-call') return edge
    const sourceComponent = feGraph.nodes.find(
      n => isComponentNode(n) && n.filePath === edge.provenance.file,
    )
    if (sourceComponent === undefined) return edge
    const newEdgeId = makeEdgeId('fe-be-call', sourceComponent.id, edge.to)
    return { ...edge, id: newEdgeId, from: sourceComponent.id }
  })
}

export function matchFeCallsToBeRoutes(
  feCalls: FeCall[],
  beRouteNodes: RouteNode[],
  opts?: CrossGraphMatcherOpts,
): IREdge[] {
  if (feCalls.length === 0) return []

  const analyzerVersion = opts?.analyzerVersion ?? 'codebase-viz@0.1.0'
  const crossProject = opts !== undefined
    ? { fromRepoRoot: opts.fromRepoRoot, toRepoRoot: opts.toRepoRoot }
    : undefined

  // Pre-compute patterns for BE routes
  const bePatterns = beRouteNodes.map((route) => ({
    route,
    normalized: route.path.toLowerCase(),
    regex: routePatternToRegex(route.path),
  }))

  const edges: IREdge[] = []

  for (const feCall of feCalls) {
    const normalizedFeUrl = normalizeUrl(feCall.url)
    const feMethod = feCall.method.toUpperCase()

    // Phase 1: exact match (normalized path, case-insensitive)
    let matched = bePatterns.find(
      (bp) => bp.normalized === normalizedFeUrl && (bp.route.httpMethod === undefined || bp.route.httpMethod.toUpperCase() === feMethod)
    )

    // Phase 2: dynamic segment pattern match
    if (matched === undefined) {
      matched = bePatterns.find(
        (bp) => bp.regex.test(normalizedFeUrl) && (bp.route.httpMethod === undefined || bp.route.httpMethod.toUpperCase() === feMethod)
      )
    }

    // Phase 3: dangling (no match)
    if (matched === undefined) {
      edges.push(makeDanglingEdge(feCall, analyzerVersion))
      continue
    }

    const isExact = matched.normalized === normalizedFeUrl
    const fromId = makeNodeId('component', feCall.filePath, feCall.url)
    const toId = matched.route.id

    const base = {
      id: makeEdgeId('fe-be-call', fromId, toId),
      from: fromId,
      to: toId,
      kind: 'fe-be-call' as const,
      provenance: {
        file: feCall.filePath,
        line: feCall.line,
        adapter: 'cross-graph-matcher@0.1',
        analyzerVersion,
      },
    }

    const edge: IREdge = crossProject !== undefined
      ? (isExact
        ? createEdge({ ...base, crossProject, confidence: 'verified' })
        : createEdge({ ...base, crossProject, confidence: 'inferred', inferenceChain: ['dynamic-segment-match'] }))
      : (isExact
        ? createEdge({ ...base, confidence: 'verified' })
        : createEdge({ ...base, confidence: 'inferred', inferenceChain: ['dynamic-segment-match'] }))

    edges.push(edge)
  }

  return edges
}
