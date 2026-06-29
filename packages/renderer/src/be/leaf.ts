import * as path from 'node:path'
import type { RouteNode } from '@codebase-viz/types'
import { sanitizeId } from '../helpers/ids.js'
import { pathSegmentLcp } from './pkg-tree.js'

// mermaid markdown-string 라벨(`["`...`"]`) 안 동적 텍스트의 메타문자 이스케이프.
// viewer는 htmlLabels:false(SVG 텍스트)라 markdown 문자열로 bold가 렌더되며, URL 경로의
// `_`/`*`/`` ` ``가 italic/bold/code로 오해석되지 않도록 백슬래시 escape.
// 추가 방어: 줄바꿈은 공백으로(라벨 행 오염 차단), `"`는 `'`로 치환(라벨 닫힘 토큰 `"]` 조기
// 종료 차단) — Java/URL 경로엔 거의 없으나 파이프라인 상류 오염 대비.
function escapeMd(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/"/g, "'").replace(/([\\`*_])/g, '\\$1')
}

// BE Tab1 = 패키지 트리(node+edge) + leaf = 📄 Controller [/api/prefix] + endpoint multiline.
// 표준: docs/design/BE-DIAGRAM-STANDARD.md §2 (R-T1.1~9).
// - 트리: emitTreeNodes (R-T1.4) — outer BE_ROOT subgraph 폐기 (D7)
// - 헤더: 📁 src/main/java/com.<lcp> annotation 노드 (R-T1.2)
// - suffix strip: 마지막 segment가 controller(s)면 strip (R-T1.3)
// - leaf: 📄 ControllerName [URL prefix] (R-T1.5)
// - endpoints: leaf 노드 안 markdown multiline으로 collapse, **METHOD** /suffix 1행씩 (R-T1.6 v1.2.57 amendment).
//   구 endpoints_<Ctrl> subgraph(Y축 적층)는 폐기 — 적층이 깊은 컨트롤러 열의 Y축 비대를 유발.
// - chunk: chunkByTopLevelPackage (R-T1.8)
export function emitControllerFileLeaf(
  indent: string,
  filePath: string,
  routes: RouteNode[],
): { leafId: string; lines: string[] } {
  const controllerName = path.basename(filePath, path.extname(filePath))
  const safeName = sanitizeId(controllerName)
  const prefix = pathSegmentLcp(routes.map(r => r.path))
  const leafId = `leaf_${safeName}`

  if (routes.length === 0) {
    const titleSuffix = prefix !== '' ? ` [${prefix}]` : ''
    return { leafId, lines: [`${indent}${leafId}["📄 ${controllerName}${titleSuffix}"]:::ssr`] }
  }

  const titleSuffix = prefix !== '' ? ` [${escapeMd(prefix)}]` : ''
  const title = `📄 **${escapeMd(controllerName)}**${titleSuffix}`
  const endpointLines = routes.map(r => {
    const suffix = prefix !== '' && r.path.startsWith(prefix)
      ? (r.path.slice(prefix.length) || '/')
      : r.path
    const method = r.httpMethod !== undefined ? `**${escapeMd(r.httpMethod)}** ` : ''
    return `${method}${escapeMd(suffix)}`
  })
  const sep = '─────────────'
  const body = [title, sep, ...endpointLines].join('\n')
  return { leafId, lines: [`${indent}${leafId}["\`${body}\`"]:::ssr`] }
}

export function isBeController(name: string): boolean { return name.endsWith('Controller') }
export function isBeService(name: string): boolean { return name.endsWith('Service') || name.endsWith('ServiceImpl') }
export function isBeRepository(name: string): boolean {
  return name.endsWith('Repository') || name.endsWith('Dao') || name.endsWith('Mapper')
}
