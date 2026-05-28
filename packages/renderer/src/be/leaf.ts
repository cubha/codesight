import * as path from 'node:path'
import type { RouteNode } from '@codebase-viz/types'
import { sanitizeId } from '../helpers/ids.js'
import { pathSegmentLcp } from './pkg-tree.js'

// BE Tab1 = 패키지 트리(node+edge) + leaf = 📄 Controller [/api/prefix] + endpoint subgraph.
// 표준: docs/design/BE-DIAGRAM-STANDARD.md §2 (R-T1.1~9).
// - 트리: emitTreeNodes (R-T1.4) — outer BE_ROOT subgraph 폐기 (D7)
// - 헤더: 📁 src/main/java/com.<lcp> annotation 노드 (R-T1.2)
// - suffix strip: 마지막 segment가 controller(s)면 strip (R-T1.3)
// - leaf: 📄 ControllerName [URL prefix] (R-T1.5)
// - endpoints: leaf 옆 endpoints_<Ctrl> subgraph, METHOD /suffix만 (R-T1.6)
// - chunk: chunkByTopLevelPackage (R-T1.8)
export function emitControllerFileLeaf(
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

export function isBeController(name: string): boolean { return name.endsWith('Controller') }
export function isBeService(name: string): boolean { return name.endsWith('Service') || name.endsWith('ServiceImpl') }
export function isBeRepository(name: string): boolean {
  return name.endsWith('Repository') || name.endsWith('Dao') || name.endsWith('Mapper')
}
