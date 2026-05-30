import type { IRGraph, IREdge, ComponentNode } from '@codebase-viz/types'
import { isComponentNode } from '@codebase-viz/types'
import { sanitizeId, edgeArrow } from '../helpers/ids.js'
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
import { isBeController, isBeService, isBeRepository } from './leaf.js'

// BE Tab2 = Tab1 동일 패키지 트리 + leaf에 Controller→Service→Repository 수직 DI 체인 subgraph.
// 표준: docs/design/BE-DIAGRAM-STANDARD.md §3 (R-T2.1~6).
// - 트리: emitTreeNodes (R-T2.1, Tab1 동일 정책)
// - leaf DI 체인: di_<Ctrl> subgraph, 수직 verified --> 또는 inferred -.->
// - (none) placeholder: Controller에 DI edge ≥1 있을 때만 누락 슬롯 채움 (D4 / R-T2.5 Less is More)
// - cross-package DI: from·to 패키지 다르면 leaf 외부 dashed edge (R-T2.4)
// - chunk: chunkByTopLevelPackage → top-level 패키지별 분할 (R-T2.1 + R-T1.8)
export function buildBeArchitectureDiagram(graph: IRGraph): string {
  const componentNodes = graph.nodes.filter(isComponentNode)
  if (componentNodes.length === 0) return 'graph TD\n  empty["(no BE components found)"]'

  const callsEdges = graph.edges.filter(e => e.kind === 'calls')

  // Controller만 트리 구조의 leaf로 표시. Service·Repository는 leaf DI subgraph 안에서 별도 노드로 emit.
  const controllers = componentNodes.filter(c => isBeController(c.name))
  if (controllers.length === 0) return 'graph TD\n  empty["(no BE controllers found)"]'

  // component.id → 도메인 패키지 (cross-pkg 분류용, D3)
  // Spring 컨벤션: <domain>/{controller,service,repository,dao,mapper}/*.java
  // 마지막 segment가 컨벤션 폴더면 strip → 같은 도메인 안의 Controller·Service·Repository는 same-pkg
  const stripDomainSuffix = (segs: string[]): string[] => {
    const last = segs[segs.length - 1]
    if (last !== undefined && /^(controllers?|services?|repositor(?:y|ies)|dao(?:s)?|mappers?)$/i.test(last)) {
      return segs.slice(0, -1)
    }
    return segs
  }
  const compIdToPkg = new Map<string, string[]>()
  for (const c of componentNodes) compIdToPkg.set(c.id, stripDomainSuffix(extractPackageSegments(c.filePath)))

  // controller filePath → package segments (트리 그룹핑용)
  const ctrlBuckets: Array<{ filePath: string; segments: string[]; controller: ComponentNode }> = controllers.map(c => ({
    filePath: c.filePath,
    segments: extractPackageSegments(c.filePath),
    controller: c,
  }))

  const lcpLen = commonPrefixLen(ctrlBuckets.map(b => b.segments))
  const trimController = ctrlBuckets.every(b => {
    const last = b.segments[b.segments.length - 1]
    return b.segments.length > lcpLen && last !== undefined && /^controllers?$/i.test(last)
  })
  const lcpSegments = ctrlBuckets[0]?.segments.slice(0, lcpLen) ?? []
  const trimmed = ctrlBuckets.map(b => ({
    ...b,
    segments: b.segments.slice(lcpLen, trimController ? -1 : undefined),
  }))

  // Controller의 DI 체인 수집 (Less is More: edge 없으면 빈 체인 — placeholder도 안 그림)
  type DiChain = { svc?: ComponentNode | undefined; repo?: ComponentNode | undefined; svcEdge?: IREdge | undefined; repoEdge?: IREdge | undefined }
  const compById = new Map<string, ComponentNode>()
  for (const c of componentNodes) compById.set(c.id, c)
  // O(C × E) find → O(E + C) Map lookup
  const callsEdgesByFrom = new Map<string, IREdge[]>()
  for (const e of callsEdges) {
    const list = callsEdgesByFrom.get(e.from) ?? []
    list.push(e)
    callsEdgesByFrom.set(e.from, list)
  }
  const findCallEdge = (fromId: string, kindCheck: (name: string) => boolean): IREdge | undefined => {
    const candidates = callsEdgesByFrom.get(fromId) ?? []
    return candidates.find(e => {
      const target = compById.get(e.to)
      return target !== undefined && kindCheck(target.name)
    })
  }
  const chainByCtrl = new Map<string, DiChain>()
  for (const c of controllers) {
    const svcEdge = findCallEdge(c.id, isBeService)
    const svc = svcEdge !== undefined ? compById.get(svcEdge.to) : undefined
    let repoEdge: IREdge | undefined
    let repo: ComponentNode | undefined
    if (svc !== undefined) {
      repoEdge = findCallEdge(svc.id, isBeRepository)
      repo = repoEdge !== undefined ? compById.get(repoEdge.to) : undefined
    }
    chainByCtrl.set(c.id, { svc, repo, svcEdge, repoEdge })
  }
  // O(F²) find → O(1) lookup for walkFiles
  const ctrlByFilePath = new Map<string, ComponentNode>(trimmed.map(b => [b.filePath, b.controller]))

  const samePkg = (a: ComponentNode, b: ComponentNode): boolean => {
    const ap = compIdToPkg.get(a.id) ?? []
    const bp = compIdToPkg.get(b.id) ?? []
    return ap.length > 0 && ap.join('.') === bp.join('.')
  }

  const renderControllerLeaf = (ctrl: ComponentNode, indent: string): string[] => {
    const out: string[] = []
    const chain = chainByCtrl.get(ctrl.id)
    const hasAnyDi = chain !== undefined && (chain.svc !== undefined || chain.repo !== undefined)
    if (!hasAnyDi) {
      // R-T2.5: pure non-DI controller — leaf만 표시. (none) 추정 안 함.
      out.push(`${indent}${sanitizeId(ctrl.id)}["📄 ${ctrl.name}"]:::ssr`)
      return out
    }
    const diSgId = `di_${sanitizeId(ctrl.id)}`
    out.push(`${indent}subgraph ${diSgId}["[ DI ]"]`)
    out.push(`${indent}  direction TB`)
    const ctrlNode = `${sanitizeId(ctrl.id)}`
    out.push(`${indent}  ${ctrlNode}["${ctrl.name}"]:::ssr`)

    // Service slot (R-T2.4: cross-pkg일 때는 leaf 내부에 emit 안 하고 외부 edge로 처리)
    const svcCrossPkg = chain!.svc !== undefined && !samePkg(ctrl, chain!.svc)
    const svcInChain = chain!.svc !== undefined && !svcCrossPkg
    const svcId = svcInChain ? sanitizeId(chain!.svc!.id) : `${diSgId}__svc_none`
    if (svcInChain) {
      out.push(`${indent}  ${svcId}["${chain!.svc!.name}"]:::unk`)
    } else if (svcCrossPkg) {
      out.push(`${indent}  ${svcId}["(external Service)"]:::muted`)
    } else {
      out.push(`${indent}  ${svcId}["(no Service)"]:::muted`)
    }
    const ctrlToSvcArrow = chain!.svcEdge !== undefined && !svcCrossPkg ? edgeArrow(chain!.svcEdge) : '-.->'
    const ctrlToSvcLabel = svcCrossPkg ? '|"cross-pkg"|' : ''
    out.push(`${indent}  ${ctrlNode} ${ctrlToSvcArrow}${ctrlToSvcLabel} ${svcId}`)

    // Repository slot
    const repoCrossPkg = chain!.repo !== undefined && chain!.svc !== undefined && !samePkg(chain!.svc, chain!.repo)
    const repoInChain = chain!.repo !== undefined && !repoCrossPkg
    const repoId = repoInChain ? sanitizeId(chain!.repo!.id) : `${diSgId}__repo_none`
    if (repoInChain) {
      out.push(`${indent}  ${repoId}["${chain!.repo!.name}"]:::ssg`)
    } else if (repoCrossPkg) {
      out.push(`${indent}  ${repoId}["(external Repository)"]:::muted`)
    } else {
      out.push(`${indent}  ${repoId}["(no Repository)"]:::muted`)
    }
    const svcToRepoArrow = chain!.repoEdge !== undefined && !repoCrossPkg ? edgeArrow(chain!.repoEdge) : '-.->'
    const svcToRepoLabel = repoCrossPkg ? '|"cross-pkg"|' : ''
    out.push(`${indent}  ${svcId} ${svcToRepoArrow}${svcToRepoLabel} ${repoId}`)
    out.push(`${indent}end`)
    return out
  }

  const emitChunk = (chunkTree: PkgTreeNode, chunkPath: string[], headerSegs: string[]): string[] => {
    // HDR_PKG subgraph wrapper + dagre layout. v1.2.40 ELK mrtree pragma 제거 (Tab1과 동일 이유).
    // BE_RENDERING_INIT — DI 체인 간격 조밀.
    const lines: string[] = [BE_RENDERING_INIT, 'graph TD', CLASS_DEFS]
    const hdrOpen = buildPackageHeaderOpen(headerSegs)
    const isCluster = hdrOpen.length > 0
    lines.push(...hdrOpen)
    const rootId = isCluster ? 'HDR_PKG' : 'BE_ANCHOR'
    if (!isCluster) lines.push(`  ${rootId}["(root)"]:::hdr`)
    const treeEmit = emitTreeNodes(chunkTree, rootId, chunkPath, { clusterRoot: isCluster })
    lines.push(...treeEmit.lines)
    // Leaf Controllers: 부모 패키지 노드에서 leaf로 edge 연결.
    const walkFiles = (node: PkgTreeNode, parentId: string, pathSegs: string[], depth: number): void => {
      for (const [seg, child] of node.children) {
        const segs = [...pathSegs, seg]
        const pkgId = treeEmit.nodeIdByPath.get(segs.join('.')) ?? parentId
        walkFiles(child, pkgId, segs, depth + 1)
      }
      for (const f of node.files) {
        const ctrl = ctrlByFilePath.get(f.filePath)
        if (ctrl === undefined) continue
        lines.push(...renderControllerLeaf(ctrl, '  '))
        const chain = chainByCtrl.get(ctrl.id)
        const hasAnyDi = chain !== undefined && (chain.svc !== undefined || chain.repo !== undefined)
        const leafTargetId = hasAnyDi ? `di_${sanitizeId(ctrl.id)}` : sanitizeId(ctrl.id)
        if (!(isCluster && depth === 0)) {
          lines.push(`  ${parentId} --> ${leafTargetId}`)
        }
      }
    }
    walkFiles(chunkTree, rootId, chunkPath, 0)

    // R-T2.4 cross-pkg edge: leaf DI subgraph 안의 dashed 화살표에 인라인 라벨로 표시 (renderControllerLeaf 참조).
    // 외부 별도 edge 미emit — ghost-node 회피 + 중복 화살표 방지.
    lines.push(...buildPackageHeaderClose(headerSegs))
    return lines
  }

  // chunking: top-level 패키지 단위 (D2 — BE 내부에서 emit, L958 가드 유지)
  const filesTree = buildPkgTree(trimmed.map(b => ({ filePath: b.filePath, segments: b.segments, routes: [] })))
  const chunks = chunkByTopLevelPackage(filesTree)
  if (chunks.length <= 1) {
    return emitChunk(filesTree, [], lcpSegments).join('\n')
  }
  // 각 chunk header = LCP + topSeg. 트리는 topSeg children부터 시작 (R-T1.2 + R-T1.8: 중복 노드 제거)
  const parts = chunks.map(({ topSeg, subtree }) => {
    const headerSegs = topSeg === '_root' ? lcpSegments : [...lcpSegments, topSeg]
    const chunkPath = topSeg === '_root' ? [] : [topSeg]
    return emitChunk(subtree, chunkPath, headerSegs).join('\n')
  })
  return joinChunks(parts)
}
