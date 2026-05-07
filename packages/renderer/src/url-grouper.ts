import type { RouteNode } from '@codebase-viz/types'

// Split a URL path into non-empty segments.
// "/api/v1/users" → ["api", "v1", "users"]
function pathSegments(p: string): string[] {
  return p.split('/').filter(Boolean)
}

// Compute segment-wise LCP of all paths.
// Returns the common prefix as a joined path (e.g. "/api/v1"), or "" when no common prefix.
function segmentLcp(paths: string[]): string {
  if (paths.length === 0) return ''
  const segmented = paths.map(pathSegments)
  const first = segmented[0] ?? []
  const result: string[] = []
  for (let i = 0; i < first.length; i++) {
    const seg = first[i]
    // seg is always string here because i < first.length
    if (segmented.every(segs => segs[i] === seg)) {
      result.push(seg!)
    } else {
      break
    }
  }
  return result.length > 0 ? '/' + result.join('/') : ''
}

export function groupRoutesByUrl(
  routes: RouteNode[],
): Array<{ groupKey: string; routes: RouteNode[] }> {
  if (routes.length === 0) return []
  if (routes.length === 1) return [{ groupKey: '/', routes: [...routes] }]

  const paths = routes.map(r => r.path)
  const lcp = segmentLcp(paths)

  // LCP is meaningful if it's non-empty (i.e. more than just the root slash absence)
  if (lcp !== '') {
    // All routes share the same LCP — single group
    return [{ groupKey: lcp, routes: [...routes] }]
  }

  // Fallback: cluster-first — group by the first path segment
  // Routes with no first segment (i.e. "/") go into the "/" cluster
  const clusterMap = new Map<string, RouteNode[]>()
  for (const r of routes) {
    const segs = pathSegments(r.path)
    const clusterKey = segs.length > 0 ? '/' + segs[0]! : '/'
    const existing = clusterMap.get(clusterKey) ?? []
    existing.push(r)
    clusterMap.set(clusterKey, existing)
  }

  return Array.from(clusterMap.entries()).map(([groupKey, groupRoutes]) => ({
    groupKey,
    routes: groupRoutes,
  }))
}
