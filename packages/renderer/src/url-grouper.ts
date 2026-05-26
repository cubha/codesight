import type { RouteNode } from '@codebase-viz/types'

export interface NestedGroup {
  groupKey: string
  routes: RouteNode[]
  children: NestedGroup[]
}

export interface GroupingOpts {
  maxDepth?: number
}

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
    if (segmented.every(segs => segs[i] === seg)) {
      result.push(seg!)
    } else {
      break
    }
  }
  return result.length > 0 ? '/' + result.join('/') : ''
}

function groupRoutesRecursive(
  routes: RouteNode[],
  parentPrefix: string,
  depth: number,
  maxDepth: number,
): NestedGroup[] {
  if (routes.length === 0) return []

  // Compute relative paths (strip parent prefix)
  const relPaths = routes.map(r => {
    const rel = r.path.startsWith(parentPrefix) ? r.path.slice(parentPrefix.length) : r.path
    return rel === '' ? '/' : rel
  })

  // Find LCP among non-root relative paths
  const nonRootRel = relPaths.filter(p => p !== '/')
  const relLcp = nonRootRel.length > 0 ? segmentLcp(nonRootRel) : ''
  const fullGroupKey = relLcp !== '' ? (parentPrefix + relLcp).replace(/\/+/g, '/') : ''

  if (relLcp !== '') {
    const exactRoutes = routes.filter(r => r.path === fullGroupKey)
    const deeperRoutes = routes.filter(r => r.path !== fullGroupKey)
    // Recurse only when the total group is large enough and we haven't hit maxDepth
    const shouldRecurse = depth < maxDepth && new Set(routes.map(r => r.path)).size > 1

    if (!shouldRecurse || deeperRoutes.length === 0) {
      return [{ groupKey: fullGroupKey, routes: [...routes], children: [] }]
    }

    return [{
      groupKey: fullGroupKey,
      routes: exactRoutes,
      children: groupRoutesRecursive(deeperRoutes, fullGroupKey, depth + 1, maxDepth),
    }]
  }

  // No shared LCP — cluster by first remaining segment
  const clusterMap = new Map<string, RouteNode[]>()
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!
    const rel = relPaths[i]!
    const segs = rel.split('/').filter(Boolean)
    const seg = segs[0]
    const clusterKey = seg
      ? (parentPrefix + '/' + seg).replace(/\/+/g, '/')
      : (parentPrefix || '/')
    const existing = clusterMap.get(clusterKey) ?? []
    existing.push(r)
    clusterMap.set(clusterKey, existing)
  }

  return Array.from(clusterMap.entries()).map(([clusterKey, clusterRoutes]) => {
    const exactRoutes = clusterRoutes.filter(r => r.path === clusterKey)
    const deeperRoutes = clusterRoutes.filter(r => r.path !== clusterKey)
    // v1.2.45 결함 #1 (회귀 해소): single-route cluster라도 route.path가 clusterKey보다 깊으면 recurse.
    // 그래야 URL intermediate segment(예: /partner/ordProdPlanMgmt/prodOrdSpec → ordProdPlanMgmt)가
    // NestedGroup tree에 명시적으로 보존되어 Tab1/Tab2 subgraph wrapper로 시각화됨 (FE 표준 v1.1 R-T1.2).
    const shouldRecurseCluster = depth < maxDepth && (
      new Set(clusterRoutes.map(r => r.path)).size > 1 ||
      (clusterRoutes.length === 1 && deeperRoutes.length > 0)
    )

    if (!shouldRecurseCluster || deeperRoutes.length === 0) {
      return { groupKey: clusterKey, routes: clusterRoutes, children: [] }
    }

    return {
      groupKey: clusterKey,
      routes: exactRoutes,
      children: groupRoutesRecursive(deeperRoutes, clusterKey, depth + 1, maxDepth),
    }
  })
}

export function groupRoutesByUrl(
  routes: RouteNode[],
  opts?: GroupingOpts,
): NestedGroup[] {
  const maxDepth = opts?.maxDepth ?? 8
  return groupRoutesRecursive(routes, '', 0, maxDepth)
}
