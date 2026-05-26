import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  isRouteNode,
  isComponentNode,
  isTableNode,
  type IRGraph,
  type IREdge,
  type IRNode,
  type RouteNode,
  type ComponentNode,
  type IRGraphMetadata,
  type IRBackendService,
} from '@codebase-viz/types'
import { groupRoutesByUrl, type NestedGroup } from './url-grouper.js'
import {
  shouldChunk,
  chunkByGroups,
  joinChunks,
  CHUNK_SEPARATOR,
  DEFAULT_CHUNK_THRESHOLD,
  DEFAULT_NODE_THRESHOLD,
  type ChunkOptions,
} from './_shared/wrap-fallback.js'

function edgeArrow(edge: IREdge): string {
  return edge.confidence === 'inferred' ? '-.->' : '-->'
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_')
}

// ELK opt-in 폐기. v1.2.45 ELK INCLUDE_CHILDREN은 모든 level X축 강제로
// 규칙 B(leaf cluster 내부 Y축) 위반. webview console에서 ELK loader 메시지 미확인. dagre로 복귀.
// 규칙 A(sibling X축)는 buildNestedSubgraphLines + leaf 합성 노드 패턴(#16·#17)으로 dagre에서 직접 강제.
const RENDERING_INIT = `%%{init:{'theme':'base','themeVariables':{'background':'#060810','primaryColor':'#0c1a30','primaryTextColor':'#7dd3fc','primaryBorderColor':'#0e3a6e','edgeLabelBackground':'#0c1a30','lineColor':'#334155','secondaryColor':'#0f172a','clusterBkg':'#060c18','clusterBorder':'#1e3a5f','fontFamily':'JetBrains Mono','fontSize':'14'}}}%%`
// BE 전용 init — flowchart.nodeSpacing/rankSpacing 축소로 DI 체인 간격 조밀화. FE 다이어그램은 RENDERING_INIT 유지.
// Y축(rankSpacing) 1/3 축소. visible edge 영역(Tab2 DI 체인)은 정상 반영,
// invisible `~~~` link 영역(Tab1 endpoints)은 dagre가 별도 처리하므로 endpoints emit 로직에서 visible edge로 전환됨.
const BE_RENDERING_INIT = `%%{init:{'theme':'base','themeVariables':{'background':'#060810','primaryColor':'#0c1a30','primaryTextColor':'#7dd3fc','primaryBorderColor':'#0e3a6e','edgeLabelBackground':'#0c1a30','lineColor':'#334155','secondaryColor':'#0f172a','clusterBkg':'#060c18','clusterBorder':'#1e3a5f','fontFamily':'JetBrains Mono','fontSize':'14'},'flowchart':{'nodeSpacing':25,'rankSpacing':8,'padding':4}}}%%`

const CLASS_DEFS = [
  `  classDef ssr fill:#0d1a0d,stroke:#16a34a,color:#86efac`,
  `  classDef csr fill:#2d1200,stroke:#c2410c,color:#fb923c`,
  `  classDef ssg fill:#1a0d1a,stroke:#7c3aed,color:#c4b5fd`,
  `  classDef isr fill:#1a1a0d,stroke:#ca8a04,color:#fde047`,
  `  classDef ppr fill:#0d1a2d,stroke:#2563eb,color:#93c5fd`,
  `  classDef unk fill:#1a1a1a,stroke:#6b7280,color:#9ca3af`,
  `  classDef pkg fill:#0c1018,stroke:#475569,color:#cbd5e1`,
  `  classDef muted fill:#0a0d14,stroke:#374151,color:#64748b,stroke-dasharray: 3 3`,
  `  classDef hdr fill:#06080f,stroke:#1e3a5f,color:#7dd3fc`,
].join('\n')

function modeClass(mode: string): string {
  const map: Record<string, string> = {
    SSR: 'ssr', CSR: 'csr', SSG: 'ssg', ISR: 'isr', PPR: 'ppr',
  }
  return map[mode] ?? 'unk'
}

function getTopSection(routePath: string): string {
  const parts = routePath.split('/').filter(Boolean)
  if (parts.length === 0) return 'root'
  const first = parts[0]
  if (first === undefined) return 'root'
  return first.replace(/^\[/, '').replace(/\]$/, '') || 'root'
}

function collectNestedRoutes(groups: NestedGroup[]): RouteNode[] {
  const result: RouteNode[] = []
  for (const g of groups) {
    result.push(...g.routes)
    if (g.children.length > 0) result.push(...collectNestedRoutes(g.children))
  }
  return result
}

// 그룹 subgraph 안에서는 path가 그룹 prefix와 중복되어 노드 라벨이 길어진다 (Y/X 축 폭발).
// stripGroupPrefix로 prefix 제거 → 노드 width 감소 → mermaid가 한 row에 더 많은 노드 배치 가능.
function stripGroupPrefix(path: string, groupKey: string | undefined): string {
  if (groupKey === undefined || groupKey === '' || groupKey === '/') return path
  // path === groupKey면 leaf segment 반환 (예: '/agency/userMgmt' + groupKey '/agency/userMgmt' → 'userMgmt').
  // 표준 1 절대원칙(R-T1.2 "동일 Depth = X축, 라벨은 자기 노드 의미만")에 부합.
  // 단 leaf segment가 빈 문자열이면 path 유지 (인덱스 라우트 가드).
  if (path === groupKey) {
    const segs = path.split('/').filter(Boolean)
    return segs.length > 0 ? segs[segs.length - 1]! : path
  }
  if (path.startsWith(groupKey + '/')) return path.slice(groupKey.length + 1)
  return path
}

function renderingRouteLabel(r: RouteNode, ind: string, stripPrefix?: string): string {
  const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
  const methodPrefix = r.httpMethod !== undefined ? `${r.httpMethod} ` : ''
  const displayPath = stripGroupPrefix(r.path, stripPrefix)
  return `${ind}${sanitizeId(r.id)}["${methodPrefix}${displayPath} · ${badge}"]:::${modeClass(r.renderingMode)}`
}

// Subgraph ID는 group.groupKey 전체에서 파생 → 다른 module의 동일 leaf segment(예: /admin/users vs /order/users)
// 가 같은 USERS_G로 충돌해 mermaid가 단일 subgraph로 합치는 사고 방지.
function groupSubgraphId(groupKey: string): string {
  const segs = groupKey.split('/').filter(Boolean)
  if (segs.length === 0) return 'ROOT_G'
  return sanitizeId(segs.join('_').toUpperCase()) + '_G'
}

// buildNestedSubgraphLines는 children 사이 chain만 emit한다.
// 호출자(buildRenderingDiagram, buildFeFileTreeScreenDiagram)가 top-level group이 2개 이상이면
// 자체적으로 chain emit해야 한다 — outer wrapper(BROWSER/ROUTER/REACT) 안의 sibling top-level은
// outer wrapper도 outer wrapper 안 sibling 자동 가로배치를 못 함 (mermaid v11 dagre).
function emitTopLevelSiblingChain(groups: NestedGroup[], indent: string): string | undefined {
  if (groups.length < 2) return undefined
  const ids: string[] = []
  for (const g of groups) {
    const segs = g.groupKey.split('/').filter(Boolean)
    if (segs.length === 0) continue
    // FE 표준 v1.1 (R-T1.2 amendment): 평탄화된 leaf 자식은 subgraph 없이 route node로 emit됨.
    // chain 참조도 route node ID 사용해야 phantom subgraph 노드 생성 안 됨.
    const leafSeg = segs[segs.length - 1]!
    const isDyn = /^\[.+\]$/.test(leafSeg) || leafSeg.startsWith(':')
    const isGrp = /^\(.+\)$/.test(leafSeg)
    if (g.children.length === 0 && g.routes.length === 1 && !isDyn && !isGrp) {
      ids.push(sanitizeId(g.routes[0]!.id))
    } else {
      ids.push(groupSubgraphId(g.groupKey))
    }
  }
  if (ids.length < 2) return undefined
  return `${indent}${ids.join(' ~~~ ')}`
}

// Emit nested Mermaid subgraphs from NestedGroup[]. Used by buildRenderingDiagram and buildCombinedDiagram.
// FE 표준 v1.1 (R-T1.2 amendment, 2026-05-23): mermaid v11은 nested subgraph 내부 자식들의 LR direction을
// 보장하지 못한다(webview 실측 입증). top-level 형제 X축 보장은 outer wrapper 안 chain emit으로 처리하고,
// nested 자식은 Y축 stack을 기본 표준으로 한다. 본 함수의 `~~~` chain emit은 top-level X축 보장용이며,
// nested level에서 chain이 X축으로 작동하는 케이스가 있어도 표준 약속에 포함하지 않는다 (보너스 효과).
function buildNestedSubgraphLines(groups: NestedGroup[], indent: string, parentGroupKey?: string): string[] {
  const lines: string[] = []
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) lines.push(renderingRouteLabel(r, indent))
      if (group.children.length > 0) lines.push(...buildNestedSubgraphLines(group.children, indent, parentGroupKey))
    } else if (
      group.children.length === 0 &&
      group.routes.length === 1 &&
      !/^\[.+\]$/.test(leafSeg) &&
      !leafSeg.startsWith(':') &&
      !/^\(.+\)$/.test(leafSeg)
    ) {
      // FE 표준 v1.1 (R-T1.2 amendment): 단일 route + 자식 0개 + dynamic/group route 아닌 leaf는 wrapper 중복.
      // route node만 부모 indent로 emit하여 의미 없는 leaf subgraph 제거. R-T1.3·R-T1.4는 보존.
      // parentGroupKey 있으면 stripPrefix 적용(부모 라벨과 prefix 중복 회피). root level은 full path 유지.
      lines.push(renderingRouteLabel(group.routes[0]!, indent, parentGroupKey))
    } else {
      const sgId = groupSubgraphId(group.groupKey)
      const label = sectionLabel(leafSeg)
      lines.push(`${indent}subgraph ${sgId}["${label}"]`)
      lines.push(...emitInnerRowSubgraphs(i2, sgId, group.routes.length,
        (i, ind) => renderingRouteLabel(group.routes[i]!, ind, group.groupKey)))
      if (group.children.length > 0) {
        lines.push(...buildNestedSubgraphLines(group.children, i2, group.groupKey))
      }
      lines.push(`${indent}end`)
      // FE 표준 v1.1: children >= 2면 형제 ID들을 ~~~ chain으로 연결 (top-level은 X축 보장, nested는 보너스).
      // chain은 cluster 끝(end) 직후, 즉 조부모 indent에 위치 — 부모 cluster 안에 두면 mermaid v11이 무시.
      // 평탄화된 leaf 자식(R-T1.2 v1.1)은 subgraph 없이 route node로 emit되므로 chain ID도 route node ID 사용.
      if (group.children.length >= 2) {
        const childIds = group.children.map(c => {
          const cLeaf = c.groupKey.split('/').filter(Boolean).pop() ?? ''
          const isDyn = /^\[.+\]$/.test(cLeaf) || cLeaf.startsWith(':')
          const isGrp = /^\(.+\)$/.test(cLeaf)
          if (c.children.length === 0 && c.routes.length === 1 && !isDyn && !isGrp) {
            return sanitizeId(c.routes[0]!.id)
          }
          return groupSubgraphId(c.groupKey)
        }).join(' ~~~ ')
        lines.push(`${indent}${childIds}`)
      }
    }
  }
  return lines
}

const SECTION_EMOJI: Record<string, string> = {
  root: '🏠',
  blog: '📝',
  project: '📁',
  projects: '📁',
  contact: '📬',
  admin: '⚙',
  auth: '🔐',
  about: '👤',
  api: '⚡',
}

function sectionLabel(key: string): string {
  const emoji = SECTION_EMOJI[key] ?? '📄'
  return `${emoji} /${key}`
}

interface InfraInfo {
  hasNextjs: boolean
  hasVite: boolean
  hasExpo: boolean
  hasReactRouter: boolean
  hasVueSpa: boolean
  hasAngular: boolean
  hasSupabase: boolean
  hasDexie: boolean
  hasPrisma: boolean
  hasFirebase: boolean
}

function metadataToInfra(meta?: IRGraphMetadata): InfraInfo {
  if (meta === undefined) {
    return { hasNextjs: false, hasVite: false, hasExpo: false, hasReactRouter: false, hasVueSpa: false, hasAngular: false, hasSupabase: false, hasDexie: false, hasPrisma: false, hasFirebase: false }
  }
  const fw = meta.framework.toLowerCase()
  return {
    hasNextjs: fw === 'nextjs-app-router' || fw === 'nextjs-pages' || fw.startsWith('next'),
    hasVite: fw === 'vite-react',
    hasExpo: fw === 'expo' || meta.deployTarget === 'mobile',
    hasReactRouter: fw === 'react-router',
    hasVueSpa: fw === 'vue-spa',
    hasAngular: fw === 'angular',
    hasSupabase: meta.hasSupabase,
    hasDexie: meta.hasDexie,
    hasPrisma: meta.hasPrisma,
    hasFirebase: meta.hasFirebase,
  }
}

// ST2: file-based 라우팅 어댑터(파일 경로 = URL 또는 파일 위치에 URL 의미 인코딩)
// Tab2에 라우트 → 디렉터리·파일명 노드 패턴을 적용할 수 있는 어댑터 화이트리스트.
// config-based(react-router/vue-spa/angular)는 라우트=명시 매핑이지만
// react-router → v1.2.44 vue-spa·angular에서 component 참조 추적으로 filePath를
// 컴포넌트 파일로 치환하여 동일 패턴 적용 (각 어댑터 route-parser.ts A1-1·A1-2 변경).
function isFileTreeTab2Eligible(meta?: IRGraphMetadata): boolean {
  if (meta === undefined) return false
  const fw = meta.framework.toLowerCase()
  return fw === 'nextjs-app-router' || fw === 'nextjs-pages' || fw === 'nuxt' ||
    fw === 'sveltekit' || fw === 'remix' || fw === 'react-router' ||
    fw === 'vue-spa' || fw === 'angular'
}

const GROUPS_PER_ROW = 5
// Tab2는 section당 8+ 컴포넌트를 가질 수 있어, 동일 row 내 section 수를 제한한다.
// nested comp subgraph 방식에서 section 1개 ≈ 580px, 2개 ≈ 1200px → 2개가 안전 상한.
const TAB2_GROUPS_PER_ROW = 2
// routes < N 이면 chunked path를 발동시키지 않음.
// 작은 프로젝트(28 routes / 7 top-level)도 group 수가 GROUPS_PER_ROW(5)를 넘기면
// chunked → viewer row-mode Y축 단조 나열되는 문제 회피. mermaid는 100+ nodes nested
// subgraph도 단일 다이어그램으로 충분히 처리 가능. 200+ routes stress test(modules=10)는
// routeCount > 100으로 게이트 통과 → chunked 유지하여 회귀 방지.
const SINGLE_DIAGRAM_ROUTE_THRESHOLD = 100
// Y축 폭발 방지: subgraph 안 노드 수가 임계값을 넘으면 N개씩 invisible inner subgraph로 묶어
// 행 줄넘김을 강제한다 (X축 GROUPS_PER_ROW와 대칭 정책).
const NODES_PER_INNER_ROW = 5

function emitInnerRowSubgraphs(
  indent: string,
  outerId: string,
  itemCount: number,
  emitItem: (i: number, ind: string) => string,
): string[] {
  if (itemCount <= NODES_PER_INNER_ROW) {
    const out: string[] = []
    for (let i = 0; i < itemCount; i++) out.push(emitItem(i, indent))
    return out
  }
  const lines: string[] = []
  const i2 = indent + '  '
  let row = 0
  for (let i = 0; i < itemCount; i += NODES_PER_INNER_ROW) {
    const rowId = `${outerId}_R${row}`
    lines.push(`${indent}subgraph ${rowId} [" "]`)
    lines.push(`${i2}direction LR`)
    const end = Math.min(i + NODES_PER_INNER_ROW, itemCount)
    for (let j = i; j < end; j++) lines.push(emitItem(j, i2))
    lines.push(`${indent}end`)
    lines.push(`${indent}style ${rowId} fill:none,stroke:none`)
    row++
  }
  return lines
}

// Descend past single-child transit nodes (e.g. /api → /api/v1) to the first real branching level.
// Stops if the single node has its own routes (to avoid silently dropping them).
function findBranchingGroups(groups: NestedGroup[]): NestedGroup[] {
  if (groups.length !== 1) return groups
  const [single] = groups
  if (single === undefined || single.children.length === 0 || single.routes.length > 0) return groups
  return findBranchingGroups(single.children)
}

function chunkGroups<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

// Row 다이어그램(chunked 경로): NestedGroup tree를 그대로 보존하여 nested subgraph emit.
// 이전: collectNestedRoutes로 평면화 → 재귀 그룹핑 결과 폐기 → /api 안에 100+ 형제 평면 배치 → mermaid 세로 압축
// buildNestedSubgraphLines 재사용 → /api → /v1 → /admin → /users 식 depth 보존 → leaf subgraph 노드 수 자연 감소
function buildRouteRowDiagram(groups: NestedGroup[]): string {
  // FE chunked 경로도 graph LR (표준 1 형제 X축 배치, 단일 chunk 안에 여러 형제 가능).
  const lines = [RENDERING_INIT, 'graph LR', CLASS_DEFS]
  lines.push(...buildNestedSubgraphLines(groups, '  '))
  return lines.join('\n')
}

// Tab2 nested subgraph emit. v1.1.6: NestedGroup tree 보존하여 chunked 경로에서도 재귀 그룹핑 유지.
// 각 group의 routes를 그 group subgraph 안에 배치 + 그 group의 routes에 연결된 comp들을 nested comp subgraph로 추가.
// comp first-claim: 같은 comp가 여러 group route에 연결되면 첫 group이 owner, 나머지는 edge만.
function buildScreenSubgraphLines(
  groups: NestedGroup[],
  indent: string,
  routeToComps: Map<string, string[]>,
  rendersEdges: IREdge[],
  connectedComponents: ComponentNode[],
  compNodeRendered: Set<string>,
  allEdges: string[],
): string[] {
  const lines: string[] = []
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) {
        const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
        lines.push(`${indent}${sanitizeId(r.id)}["${r.path} · ${badge}"]:::${modeClass(r.renderingMode)}`)
      }
      if (group.children.length > 0) {
        lines.push(...buildScreenSubgraphLines(group.children, indent, routeToComps, rendersEdges, connectedComponents, compNodeRendered, allEdges))
      }
      continue
    }
    const sgId = groupSubgraphId(group.groupKey).replace(/_G$/, '_S')
    lines.push(`${indent}subgraph ${sgId}["${sectionLabel(leafSeg)}"]`)
    lines.push(...emitInnerRowSubgraphs(i2, sgId, group.routes.length, (i, ind) => {
      const r = group.routes[i]!
      const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
      const displayPath = stripGroupPrefix(r.path, group.groupKey)
      return `${ind}${sanitizeId(r.id)}["${displayPath} · ${badge}"]:::${modeClass(r.renderingMode)}`
    }))

    const compsInGroup: string[] = []
    for (const r of group.routes) {
      const comps = routeToComps.get(r.id) ?? []
      for (const compId of comps) {
        const edge = rendersEdges.find(e => e.from === r.id && e.to === compId)
        if (edge !== undefined) {
          allEdges.push(`  ${sanitizeId(r.id)} ${edgeArrow(edge)} ${sanitizeId(compId)}`)
        }
        if (compNodeRendered.has(compId)) continue
        compNodeRendered.add(compId)
        const comp = connectedComponents.find(c => c.id === compId)
        if (comp === undefined) continue
        const label = comp.runtime === 'client' ? `${comp.name} [CSR]` : comp.name
        compsInGroup.push(`${sanitizeId(comp.id)}["${label}"]`)
      }
    }
    if (compsInGroup.length > 0) {
      const compSgId = sgId + '_C'
      lines.push(`${i2}subgraph ${compSgId}`)
      lines.push(...emitInnerRowSubgraphs(i2 + '  ', compSgId, compsInGroup.length,
        (i, ind) => `${ind}${compsInGroup[i]!}`))
      lines.push(`${i2}end`)
    }

    // T4: Tab2도 자식 subgraph가 GROUPS_PER_ROW 초과 시 invisible row 래퍼 + direction LR.
    // mermaid v11 명세: 외부 edge는 immediate parent subgraph의 direction만 무시. ROW wrapper는
    // ancestor이므로 direction LR 유효 → 사용자 요구("부모 안에서 자식 가로") 충족.
    if (group.children.length > 0) {
      if (group.children.length <= GROUPS_PER_ROW) {
        lines.push(...buildScreenSubgraphLines(group.children, i2, routeToComps, rendersEdges, connectedComponents, compNodeRendered, allEdges))
      } else {
        const i3 = i2 + '  '
        const rowChunks = chunkGroups(group.children, GROUPS_PER_ROW)
        rowChunks.forEach((chunk, rowIdx) => {
          const rowId = `${sgId}_CR${rowIdx}`
          lines.push(`${i2}subgraph ${rowId} [" "]`)
          lines.push(`${i3}direction LR`)
          lines.push(...buildScreenSubgraphLines(chunk, i3, routeToComps, rendersEdges, connectedComponents, compNodeRendered, allEdges))
          lines.push(`${i2}end`)
          lines.push(`${i2}style ${rowId} fill:none,stroke:none`)
        })
      }
    }
    lines.push(`${indent}end`)
  }
  return lines
}

function renderScreenSection(
  routeGroups: NestedGroup[],
  allRendersEdges: IREdge[],
  importsEdges: IREdge[],
  allComponentNodes: ComponentNode[],
): string {
  const pageRoutes = collectNestedRoutes(routeGroups)
  const pageRouteIds = new Set(pageRoutes.map(r => r.id))
  const rowRendersEdges = allRendersEdges.filter(e => pageRouteIds.has(e.from))
  const connectedCompIds = new Set(rowRendersEdges.map(e => e.to))
  const connectedComponents = allComponentNodes.filter(c => connectedCompIds.has(c.id))

  const routeToComps = new Map<string, string[]>()
  for (const edge of rowRendersEdges) {
    if (!connectedCompIds.has(edge.to)) continue
    const list = routeToComps.get(edge.from) ?? []
    list.push(edge.to)
    routeToComps.set(edge.from, list)
  }

  const lines: string[] = [RENDERING_INIT, 'graph TB', CLASS_DEFS]
  const compNodeRendered = new Set<string>()
  const allEdges: string[] = []

  lines.push(...buildScreenSubgraphLines(routeGroups, '  ', routeToComps, rowRendersEdges, connectedComponents, compNodeRendered, allEdges))

  for (const e of allEdges) lines.push(e)

  const connectedIdSet = new Set(connectedComponents.map(c => c.id))
  for (const edge of importsEdges) {
    if (connectedIdSet.has(edge.from) && connectedIdSet.has(edge.to)) {
      lines.push(`  ${sanitizeId(edge.from)} ${edgeArrow(edge)} ${sanitizeId(edge.to)}`)
    }
  }

  if (pageRoutes.length === 0 && connectedComponents.length === 0) {
    lines.push('  empty["(no screen/component data)"]')
  }

  return lines.join('\n')
}

// Path-segment-aware longest common prefix.
// Finds the longest shared URL prefix (up to segment boundaries).
// Single path: strips the last segment (leaf endpoint) to return its parent prefix.
function pathSegmentLcp(paths: string[]): string {
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
function extractPackageSegments(filePath: string): string[] {
  const normalized = filePath.replace(/\\/g, '/')
  const javaMatch = normalized.match(/^(?:.*\/)?src\/main\/(?:java|kotlin)\/(.+)$/)
  const after = javaMatch !== null ? (javaMatch[1] ?? normalized) : normalized
  const segments = after.split('/').filter(Boolean)
  if (segments.length > 0) segments.pop()
  return segments
}

function commonPrefixLen(segArrays: string[][]): number {
  if (segArrays.length === 0) return 0
  const minLen = Math.min(...segArrays.map(a => a.length))
  let i = 0
  for (; i < minLen; i++) {
    const seg = segArrays[0]?.[i]
    if (seg === undefined || !segArrays.every(a => a[i] === seg)) break
  }
  return i
}

type PkgTreeNode = {
  children: Map<string, PkgTreeNode>
  files: Array<{ filePath: string; routes: RouteNode[] }>
}

function buildPkgTree(
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

// ST1: 트리 인프라 헬퍼 — BE Tab1/Tab2 표준 (graph TD, node+edge tree, R-T1.4 / R-T2.1)
// 패키지 segment = `pkg_<sanitized>` 노드, 부모-자식 = `-->` edge.
// HDR_PKG를 일반 노드 → subgraph wrapper로 변경. elk.mrtree가 일반 노드 root에서
// children을 cluster 밖으로 배치하는 결함 해소. cluster 외곽이 모든 자식 트리를 강제 포함.
function buildPackageHeaderOpen(lcpSegments: string[]): string[] {
  if (lcpSegments.length === 0) return []
  const label = `📁 src/main/java/${lcpSegments.join('.')}`
  return [`  subgraph HDR_PKG ["${label}"]`, '    direction TB']
}

function buildPackageHeaderClose(lcpSegments: string[]): string[] {
  if (lcpSegments.length === 0) return []
  return ['  end']
}

type TreeEmit = {
  lines: string[]
  // pkg path segments joined by '.' → sanitized node id. Used by leaf emitters to wire edges.
  nodeIdByPath: Map<string, string>
}

// 패키지 트리에서 node+edge만 emit. leaf(파일) 노드는 별도 emitter에서 처리하고 wiring만 책임진다.
// rootLabel: 헤더 노드 없이 단일 트리일 때 root segment를 안 그릴 수 있도록 'BE_ROOT' 기본
// clusterRoot=true 시 첫 depth edge 생략. HDR_PKG subgraph wrapper가 자식 트리 외곽선 역할.
// (mrtree에 invisible link `~~~`도 시도했으나 mrtree가 이를 무력화 → cluster 어긋남 재발. mrtree pragma는 BE에서 제거됨.)
function emitTreeNodes(
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
// 각 chunk = { topSeg, subtree } — 호출자가 헤더+트리+leaf를 한 chunk로 emit.
// R-T1.8 (Tab1) / R-T2.1 (Tab2) chunk gate.
function chunkByTopLevelPackage(
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

// ST3: BE Tab1 = 패키지 트리(node+edge) + leaf = 📄 Controller [/api/prefix] + endpoint subgraph.
// 표준: docs/design/BE-DIAGRAM-STANDARD.md §2 (R-T1.1~9).
// - 트리: emitTreeNodes (R-T1.4) — outer BE_ROOT subgraph 폐기 (D7)
// - 헤더: 📁 src/main/java/com.<lcp> annotation 노드 (R-T1.2)
// - suffix strip: 마지막 segment가 controller(s)면 strip (R-T1.3)
// - leaf: 📄 ControllerName [URL prefix] (R-T1.5)
// - endpoints: leaf 옆 endpoints_<Ctrl> subgraph, METHOD /suffix만 (R-T1.6)
// - chunk: chunkByTopLevelPackage (R-T1.8)
function emitControllerFileLeaf(
  indent: string,
  filePath: string,
  routes: RouteNode[],
): { leafId: string; lines: string[] } {
  const controllerName = path.basename(filePath, path.extname(filePath))
  const safeName = sanitizeId(controllerName)
  const prefix = pathSegmentLcp(routes.map(r => r.path))
  const titleSuffix = prefix !== '' ? ` [${prefix}]` : ''
  const leafId = `leaf_${safeName}`
  const epSgId = `endpoints_${safeName}`
  const lines: string[] = []
  lines.push(`${indent}${leafId}["📄 ${controllerName}${titleSuffix}"]:::ssr`)
  if (routes.length === 0) return { leafId, lines }
  const routeIds = routes.map(r => sanitizeId(r.id))
  const routeLines: string[] = []
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]!
    const suffix = prefix !== '' && r.path.startsWith(prefix)
      ? (r.path.slice(prefix.length) || '/')
      : r.path
    const methodPrefix = r.httpMethod !== undefined ? `${r.httpMethod} ` : ''
    routeLines.push(`${methodPrefix}${suffix}`)
  }

  // BE-DIAGRAM-STANDARD R-T1.6 (endpoints = subgraph). mermaid v11 nested subgraph 내부 노드 Y간격은
  // init/initialize 옵션으로 통제 불가 — deferred to v1.3.x BE Phase 2.
  lines.push(`${indent}subgraph ${epSgId}["endpoints"]`)
  lines.push(`${indent}  direction TB`)
  for (let i = 0; i < routes.length; i++) {
    lines.push(`${indent}  ${routeIds[i]}["${routeLines[i]}"]:::ssr`)
  }
  for (let i = 0; i < routeIds.length - 1; i++) {
    lines.push(`${indent}  ${routeIds[i]} --- ${routeIds[i + 1]}`)
  }
  lines.push(`${indent}end`)
  lines.push(`${indent}${leafId} --> ${epSgId}`)
  return { leafId, lines }
}

function buildBeRenderingDiagram(graph: IRGraph): string {
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
    // Leaf 파일: 부모 패키지 노드에 leaf controller 연결. cluster root의 직접 leaf는 cluster 내부 노드로 정의되고 edge 생략 (HDR_PKG wrapper가 외곽).
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

function buildRenderingDiagram(graph: IRGraph): string {
  if (graph.metadata?.adapterCategory === 'BE') return buildBeRenderingDiagram(graph)

  const infra = metadataToInfra(graph.metadata)
  // Only page routes — skip loading, layout, error, template, route-handler (same as Tab 2)
  const routeNodes = graph.nodes.filter(isRouteNode).filter(r => r.routeFileKind === 'page')
  if (routeNodes.length === 0) return 'graph TD\n  empty["(no routes found)"]'

  const routeGroups = groupRoutesByUrl(routeNodes)
  const branchingGroups = findBranchingGroups(routeGroups)
  if (
    branchingGroups.length > GROUPS_PER_ROW &&
    routeNodes.length > SINGLE_DIAGRAM_ROUTE_THRESHOLD
  ) {
    // 1 top-level branch = 1 chunk (의미 단위 청크).
    // routeCount 게이트 추가 — 작은 프로젝트는 single-diagram로 유지.
    return joinChunks(branchingGroups.map(g => buildRouteRowDiagram([g])))
  }

  const tableNodes = graph.nodes.filter(isTableNode)
  const hasDirectDB = infra.hasSupabase || infra.hasDexie || infra.hasPrisma || infra.hasFirebase
  const hasExternalAPI = tableNodes.length > 0 && !hasDirectDB
  const backends = graph.metadata?.backends ?? []
  const allCSR = routeNodes.length > 0 && routeNodes.every(r => r.renderingMode === 'CSR')

  // (Playwright 검증): FE Tab1은 outer `graph LR` 사용.
  // 표준 1 R-T1.2 "동일 Depth = X축"을 mermaid가 형제 subgraph 자동 가로 배치로 충족.
  // 외부 edge가 어느 컨테이너에 incoming해도 LR이 영향받지 않음 (TD + nested direction LR은 무시됨).
  const lines: string[] = [RENDERING_INIT, 'graph LR', CLASS_DEFS]

  // ── 1. FRONTEND LAYER ────────────────────────────────────────────────────
  // frontendRef: outermost wrapper subgraph ID — 외부 data layer edge source.
  // mermaid v11 공식 명세 "subgraph 노드 중 하나라도 외부 edge 가지면
  // 그 subgraph direction 무시"에 따라, 외부 edge는 반드시 *outermost* wrapper에서 발사해야
  // inner sub-cluster의 direction(LR + ~~~ chain)이 보존됨. middle/inner wrapper(REACT, VUE 등)에서
  // 외부 edge 발사하면 부모 direction 상속 연쇄로 top-level sibling이 Y축 stack됨.
  let frontendRef: string | undefined
  if (infra.hasNextjs && !allCSR) {
    frontendRef = 'INFRA'
    lines.push(`  subgraph INFRA["☁ VERCEL · Edge Network"]`)
    lines.push(`    subgraph RUNTIME["⚙ Node.js · Server Runtime"]`)
    lines.push(`      subgraph FRAMEWORK["▲ Next.js · App Router"]`)
    lines.push(`        subgraph REACT["⚛ React · SSR Engine"]`)
    // SSR_FETCH 더미 노드 제거 — REACT subgraph 내부 노드가 외부 edge 가지면
    // REACT direction이 무력화되어 top-level sibling Y축 회귀. 외부 edge는 frontendRef(INFRA)에서 발사.
    for (const l of buildNestedSubgraphLines(routeGroups, '          ')) lines.push(l)
    const topChainSsr = emitTopLevelSiblingChain(routeGroups, '          ')
    if (topChainSsr !== undefined) lines.push(topChainSsr)

    lines.push('        end\n      end\n    end\n  end')
  } else if (infra.hasNextjs && allCSR) {
    frontendRef = 'BROWSER'
    lines.push(`  subgraph BROWSER["🌐 Browser · Client-Side App"]`)
    lines.push(`    subgraph FRAMEWORK["▲ Next.js · App Router"]`)
    lines.push(`      subgraph REACT["⚛ React · CSR Engine"]`)
    for (const l of buildNestedSubgraphLines(routeGroups, '        ')) lines.push(l)
    const topChainCsr = emitTopLevelSiblingChain(routeGroups, '        ')
    if (topChainCsr !== undefined) lines.push(topChainCsr)

    lines.push('      end\n    end\n  end')
  } else if (infra.hasVite) {
    // Vite는 화면 프레임워크가 아닌 빌드 도구. framework='vite-react'(LLM-only)인 SPA용 Tab1 메타 표현.
    // Vite + React + react-router 조합은 react-router 어댑터 분기가 우선됨(stack-detector 우선순위).
    frontendRef = 'BROWSER'
    lines.push(`  subgraph BROWSER["🌐 Browser · Client-Side App"]`)
    lines.push(`    subgraph BUNDLER["⚡ Vite · Dev/Build"]`)
    lines.push(`      subgraph REACT["⚛ React · CSR Engine"]`)
    for (const l of buildNestedSubgraphLines(routeGroups, '        ')) lines.push(l)
    const topChainVite = emitTopLevelSiblingChain(routeGroups, '        ')
    if (topChainVite !== undefined) lines.push(topChainVite)

    lines.push('      end\n    end\n  end')
  } else if (infra.hasExpo) {
    // Expo는 화면 프레임워크가 아닌 RN 모바일 플랫폼. framework='expo'(LLM-only) 또는 deployTarget='mobile' Tab1 메타.
    // 실제 화면은 React Native 컴포넌트. 정적 어댑터 미등록 — routes는 LLM 결과로만 채워짐.
    frontendRef = 'MOBILE'
    lines.push(`  subgraph MOBILE["📱 Mobile · iOS / Android"]`)
    lines.push(`    subgraph RN["⚛ React Native · Expo"]`)
    for (const l of buildNestedSubgraphLines(routeGroups, '      ')) lines.push(l)
    const topChainExpo = emitTopLevelSiblingChain(routeGroups, '      ')
    if (topChainExpo !== undefined) lines.push(topChainExpo)

    lines.push('    end\n  end')
  } else if (infra.hasReactRouter) {
    frontendRef = 'BROWSER'
    lines.push(`  subgraph BROWSER["🌐 Browser · Client-Side App"]`)
    lines.push(`    subgraph ROUTER["🧭 React Router · SPA"]`)
    lines.push(`      subgraph REACT["⚛ React · CSR Engine"]`)
    for (const l of buildNestedSubgraphLines(routeGroups, '        ')) lines.push(l)
    const topChainRR = emitTopLevelSiblingChain(routeGroups, '        ')
    if (topChainRR !== undefined) lines.push(topChainRR)

    lines.push('      end\n    end\n  end')
  } else if (infra.hasVueSpa) {
    frontendRef = 'BROWSER'
    lines.push(`  subgraph BROWSER["🌐 Browser · Client-Side App"]`)
    lines.push(`    subgraph ROUTER["🧭 Vue Router · SPA"]`)
    lines.push(`      subgraph VUE["💚 Vue · CSR Engine"]`)
    for (const l of buildNestedSubgraphLines(routeGroups, '        ')) lines.push(l)
    const topChainVue = emitTopLevelSiblingChain(routeGroups, '        ')
    if (topChainVue !== undefined) lines.push(topChainVue)

    lines.push('      end\n    end\n  end')
  } else if (infra.hasAngular) {
    frontendRef = 'BROWSER'
    lines.push(`  subgraph BROWSER["🌐 Browser · Client-Side App"]`)
    lines.push(`    subgraph ROUTER["🧭 Angular Router · SPA"]`)
    lines.push(`      subgraph ANGULAR["🅰 Angular · CSR Engine"]`)
    for (const l of buildNestedSubgraphLines(routeGroups, '        ')) lines.push(l)
    const topChainAng = emitTopLevelSiblingChain(routeGroups, '        ')
    if (topChainAng !== undefined) lines.push(topChainAng)

    lines.push('      end\n    end\n  end')
  } else {
    for (const l of buildNestedSubgraphLines(routeGroups, '  ')) lines.push(l)
    const topChainBare = emitTopLevelSiblingChain(routeGroups, '  ')
    if (topChainBare !== undefined) lines.push(topChainBare)
  }

  // ── 2. DATA / BACKEND LAYER (always outside frontend, unconditional) ─────
  if (backends.length > 0) {
    // Detailed backend from LLM analysis (monorepo / explicit backend detected)
    for (let i = 0; i < backends.length; i++) {
      const be = backends[i]!
      const beId = `BACKEND_${i}`
      const dbId = `DB_${i}`
      const dbLabel = be.dbType === 'postgresql' ? '🐘 PostgreSQL' :
                      be.dbType === 'mysql' ? '🐬 MySQL' :
                      be.dbType === 'mongodb' ? '🍃 MongoDB' : '🗄 Database'
      const visibleMods = (be.modules ?? []).slice(0, 8)
      const extraModCount = (be.modules ?? []).length - visibleMods.length
      lines.push(`  subgraph ${beId}["⚙ ${be.name} · ${be.framework}"]`)
      if (visibleMods.length > 0) {
        lines.push(`    subgraph MODULES_${i}["Core Modules"]`)
        for (const mod of visibleMods) {
          lines.push(`      ${sanitizeId(mod)}_${i}["${mod}"]`)
        }
        if (extraModCount > 0) lines.push(`      MORE_${i}["+ ${extraModCount} more"]`)
        lines.push('    end')
      }
      lines.push(`    ${dbId}[("${dbLabel}")]`)
      if (visibleMods.length > 0) {
        for (const mod of visibleMods) {
          lines.push(`    ${sanitizeId(mod)}_${i} --> ${dbId}`)
        }
      }
      lines.push('  end')
      if (frontendRef !== undefined) lines.push(`  ${frontendRef} -.->|"REST"| ${beId}`)
    }
  } else if (infra.hasSupabase) {
    // fetchSrc도 frontendRef(outermost wrapper) 사용 — middle wrapper에서 외부 edge 발사 금지.
    const fetchSrc = frontendRef ?? 'BROWSER'
    lines.push(`  subgraph DATALAYER["🗄 DATA LAYER"]`)
    lines.push(`    subgraph SUPABASE_G["⚡ Supabase · BaaS"]`)
    lines.push(`      PG_SB[("PostgreSQL")]`)
    if (infra.hasNextjs && !allCSR) lines.push(`      SB_AUTH["Auth · OAuth"]`)
    lines.push('    end\n  end')
    if (frontendRef !== undefined) lines.push(`  ${fetchSrc} -.->|"supabase-js"| PG_SB`)
  } else if (infra.hasDexie) {
    lines.push(`  subgraph LOCALDATA["💾 LOCAL DATA LAYER"]`)
    lines.push(`    subgraph DEXIE_G["📦 Dexie.js · IndexedDB"]`)
    lines.push(`      IDB[("IndexedDB")]`)
    lines.push('    end\n  end')
    if (frontendRef !== undefined) lines.push(`  ${frontendRef} -.->|"dexie"| IDB`)
  } else if (infra.hasFirebase) {
    lines.push(`  subgraph DATALAYER["🔥 DATA LAYER"]`)
    lines.push(`    subgraph FIREBASE_G["Firebase · BaaS"]`)
    lines.push(`      FS[("Firestore")]`)
    lines.push('    end\n  end')
    if (frontendRef !== undefined) lines.push(`  ${frontendRef} -.->|"firebase"| FS`)
  } else if (infra.hasPrisma) {
    lines.push(`  subgraph DATALAYER["🗄 DATA LAYER"]`)
    lines.push(`    subgraph PRISMA_G["Prisma ORM"]`)
    lines.push(`      PG_DB[("Database")]`)
    lines.push('    end\n  end')
    if (frontendRef !== undefined) lines.push(`  ${frontendRef} -.->|"prisma"| PG_DB`)
  } else if (hasExternalAPI) {
    lines.push(`  subgraph DATALAYER["🔌 API LAYER"]`)
    lines.push(`    subgraph API_G["⚡ REST API · Backend"]`)
    lines.push(`      API_SVC[("Backend Service")]`)
    lines.push('    end\n  end')
    if (frontendRef !== undefined) lines.push(`  ${frontendRef} -.->|"REST"| API_SVC`)
  } else {
    // ST1: FE 어댑터에서 axios/fetch/react-query 호출(api-call edges)이 감지됐고
    // 위 모든 데이터 레이어 분기(backends/Supabase/Dexie/Firebase/Prisma/hasExternalAPI)에 해당 없으면
    // 외부 REST API Gateway 노드를 표시. React Router SPA + 다른 SPA들이 주 대상.
    // LLM enabled에서 backends가 채워지면 line 765의 `if backends.length > 0` 분기가 우선이라 충돌 없음.
    const apiCallEdges = graph.edges.filter(e => e.kind === 'api-call')
    if (apiCallEdges.length > 0 && frontendRef !== undefined) {
      const libraries = new Set<string>()
      for (const e of apiCallEdges) {
        if (e.apiCall?.library !== undefined) libraries.add(e.apiCall.library)
      }
      const libLabel = libraries.size > 0 ? Array.from(libraries).join(' · ') : 'REST'
      lines.push(`  subgraph DATALAYER["🔌 API LAYER"]`)
      lines.push(`    subgraph API_G["⚡ External REST API"]`)
      lines.push(`      API_GATEWAY[("Backend Service")]`)
      lines.push('    end\n  end')
      lines.push(`  ${frontendRef} -.->|"${libLabel}"| API_GATEWAY`)
    }
  }

  return lines.join('\n')
}

function isBeController(name: string): boolean { return name.endsWith('Controller') }
function isBeService(name: string): boolean { return name.endsWith('Service') || name.endsWith('ServiceImpl') }
function isBeRepository(name: string): boolean {
  return name.endsWith('Repository') || name.endsWith('Dao') || name.endsWith('Mapper')
}

// ST2: BE Tab2 = Tab1 동일 패키지 트리 + leaf에 Controller→Service→Repository 수직 DI 체인 subgraph.
// 표준: docs/design/BE-DIAGRAM-STANDARD.md §3 (R-T2.1~6).
// - 트리: emitTreeNodes (R-T2.1, Tab1 동일 정책)
// - leaf DI 체인: di_<Ctrl> subgraph, 수직 verified --> 또는 inferred -.->
// - (none) placeholder: Controller에 DI edge ≥1 있을 때만 누락 슬롯 채움 (D4 / R-T2.5 Less is More)
// - cross-package DI: from·to 패키지 다르면 leaf 외부 dashed edge (R-T2.4)
// - chunk: chunkByTopLevelPackage → top-level 패키지별 분할 (R-T2.1 + R-T1.8)
function buildBeArchitectureDiagram(graph: IRGraph): string {
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
  const chainByCtrl = new Map<string, DiChain>()
  for (const c of controllers) {
    const svcEdge = callsEdges.find(e => e.from === c.id && (compById.get(e.to)?.name !== undefined && isBeService(compById.get(e.to)!.name)))
    const svc = svcEdge !== undefined ? compById.get(svcEdge.to) : undefined
    let repoEdge: IREdge | undefined
    let repo: ComponentNode | undefined
    if (svc !== undefined) {
      repoEdge = callsEdges.find(e => e.from === svc.id && (compById.get(e.to)?.name !== undefined && isBeRepository(compById.get(e.to)!.name)))
      repo = repoEdge !== undefined ? compById.get(repoEdge.to) : undefined
    }
    chainByCtrl.set(c.id, { svc, repo, svcEdge, repoEdge })
  }

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
    // Leaf Controllers: 부모 패키지 노드에서 leaf로 edge 연결. cluster root의 직접 leaf는 edge 생략 (HDR_PKG wrapper가 외곽).
    const walkFiles = (node: PkgTreeNode, parentId: string, pathSegs: string[], depth: number): void => {
      for (const [seg, child] of node.children) {
        const segs = [...pathSegs, seg]
        const pkgId = treeEmit.nodeIdByPath.get(segs.join('.')) ?? parentId
        walkFiles(child, pkgId, segs, depth + 1)
      }
      for (const f of node.files) {
        const ctrl = trimmed.find(b => b.filePath === f.filePath)?.controller
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
    // build a wrapper PkgTreeNode with files attached at correct depths
    const filesTree = buildPkgTree(trimmed.map(b => ({ filePath: b.filePath, segments: b.segments, routes: [] })))
    // intersect filesTree paths with chunkTree paths so each chunk only renders its own leaves
    const intersect = (a: PkgTreeNode, b: PkgTreeNode): PkgTreeNode => {
      const out: PkgTreeNode = { children: new Map(), files: a.files.filter(f => f) }
      for (const [seg, sub] of a.children) {
        const matched = b.children.get(seg)
        if (matched !== undefined) out.children.set(seg, intersect(sub, matched))
      }
      return out
    }
    // chunkTree was sub-rooted at headerSegs+chunkPath; align filesTree
    let alignedFiles: PkgTreeNode = filesTree
    for (const seg of chunkPath) {
      const next = alignedFiles.children.get(seg)
      if (next === undefined) { alignedFiles = { children: new Map(), files: [] }; break }
      alignedFiles = next
    }
    const final = intersect(alignedFiles, chunkTree)
    walkFiles(final, rootId, chunkPath, 0)

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

function buildScreenComponentDiagram(graph: IRGraph): string {
  if (graph.metadata?.adapterCategory === 'BE') return buildBeArchitectureDiagram(graph)
  const allRouteNodes = graph.nodes.filter(isRouteNode)
  const componentNodes = graph.nodes.filter(isComponentNode)

  // Only page-type routes — remove loading, layout, template, error, route-handler
  const allPageRoutes = allRouteNodes.filter(r => r.routeFileKind === 'page')

  // Build path → display route map; prefer verified (static) over inferred (LLM duplicates)
  const pathToDisplayRoute = new Map<string, RouteNode>()
  for (const r of allPageRoutes) {
    const existing = pathToDisplayRoute.get(r.path)
    if (existing === undefined || r.confidence === 'verified') {
      pathToDisplayRoute.set(r.path, r)
    }
  }
  const pageRoutes = Array.from(pathToDisplayRoute.values())
  const pageRouteIds = new Set(pageRoutes.map(r => r.id))

  // Remap renders edges: inferred/non-display routes → display route by path, deduplicate
  const seenEdgeKeys = new Set<string>()
  const rendersEdges = graph.edges
    .filter(e => e.kind === 'renders')
    .map(e => {
      if (pageRouteIds.has(e.from)) return e
      // Try to find source route in graph nodes
      const src = allRouteNodes.find(r => r.id === e.from)
      if (src !== undefined) {
        const target = pathToDisplayRoute.get(src.path)
        return target !== undefined ? { ...e, from: target.id } : null
      }
      // Source was rejected by verifier — parse URL path from ID: "route:<file>:<routePath>"
      const colonIdx = e.from.indexOf(':', 'route:'.length)
      if (e.from.startsWith('route:') && colonIdx !== -1) {
        const routePath = e.from.slice(colonIdx + 1)
        const target = pathToDisplayRoute.get(routePath)
        return target !== undefined ? { ...e, from: target.id } : null
      }
      return null
    })
    .filter((e): e is IREdge => {
      if (e === null) return false
      const key = `${e.from}:${e.to}`
      if (seenEdgeKeys.has(key)) return false
      seenEdgeKeys.add(key)
      return true
    })

  const importsEdges = graph.edges.filter(e => e.kind === 'imports')

  const routeGroups = groupRoutesByUrl(pageRoutes)
  const branchingGroups = findBranchingGroups(routeGroups)

  if (
    branchingGroups.length > TAB2_GROUPS_PER_ROW &&
    pageRoutes.length > SINGLE_DIAGRAM_ROUTE_THRESHOLD
  ) {
    // 1 top-level branch = 1 chunk (Tab1과 동일 정책)
    // routeCount 게이트 추가 — 작은 프로젝트는 single-diagram로 유지.
    // scope: chunked 경로는 react-router 분기 미적용 (v1.2.43+ 평가).
    return joinChunks(branchingGroups.map(g =>
      renderScreenSection([g], rendersEdges, importsEdges, componentNodes)
    ))
  }

  // → v1.2.43 ST2: file-based 어댑터(Next/NextPages/Nuxt/SvelteKit/Remix/ReactRouter)는
  // 라우트 → 디렉터리 트리 → 파일 leaf 표현으로 분기. Vue SPA·Angular(config-based)는 현행 유지.
  // BE 어댑터는 위에서 별도 분기 (회귀 0).
  if (isFileTreeTab2Eligible(graph.metadata)) {
    return buildFeFileTreeScreenDiagram(branchingGroups, rendersEdges, importsEdges, componentNodes)
  }

  return renderScreenSection(branchingGroups, rendersEdges, importsEdges, componentNodes)
}

// ST3 → v1.2.43 ST2: file-based FE 어댑터 Tab2 표준.
// 라우트 nested 트리 + 각 라우트 leaf 옆에 컴포넌트의 filePath를 별도 노드로 emit.
// 도메인/디렉터리 nested subgraph는 Tab1과 일관 + leaf = 디렉터리 + 파일명.
// - file-based 라우팅 어댑터 6종(Next.js App·Pages, Nuxt, SvelteKit, Remix, React Router) 공통 적용
// - group route `(marketing)` · 동적 route `[slug]` 등 URL≠파일경로 케이스에서 가치 큼
// - LLM enabled에서도 ComponentNode.filePath 정적 기반이라 동일 동작
function buildFeFileTreeScreenDiagram(
  routeGroups: NestedGroup[],
  rendersEdges: IREdge[],
  importsEdges: IREdge[],
  componentNodes: ComponentNode[],
): string {
  const compById = new Map(componentNodes.map(c => [c.id, c]))
  const lines: string[] = [RENDERING_INIT, 'graph LR', CLASS_DEFS]
  const edges: string[] = []
  const fileNodeRendered = new Set<string>()

  emitFeFileTreeLines(routeGroups, '  ', compById, rendersEdges, importsEdges, lines, edges, fileNodeRendered)

  // #17 Tab2 top-level ~~~ chain — leaf composite node ID 또는 subgraph ID 혼합 가능.
  const topIds = collectChildIds(routeGroups, compById, rendersEdges)
  if (topIds.length >= 2) lines.push(`  ${topIds.join(' ~~~ ')}`)

  lines.push(...edges)
  return lines.join('\n')
}

// leaf cluster(children=0 + routes=1) + 매칭 file_leaf 있으면 subgraph 대신
// 단일 합성 노드(route 라벨 + 파일경로) emit. subgraph가 사라져 mermaid v11 외부 edge direction
// inheritance 문제(규칙 B 위반) 자동 회피. sibling은 노드 ~~~ chain로 X축 강제(규칙 A 만족).
function tryComposeLeafGroup(
  group: NestedGroup,
  compById: Map<string, ComponentNode>,
  rendersEdges: IREdge[],
): { id: string; line: string; comp: ComponentNode; route: RouteNode } | undefined {
  if (group.children.length !== 0) return undefined
  if (group.routes.length !== 1) return undefined
  const r = group.routes[0]!
  const edge = rendersEdges.find(e => e.from === r.id)
  if (edge === undefined) return undefined
  const comp = compById.get(edge.to)
  if (comp === undefined) return undefined
  const id = `leaf_${sanitizeId(r.id)}`
  const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
  const displayPath = r.path.split('/').filter(Boolean).pop() ?? r.path
  const parts = comp.filePath.split('/')
  const fileName = parts.pop() ?? comp.filePath
  const dir = parts.join('/')
  const fileLabel = dir.length > 0 ? `📂 ${dir}<br/>📄 ${fileName}` : `📄 ${fileName}`
  const line = `["${displayPath} · ${badge}<br/>${fileLabel}"]:::${modeClass(r.renderingMode)}`
  return { id, line: `${id}${line}`, comp, route: r }
}

// 부모 cluster의 children chain용 ID 수집. leaf composite은 노드 ID, 그 외는 subgraph ID.
function collectChildIds(
  children: NestedGroup[],
  compById: Map<string, ComponentNode>,
  rendersEdges: IREdge[],
): string[] {
  const ids: string[] = []
  for (const c of children) {
    const segs = c.groupKey.split('/').filter(Boolean)
    if (segs.length === 0) continue
    const composite = tryComposeLeafGroup(c, compById, rendersEdges)
    if (composite !== undefined) {
      ids.push(composite.id)
    } else {
      ids.push(groupSubgraphId(c.groupKey).replace(/_G$/, '_T'))
    }
  }
  return ids
}

function emitFeFileTreeLines(
  groups: NestedGroup[],
  indent: string,
  compById: Map<string, ComponentNode>,
  rendersEdges: IREdge[],
  importsEdges: IREdge[],
  lines: string[],
  edges: string[],
  fileNodeRendered: Set<string>,
): void {
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) {
        emitRouteAndFileLeaf(r, indent, compById, rendersEdges, importsEdges, lines, edges, fileNodeRendered)
      }
      if (group.children.length > 0) {
        emitFeFileTreeLines(group.children, indent, compById, rendersEdges, importsEdges, lines, edges, fileNodeRendered)
      }
      continue
    }
    // leaf composite 가능한 group은 subgraph 없이 단일 노드만 emit.
    const composite = tryComposeLeafGroup(group, compById, rendersEdges)
    if (composite !== undefined) {
      lines.push(`${indent}${composite.line}`)
      // 1-depth import child: from 합성 노드 ID로 cross-cluster edge 유지
      if (composite.route.routeFileKind === 'page') {
        const childImports = importsEdges.filter(e => e.from === composite.comp.id && e.importDepth === 1)
        for (const childEdge of childImports) {
          const childComp = compById.get(childEdge.to)
          if (childComp === undefined) continue
          const childFileId = `file_${sanitizeId(childComp.id)}`
          if (!fileNodeRendered.has(childFileId)) {
            fileNodeRendered.add(childFileId)
            const parts = childComp.filePath.split('/')
            const fileName = parts.pop() ?? childComp.filePath
            const dir = parts.join('/')
            const label = dir.length > 0 ? `📂 ${dir}<br/>📄 ${fileName}` : `📄 ${fileName}`
            lines.push(`${indent}${childFileId}["${label}"]:::pkg`)
          }
          edges.push(`  ${composite.id} --> ${childFileId}`)
        }
      }
      continue
    }
    const sgId = groupSubgraphId(group.groupKey).replace(/_G$/, '_T')
    lines.push(`${indent}subgraph ${sgId}["${sectionLabel(leafSeg)}"]`)
    for (const r of group.routes) {
      emitRouteAndFileLeaf(r, i2, compById, rendersEdges, importsEdges, lines, edges, fileNodeRendered)
    }
    if (group.children.length > 0) {
      emitFeFileTreeLines(group.children, i2, compById, rendersEdges, importsEdges, lines, edges, fileNodeRendered)
    }
    lines.push(`${indent}end`)
    // 자식 chain: leaf composite은 노드 ID, 일반 cluster는 subgraph ID로 ~~~ 연결.
    // ⚠️ chain은 부모 cluster 바깥(`end` 다음, `${indent}` 들여쓰기)에 emit해야 작동.
    // 부모 안에 emit하면 plain 노드 chain도 X축이 깨짐(v1.2.45 buildup AGENCY 사례).
    // FE 표준 v1.1: nested X축은 보장하지 않으나 chain 효과로 작동하는 케이스는 보너스로 유지.
    if (group.children.length >= 2) {
      const childIds = collectChildIds(group.children, compById, rendersEdges)
      if (childIds.length >= 2) lines.push(`${indent}${childIds.join(' ~~~ ')}`)
    }
  }
}

// A5-B-1·A5-B-2: 1-depth import child component leaf + Y축 edge.
// Sub-1 (shared component): 단일 노드 + fan-in edges (fileNodeRendered Set 가드 활용).
// Sub-2 (page → page import): 표현 포함 (1-hop import edge 동일 처리).
// from 가드: routeFileKind === 'page' Route의 renders target ComponentNode만 (layout/loading 차단).
// 내부 lib(IR componentNodes 미등록)은 자동 필터 (compById.get → undefined).
function emitRouteAndFileLeaf(
  r: RouteNode,
  indent: string,
  compById: Map<string, ComponentNode>,
  rendersEdges: IREdge[],
  importsEdges: IREdge[],
  lines: string[],
  edges: string[],
  fileNodeRendered: Set<string>,
): void {
  const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
  const displayPath = r.path.split('/').filter(Boolean).pop() ?? r.path
  lines.push(`${indent}${sanitizeId(r.id)}["${displayPath} · ${badge}"]:::${modeClass(r.renderingMode)}`)

  const edge = rendersEdges.find(e => e.from === r.id)
  if (edge === undefined) return
  const comp = compById.get(edge.to)
  if (comp === undefined) return

  const fileId = `file_${sanitizeId(comp.id)}`
  if (!fileNodeRendered.has(fileId)) {
    fileNodeRendered.add(fileId)
    const parts = comp.filePath.split('/')
    const fileName = parts.pop() ?? comp.filePath
    const dir = parts.join('/')
    const label = dir.length > 0 ? `📂 ${dir}<br/>📄 ${fileName}` : `📄 ${fileName}`
    lines.push(`${indent}${fileId}["${label}"]:::pkg`)
  }
  // edge를 cluster 안에 emit해야 graph LR에서 cluster width 영향이 형제 X축 layout 방해를 안 함
  // (advisor 권고 — edge가 root level에 있으면 mermaid가 cluster를 자동 Y로 쌓음).
  lines.push(`${indent}${sanitizeId(r.id)} --> ${fileId}`)

  // A5-B-2: page 컴포넌트의 1-depth imports child component leaf + Y축 edge
  // routeFileKind === 'page' 가드 (layout/loading 차단)
  if (r.routeFileKind !== 'page') return
  const childImports = importsEdges.filter(e => e.from === comp.id && e.importDepth === 1)
  for (const childEdge of childImports) {
    const childComp = compById.get(childEdge.to)
    if (childComp === undefined) continue  // 외부 lib 자동 필터
    const childFileId = `file_${sanitizeId(childComp.id)}`
    if (!fileNodeRendered.has(childFileId)) {
      fileNodeRendered.add(childFileId)
      const parts = childComp.filePath.split('/')
      const fileName = parts.pop() ?? childComp.filePath
      const dir = parts.join('/')
      const label = dir.length > 0 ? `📂 ${dir}<br/>📄 ${fileName}` : `📄 ${fileName}`
      lines.push(`${indent}${childFileId}["${label}"]:::pkg`)
    }
    // cross-cluster 가능성 — root level (edges 배열)에 둠
    edges.push(`  ${fileId} --> ${childFileId}`)
  }
}

// MySQL Workbench 스타일 — th(테이블명 헤더): 어두운 청회색 배경 + 밝은 텍스트
// td(컬럼 행): 밝은 배경(attributeBackgroundColor*) + 어두운 텍스트(textColor)
// primaryTextColor가 헤더 텍스트를 override하므로 textColor(전역)는 td 텍스트에만 실효
const DB_DIAGRAM_INIT = `%%{init:{'theme':'base','themeVariables':{'background':'#060810','primaryColor':'#2a4055','primaryTextColor':'#f8fafc','primaryBorderColor':'#1e4060','lineColor':'#f59e0b','secondaryColor':'#0f172a','tertiaryColor':'#1a0a20','attributeBackgroundColorEven':'#ffffff','attributeBackgroundColorOdd':'#f1f5f9','textColor':'#1e293b','nodeBorder':'#1e4060','clusterBkg':'#0a0e1a','fontFamily':'JetBrains Mono','fontSize':'14'}}}%%`

function getSourceLabel(node: IRNode): string | undefined {
  if (isRouteNode(node)) {
    const clean = node.path.replace(/\//g, '_').replace(/^_/, '') || 'root'
    return sanitizeId(clean)
  }
  if (isComponentNode(node)) return sanitizeId(node.name)
  return undefined
}

// ST5: React Router Tab3 = Route별 API 호출 다이어그램.
// - 도메인 subgraph (Tab1·Tab2와 일관)
// - 각 라우트 leaf → rendersEdge로 매핑된 Page Component → api-call edges
// - API endpoint 노드는 method+path를 라벨로 합성 (graph.nodes에 미등록, edge.to NodeId로만 식별)
// - library별 클래스 차등 (axios/fetch/react-query)
function buildFeApiCallDiagram(graph: IRGraph): string {
  const routeNodes = graph.nodes.filter(isRouteNode).filter(r => r.routeFileKind === 'page')
  const componentNodes = graph.nodes.filter(isComponentNode)
  const rendersEdges = graph.edges.filter(e => e.kind === 'renders')
  const apiCallEdges = graph.edges.filter(e => e.kind === 'api-call')

  if (routeNodes.length === 0) return 'graph TD\n  empty["(no routes found)"]'
  if (apiCallEdges.length === 0) return 'graph TD\n  empty["(no API calls detected)"]'

  const compById = new Map(componentNodes.map(c => [c.id, c]))
  const routeToComp = new Map<string, string>()
  for (const e of rendersEdges) {
    if (!routeToComp.has(e.from)) routeToComp.set(e.from, e.to)
  }
  const compToApiCalls = new Map<string, typeof apiCallEdges>()
  for (const e of apiCallEdges) {
    const list = compToApiCalls.get(e.from) ?? []
    list.push(e)
    compToApiCalls.set(e.from, list)
  }

  const lines: string[] = [RENDERING_INIT, 'graph LR', CLASS_DEFS]
  lines.push('  classDef apiAxios fill:#1a0d1a,stroke:#a855f7,color:#e9d5ff')
  lines.push('  classDef apiFetch fill:#0d1a1a,stroke:#06b6d4,color:#a5f3fc')
  lines.push('  classDef apiQuery fill:#1a0d0d,stroke:#f43f5e,color:#fecdd3')
  const edgeLines: string[] = []
  const endpointEmitted = new Set<string>()

  const routeGroups = groupRoutesByUrl(routeNodes)
  emitFeApiCallTreeLines(
    routeGroups,
    '  ',
    routeToComp,
    compById,
    compToApiCalls,
    lines,
    edgeLines,
    endpointEmitted,
  )
  lines.push(...edgeLines)
  return lines.join('\n')
}

function emitFeApiCallTreeLines(
  groups: NestedGroup[],
  indent: string,
  routeToComp: Map<string, string>,
  compById: Map<string, ComponentNode>,
  compToApiCalls: Map<string, IREdge[]>,
  lines: string[],
  edges: string[],
  endpointEmitted: Set<string>,
): void {
  const i2 = indent + '  '
  for (const group of groups) {
    const leafSeg = group.groupKey.split('/').filter(Boolean).pop()
    if (leafSeg === undefined) {
      for (const r of group.routes) {
        emitRouteApiCalls(r, indent, routeToComp, compById, compToApiCalls, lines, edges, endpointEmitted)
      }
      if (group.children.length > 0) {
        emitFeApiCallTreeLines(group.children, indent, routeToComp, compById, compToApiCalls, lines, edges, endpointEmitted)
      }
      continue
    }
    const sgId = groupSubgraphId(group.groupKey).replace(/_G$/, '_API')
    lines.push(`${indent}subgraph ${sgId}["${sectionLabel(leafSeg)}"]`)
    for (const r of group.routes) {
      emitRouteApiCalls(r, i2, routeToComp, compById, compToApiCalls, lines, edges, endpointEmitted)
    }
    if (group.children.length > 0) {
      emitFeApiCallTreeLines(group.children, i2, routeToComp, compById, compToApiCalls, lines, edges, endpointEmitted)
    }
    lines.push(`${indent}end`)
  }
}

function emitRouteApiCalls(
  r: RouteNode,
  indent: string,
  routeToComp: Map<string, string>,
  _compById: Map<string, ComponentNode>,
  compToApiCalls: Map<string, IREdge[]>,
  lines: string[],
  edges: string[],
  endpointEmitted: Set<string>,
): void {
  const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
  const displayPath = r.path.split('/').filter(Boolean).pop() ?? r.path
  lines.push(`${indent}${sanitizeId(r.id)}["${displayPath} · ${badge}"]:::${modeClass(r.renderingMode)}`)

  const compId = routeToComp.get(r.id)
  if (compId === undefined) return
  const calls = compToApiCalls.get(compId) ?? []
  for (const call of calls) {
    if (call.apiCall === undefined) continue
    const { method, path: apiPath, library } = call.apiCall
    const endpointId = `ep_${sanitizeId(`${method}_${apiPath}`)}`
    if (!endpointEmitted.has(endpointId)) {
      endpointEmitted.add(endpointId)
      const cls = library === 'fetch' ? 'apiFetch' : library === 'react-query' ? 'apiQuery' : 'apiAxios'
      const arrow = call.confidence === 'inferred' ? '⟿' : '→'
      lines.push(`${indent}${endpointId}["${method} ${apiPath} ${arrow} ${library}"]:::${cls}`)
    }
    const edgeArrowChar = call.confidence === 'inferred' ? '-.->' : '-->'
    edges.push(`  ${sanitizeId(r.id)} ${edgeArrowChar} ${endpointId}`)
  }
}

function buildDbScreenDiagram(graph: IRGraph): string {
  const tableNodes = graph.nodes.filter(isTableNode)

  // ST5: Tab3 분기
  //   1. BE 어댑터 → 현행 ER + Repository 합성 (이 함수 하단 'adapterCategory==='BE'' 블록 유지)
  //   2. react-router FE + tables===0 → 신규 FE API 호출 다이어그램 (axios/fetch/react-query)
  //   3. 그 외(Next.js+Supabase·Vite·Nuxt·SvelteKit·Vue SPA 등 FE+tables>0) → 현행 ER 다이어그램 (회귀 0)
  if (graph.metadata?.adapterCategory !== 'BE' && tableNodes.length === 0) {
    const infra = metadataToInfra(graph.metadata)
    if (infra.hasReactRouter) {
      return buildFeApiCallDiagram(graph)
    }
  }

  const queriesEdges = graph.edges.filter(e => e.kind === 'queries')

  // Deduplicate query sources (routes + components that actually query tables)
  const sourcesMap = new Map<string, string>()
  for (const edge of queriesEdges) {
    if (sourcesMap.has(edge.from)) continue
    const src = graph.nodes.find(n => n.id === edge.from)
    if (src === undefined || isTableNode(src)) continue
    const label = getSourceLabel(src)
    if (label !== undefined) sourcesMap.set(edge.from, label)
  }

  const lines: string[] = [DB_DIAGRAM_INIT, 'erDiagram']

  for (const t of tableNodes) {
    const file = t.provenance.file
    if (file !== undefined && file !== '') {
      lines.push(`%% table:${sanitizeId(t.name)} path:${file}`)
    }
  }

  for (const t of tableNodes) {
    lines.push(`  ${sanitizeId(t.name)} {`)
    for (const col of t.columns) {
      const pkFlag = col.isPrimaryKey === true ? ' PK' : ''
      const fkFlag = col.references !== undefined ? ' FK' : ''
      lines.push(`    ${sanitizeId(col.type)} ${sanitizeId(col.name)}${pkFlag}${fkFlag}`)
    }
    lines.push('  }')
  }

  // BE-specific: include Repository/Dao/Mapper components even without queries edges.
  // Ensures Tab3 tracks the same Repository nodes as Tab2 (cross-tab traceability).
  if (graph.metadata?.adapterCategory === 'BE') {
    for (const node of graph.nodes) {
      if (!isComponentNode(node)) continue
      if (!isBeRepository(node.name)) continue
      if (!sourcesMap.has(node.id)) sourcesMap.set(node.id, sanitizeId(node.name))
    }
  }

  // Source (route/component/action) proxy entities
  for (const label of new Set(sourcesMap.values())) {
    lines.push(`  ${label} {`)
    lines.push(`    string name`)
    lines.push('  }')
  }

  // Table ↔ Table FK relationships (from ColumnDef.references)
  const tableNameSet = new Set(tableNodes.map(t => sanitizeId(t.name)))
  for (const t of tableNodes) {
    for (const col of t.columns) {
      if (col.references === undefined) continue
      const target = sanitizeId(col.references.table)
      if (tableNameSet.has(target)) {
        lines.push(`  ${sanitizeId(t.name)} }o--|| ${target} : "${col.name}"`)
      }
    }
  }

  // Source → Table queries edges
  for (const edge of queriesEdges) {
    const srcLabel = sourcesMap.get(edge.from)
    const tblNode = graph.nodes.find(n => n.id === edge.to)
    if (srcLabel === undefined || tblNode === undefined || !isTableNode(tblNode)) continue
    lines.push(`  ${srcLabel} }|--|| ${sanitizeId(tblNode.name)} : "queries"`)
  }

  return lines.join('\n')
}

function wrapMermaid(diagram: string): string {
  return `\`\`\`mermaid\n${diagram}\n\`\`\``
}

export async function renderMermaid(graph: IRGraph, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true })

  const renderingDiagram = buildRenderingDiagram(graph)
  const screenComponentDiagram = buildScreenComponentDiagram(graph)
  const dbScreenDiagram = buildDbScreenDiagram(graph)

  await fs.writeFile(
    path.join(outputDir, 'rendering.md'),
    `# Rendering Architecture\n\n${wrapMermaid(renderingDiagram)}\n`,
    'utf8',
  )

  await fs.writeFile(
    path.join(outputDir, 'screen-component.md'),
    `# Screen–Component Mapping\n\n${wrapMermaid(screenComponentDiagram)}\n`,
    'utf8',
  )

  await fs.writeFile(
    path.join(outputDir, 'db-screen.md'),
    `# Data Flow (Screen ↔ Data Source)\n\n${wrapMermaid(dbScreenDiagram)}\n`,
    'utf8',
  )
}

export interface DiagramSet {
  rendering: string
  screenComponent: string
  dbScreen: string
}

export interface GroupingOptions {
  maxNodesPerGroup?: number
  maxDepth?: number
}

export interface BuildDiagramsOptions {
  grouping?: GroupingOptions
  chunkThreshold?: number
  nodeThreshold?: number
}

export const DEFAULT_GROUPING: Required<GroupingOptions> = {
  maxNodesPerGroup: 30,
  maxDepth: 8,
}

function buildWithChunkFallback(
  graph: IRGraph,
  build: (g: IRGraph) => string,
  chunkOpts: ChunkOptions,
  threshold: number,
  nodeCount = 0,
  nodeThreshold = DEFAULT_NODE_THRESHOLD,
): string {
  const text = build(graph)
  if (text.includes(CHUNK_SEPARATOR)) return text
  if (!shouldChunk(text, threshold, nodeCount, nodeThreshold)) return text
  // BE 어댑터의 Tab2는 컴포넌트 그래프이므로 라우트 기준 chunking이 무의미.
  // chunkByGroups는 라우트만 분할 → 각 chunk에 컴포넌트 미포함 → "(no BE components found)" 반복 결함 회피.
  if (graph.metadata?.adapterCategory === 'BE') return text
  const subGraphs = chunkByGroups(graph, chunkOpts)
  if (subGraphs.length <= 1) return text
  const parts = subGraphs.map(g => build(g))
  return joinChunks(parts)
}

const COMBINED_FALLBACK = '⚠ 결합 다이어그램 1M 초과 — chunk 분할로 fallback'

function findParentRouteId(componentId: string, feGraph: IRGraph): string | undefined {
  return feGraph.edges.find(e => e.kind === 'renders' && e.to === componentId)?.from
}

export function buildCombinedDiagram(
  feGraph: IRGraph,
  beGraph: IRGraph,
  crossEdges: IREdge[],
  opts?: BuildDiagramsOptions,
): DiagramSet {
  const threshold = opts?.chunkThreshold ?? DEFAULT_CHUNK_THRESHOLD

  // Tab1: FE subgraph + BE subgraph + cross-edges
  const feRoutes = feGraph.nodes.filter(isRouteNode).filter(r => r.routeFileKind === 'page')
  const beRoutes = beGraph.nodes.filter(isRouteNode).filter(r => r.routeFileKind === 'page')

  const lines: string[] = [RENDERING_INIT, 'graph TD', CLASS_DEFS]

  // FE subgraph
  if (feRoutes.length > 0) {
    lines.push(`  subgraph FE_PROJ["🖥 Frontend · ${feGraph.projectName ?? 'FE'}"]`)
    for (const l of buildNestedSubgraphLines(groupRoutesByUrl(feRoutes), '    ')) lines.push(l)
    lines.push('  end')
  }

  // BE subgraph
  if (beRoutes.length > 0) {
    lines.push(`  subgraph BE_PROJ["⚙ Backend · ${beGraph.projectName ?? 'BE'}"]`)
    for (const l of buildNestedSubgraphLines(groupRoutesByUrl(beRoutes), '    ')) lines.push(l)
    lines.push('  end')
  }

  // Cross-edges: find parent RouteNode for ComponentNode from ids
  for (const edge of crossEdges) {
    if (edge.kind !== 'fe-be-call') continue
    const visualFrom = findParentRouteId(edge.from, feGraph) ?? edge.from
    lines.push(`  ${sanitizeId(visualFrom)} -.-> ${sanitizeId(edge.to)}`)
  }

  const renderingText = lines.join('\n')
  const totalRouteCount = feRoutes.length + beRoutes.length

  if (!shouldChunk(renderingText, threshold, totalRouteCount)) {
    return {
      rendering: renderingText,
      screenComponent: buildScreenComponentDiagram(feGraph),
      dbScreen: buildDbScreenDiagram(beGraph),
    }
  }

  return {
    rendering: `graph TD\n  fallback["${COMBINED_FALLBACK}"]`,
    screenComponent: buildScreenComponentDiagram(feGraph),
    dbScreen: buildDbScreenDiagram(beGraph),
  }
}

// Tab3 전용: tableCount 기반 임계값 + 테이블 슬라이스 분할
function buildDbScreenWithFallback(
  graph: IRGraph,
  chunkOpts: ChunkOptions,
  threshold: number,
  nodeThr: number,
): string {
  const text = buildDbScreenDiagram(graph)
  if (text.includes(CHUNK_SEPARATOR)) return text
  const tableCount = graph.nodes.filter(isTableNode).length
  if (!shouldChunk(text, threshold, tableCount, nodeThr)) return text

  // 테이블 슬라이스 — 각 chunk에 해당 테이블로 향하는 edges의 source 노드도 포함
  const tables = graph.nodes.filter(isTableNode)
  const tableChunks = chunkGroups(tables, chunkOpts.maxNodesPerGroup)
  if (tableChunks.length <= 1) return text

  const parts = tableChunks.map(tableSlice => {
    const tableIds = new Set(tableSlice.map(t => t.id))
    const relatedEdges = graph.edges.filter(e => tableIds.has(e.to) || tableIds.has(e.from))
    const sourceIds = new Set(relatedEdges.map(e => e.from).filter(id => !tableIds.has(id)))
    const subNodes = [...tableSlice, ...graph.nodes.filter(n => sourceIds.has(n.id))]
    const subNodeIds = new Set(subNodes.map(n => n.id))
    const subGraph: IRGraph = {
      ...graph,
      nodes: subNodes,
      edges: graph.edges.filter(e => subNodeIds.has(e.from) && subNodeIds.has(e.to)),
    }
    return buildDbScreenDiagram(subGraph)
  })
  return joinChunks(parts)
}

export function buildDiagrams(graph: IRGraph, opts?: BuildDiagramsOptions): DiagramSet {
  const chunkOpts: ChunkOptions = {
    maxNodesPerGroup: opts?.grouping?.maxNodesPerGroup ?? DEFAULT_GROUPING.maxNodesPerGroup,
    maxDepth: opts?.grouping?.maxDepth ?? DEFAULT_GROUPING.maxDepth,
  }
  const threshold = opts?.chunkThreshold ?? DEFAULT_CHUNK_THRESHOLD
  const nodeThr = opts?.nodeThreshold ?? DEFAULT_NODE_THRESHOLD
  const routeCount = graph.nodes.filter(isRouteNode).length
  return {
    rendering: buildWithChunkFallback(graph, buildRenderingDiagram, chunkOpts, threshold, routeCount, nodeThr),
    screenComponent: buildWithChunkFallback(graph, buildScreenComponentDiagram, chunkOpts, threshold, routeCount, nodeThr),
    dbScreen: buildDbScreenWithFallback(graph, chunkOpts, threshold, nodeThr),
  }
}
