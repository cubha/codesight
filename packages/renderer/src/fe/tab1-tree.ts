import type { NestedGroup } from '../url-grouper.js'
import { sanitizeId } from '../helpers/ids.js'
import { collectNestedRoutes } from '../helpers/layout.js'

// FE 표준 v1.2.55 (R-T1.2 re-amendment, §9): Tab1은 단일 아키텍처 래퍼 안에 URL 도메인 트리를
// root→대→중→소 full-depth 폴더 subgraph로 중첩한다. 각 폴더 헤더는 하위 route 재귀 합 배지를
// 표시하고, 최하위 route 세그먼트(leaf-folder)는 개별 route 노드로 펼치지 않고 카운트로 collapse한다.
// 개별 route URL 전수 열거는 Tab2의 역할(2 탭 차별성). 누락 0은 top-level 도메인 전수 출력 +
// 재귀 카운트로 보장한다. v1.2.53 flat 요약 박스(하위 세분화 Tab2 위임)를 폴더 구조 보존으로 반전.

function folderName(groupKey: string): string {
  const segs = groupKey.split('/').filter(Boolean)
  return segs.length > 0 ? segs[segs.length - 1]! : 'root'
}

function folderId(groupKey: string): string {
  const segs = groupKey.split('/').filter(Boolean)
  return 'T1_' + (segs.length > 0 ? sanitizeId(segs.join('_')) : 'root')
}

function badgeLabel(g: NestedGroup): string {
  const n = collectNestedRoutes([g]).length
  const unit = n === 1 ? 'route' : 'routes'
  const nm = folderName(g.groupKey)
  const disp = nm === 'root' ? '/' : '/' + nm
  return `📁 ${disp} · ${n} ${unit}`
}

function isTerminal(g: NestedGroup): boolean {
  return g.children.length === 0
}

// children이 전부 terminal(자식 0)이면 leaf-folder — 최하위 route 묶음이라 개별 route로 펼치지 않고
// 부모 카운트 박스 하나로 collapse한다(개별 leaf 미포함). 구조적 분기가 있는 폴더만 subgraph로 중첩.
function isLeafFolder(g: NestedGroup): boolean {
  return g.children.length > 0 && g.children.every(isTerminal)
}

function emitFolder(g: NestedGroup, indent: string, lines: string[]): void {
  if (isTerminal(g) || isLeafFolder(g)) {
    lines.push(`${indent}${folderId(g.groupKey)}["${badgeLabel(g)}"]:::pkg`)
    return
  }
  lines.push(`${indent}subgraph ${folderId(g.groupKey)}_G["${badgeLabel(g)}"]`)
  for (const c of g.children) emitFolder(c, indent + '  ', lines)
  lines.push(`${indent}end`)
}

// top-level 도메인의 chain 참조 id — 구조적 폴더는 subgraph id(_G), terminal/leaf-folder는 node id.
function topRefId(g: NestedGroup): string {
  return isTerminal(g) || isLeafFolder(g) ? folderId(g.groupKey) : folderId(g.groupKey) + '_G'
}

export function buildNestedFolderOverviewLines(domains: NestedGroup[], indent: string): string[] {
  const lines: string[] = []
  for (const g of domains) emitFolder(g, indent, lines)
  // 표준 R-T1.2: top-level 형제 도메인을 단일 `~~~` invisible chain으로 X축 분포(가로 배치)한다.
  // nested 자식은 Y-stack 표준 유지(mermaid v11 nested LR 미보장, FE 표준 v1.1 amendment).
  // render-check 실측(16 deep 도메인): 단일 chain aspect 1.99 vs bare 0.04 vs row-wrapper 0.05(무시됨).
  if (domains.length >= 2) {
    lines.push(`${indent}${domains.map(topRefId).join(' ~~~ ')}`)
  }
  return lines
}
