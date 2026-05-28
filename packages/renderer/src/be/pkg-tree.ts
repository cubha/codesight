import type { RouteNode } from '@codebase-viz/types'
import { sanitizeId } from '../helpers/ids.js'

// Path-segment-aware longest common prefix.
// Finds the longest shared URL prefix (up to segment boundaries).
// Single path: strips the last segment (leaf endpoint) to return its parent prefix.
export function pathSegmentLcp(paths: string[]): string {
  if (paths.length === 0) return ''
  const segArrays = paths.map(p => p.split('/').filter(Boolean))
  if (paths.length === 1) {
    const segs = segArrays[0]!
    return segs.length > 1 ? '/' + segs.slice(0, -1).join('/') : ''
  }
  const minLen = Math.min(...segArrays.map(a => a.length))
  let lcpCount = 0
  for (let i = 0; i < minLen; i++) {
    const seg = segArrays[0]![i]!
    if (segArrays.every(a => a[i] === seg)) lcpCount++
    else break
  }
  if (lcpCount === 0) return ''
  return '/' + segArrays[0]!.slice(0, lcpCount).join('/')
}

// 패키지 segments 추출: src/main/{java,kotlin}/ 이후 + 파일명 제외
export function extractPackageSegments(filePath: string): string[] {
  const normalized = filePath.replace(/\\/g, '/')
  const javaMatch = normalized.match(/^(?:.*\/)?src\/main\/(?:java|kotlin)\/(.+)$/)
  const after = javaMatch !== null ? (javaMatch[1] ?? normalized) : normalized
  const segments = after.split('/').filter(Boolean)
  if (segments.length > 0) segments.pop()
  return segments
}

export function commonPrefixLen(segArrays: string[][]): number {
  if (segArrays.length === 0) return 0
  const minLen = Math.min(...segArrays.map(a => a.length))
  let i = 0
  for (; i < minLen; i++) {
    const seg = segArrays[0]?.[i]
    if (seg === undefined || !segArrays.every(a => a[i] === seg)) break
  }
  return i
}

export type PkgTreeNode = {
  children: Map<string, PkgTreeNode>
  files: Array<{ filePath: string; routes: RouteNode[] }>
}

export function buildPkgTree(
  fileRoutes: Array<{ filePath: string; segments: string[]; routes: RouteNode[] }>,
): PkgTreeNode {
  const root: PkgTreeNode = { children: new Map(), files: [] }
  for (const { filePath, segments, routes } of fileRoutes) {
    let cur = root
    for (const seg of segments) {
      let child = cur.children.get(seg)
      if (child === undefined) {
        child = { children: new Map(), files: [] }
        cur.children.set(seg, child)
      }
      cur = child
    }
    cur.files.push({ filePath, routes })
  }
  return root
}

// BE Tab1/Tab2 표준 (graph TD, node+edge tree, R-T1.4 / R-T2.1)
// HDR_PKG를 일반 노드 → subgraph wrapper로 변경. elk.mrtree가 일반 노드 root에서
// children을 cluster 밖으로 배치하는 결함 해소.
export function buildPackageHeaderOpen(lcpSegments: string[]): string[] {
  if (lcpSegments.length === 0) return []
  const label = `📁 src/main/java/${lcpSegments.join('.')}`
  return [`  subgraph HDR_PKG ["${label}"]`, '    direction TB']
}

export function buildPackageHeaderClose(lcpSegments: string[]): string[] {
  if (lcpSegments.length === 0) return []
  return ['  end']
}

export type TreeEmit = {
  lines: string[]
  // pkg path segments joined by '.' → sanitized node id. Used by leaf emitters to wire edges.
  nodeIdByPath: Map<string, string>
}

// 패키지 트리에서 node+edge만 emit. leaf(파일) 노드는 별도 emitter에서 처리하고 wiring만 책임진다.
// rootLabel: 헤더 노드 없이 단일 트리일 때 root segment를 안 그릴 수 있도록 'BE_ROOT' 기본
// clusterRoot=true 시 첫 depth edge 생략. HDR_PKG subgraph wrapper가 자식 트리 외곽선 역할.
export function emitTreeNodes(
  tree: PkgTreeNode,
  rootId: string,
  prefixPath: string[] = [],
  opts: { clusterRoot?: boolean } = {},
): TreeEmit {
  const lines: string[] = []
  const nodeIdByPath = new Map<string, string>()
  const walk = (node: PkgTreeNode, parentId: string, pathSegs: string[], depth: number): void => {
    for (const [seg, child] of node.children) {
      const segs = [...pathSegs, seg]
      const id = `pkg_${sanitizeId(segs.join('__'))}`
      lines.push(`  ${id}["${seg}"]:::pkg`)
      if (!(opts.clusterRoot === true && depth === 0)) {
        lines.push(`  ${parentId} --> ${id}`)
      }
      nodeIdByPath.set(segs.join('.'), id)
      walk(child, id, segs, depth + 1)
    }
  }
  walk(tree, rootId, prefixPath, 0)
  return { lines, nodeIdByPath }
}

// top-level 패키지(공통 prefix strip 직후 첫 depth) 단위로 chunk 분할.
// R-T1.8 (Tab1) / R-T2.1 (Tab2) chunk gate.
export function chunkByTopLevelPackage(
  tree: PkgTreeNode,
): Array<{ topSeg: string; subtree: PkgTreeNode }> {
  const chunks: Array<{ topSeg: string; subtree: PkgTreeNode }> = []
  for (const [topSeg, subtree] of tree.children) {
    chunks.push({ topSeg, subtree })
  }
  // root에 직접 매달린 파일이 있으면(드물지만 — 공통 prefix가 패키지 leaf인 경우) "(_root)" chunk로 묶음
  if (tree.files.length > 0) {
    const rootOnly: PkgTreeNode = { children: new Map(), files: tree.files }
    chunks.push({ topSeg: '_root', subtree: rootOnly })
  }
  return chunks
}
