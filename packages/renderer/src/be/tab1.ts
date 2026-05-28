import type { IRGraph, RouteNode } from '@codebase-viz/types'
import { isRouteNode } from '@codebase-viz/types'
import { BE_RENDERING_INIT, CLASS_DEFS } from '../helpers/constants.js'
import { joinChunks } from '../_shared/wrap-fallback.js'
import {
  extractPackageSegments,
  commonPrefixLen,
  type PkgTreeNode,
  buildPkgTree,
  buildPackageHeaderOpen,
  buildPackageHeaderClose,
  emitTreeNodes,
  chunkByTopLevelPackage,
} from './pkg-tree.js'
import { emitControllerFileLeaf } from './leaf.js'

export function buildBeRenderingDiagram(graph: IRGraph): string {
  const routeNodes = graph.nodes.filter(isRouteNode)
  if (routeNodes.length === 0) return 'graph TD\n  empty["(no endpoints found)"]'

  const byFile = new Map<string, RouteNode[]>()
  for (const r of routeNodes) {
    const existing = byFile.get(r.filePath) ?? []
    existing.push(r)
    byFile.set(r.filePath, existing)
  }

  const fileRoutes = [...byFile.entries()].map(([filePath, routes]) => ({
    filePath,
    segments: extractPackageSegments(filePath),
    routes,
  }))

  const lcpLen = commonPrefixLen(fileRoutes.map(f => f.segments))
  const trimController = fileRoutes.every(f => {
    const last = f.segments[f.segments.length - 1]
    return f.segments.length > lcpLen && last !== undefined && /^controllers?$/i.test(last)
  })
  const lcpSegments = fileRoutes[0]?.segments.slice(0, lcpLen) ?? []
  const trimmed = fileRoutes.map(f => ({
    ...f,
    segments: f.segments.slice(lcpLen, trimController ? -1 : undefined),
  }))

  const emitChunk = (chunkTree: PkgTreeNode, headerSegs: string[]): string[] => {
    // HDR_PKG subgraph wrapper + dagre layout. v1.2.40 ELK mrtree pragma 제거 —
    // mrtree가 cluster wrapper 내부에서 top-level pkg 노드를 floating root로 인식하여 좌상단 모서리에 박는 결함 야기.
    // invisible link `~~~` 폴백도 실패. dagre fallback 시각 검증으로 cluster 정렬 정상 동작 확인.
    // BE_RENDERING_INIT 사용 — flowchart.nodeSpacing/rankSpacing 축소로 DI 체인 간격 조밀.
    const lines: string[] = [BE_RENDERING_INIT, 'graph TD', CLASS_DEFS]
    const hdrOpen = buildPackageHeaderOpen(headerSegs)
    const isCluster = hdrOpen.length > 0
    lines.push(...hdrOpen)
    const rootId = isCluster ? 'HDR_PKG' : 'BE_ANCHOR'
    if (!isCluster) lines.push(`  ${rootId}["(root)"]:::hdr`)
    const treeEmit = emitTreeNodes(chunkTree, rootId, [], { clusterRoot: isCluster })
    lines.push(...treeEmit.lines)
    // Leaf 파일: 부모 패키지 노드에 leaf controller 연결.
    const walkFiles = (node: PkgTreeNode, parentId: string, pathSegs: string[], depth: number): void => {
      for (const [seg, child] of node.children) {
        const segs = [...pathSegs, seg]
        const pkgId = treeEmit.nodeIdByPath.get(segs.join('.')) ?? parentId
        walkFiles(child, pkgId, segs, depth + 1)
      }
      for (const f of node.files) {
        const { leafId, lines: leafLines } = emitControllerFileLeaf('  ', f.filePath, f.routes)
        lines.push(...leafLines)
        if (!(isCluster && depth === 0)) {
          lines.push(`  ${parentId} --> ${leafId}`)
        }
      }
    }
    walkFiles(chunkTree, rootId, [], 0)
    lines.push(...buildPackageHeaderClose(headerSegs))
    return lines
  }

  const tree = buildPkgTree(trimmed)
  const chunks = chunkByTopLevelPackage(tree)
  if (chunks.length <= 1) {
    return emitChunk(tree, lcpSegments).join('\n')
  }
  // 각 chunk header = LCP + topSeg. 트리는 topSeg children부터 시작 (R-T1.2 + R-T1.8: 중복 노드 제거)
  const parts = chunks.map(({ topSeg, subtree }) => {
    const headerSegs = topSeg === '_root' ? lcpSegments : [...lcpSegments, topSeg]
    return emitChunk(subtree, headerSegs).join('\n')
  })
  return joinChunks(parts)
}
