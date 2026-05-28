import type { RouteNode } from '@codebase-viz/types'
import { sanitizeId, modeClass } from '../helpers/ids.js'

export const SECTION_EMOJI: Record<string, string> = {
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

export function sectionLabel(key: string): string {
  const emoji = SECTION_EMOJI[key] ?? '📄'
  return `${emoji} /${key}`
}

// 그룹 subgraph 안에서는 path가 그룹 prefix와 중복되어 노드 라벨이 길어진다 (Y/X 축 폭발).
// stripGroupPrefix로 prefix 제거 → 노드 width 감소 → mermaid가 한 row에 더 많은 노드 배치 가능.
export function stripGroupPrefix(path: string, groupKey: string | undefined): string {
  if (groupKey === undefined || groupKey === '' || groupKey === '/') return path
  // path === groupKey면 leaf segment 반환 (예: '/agency/userMgmt' + groupKey '/agency/userMgmt' → 'userMgmt').
  // 단 leaf segment가 빈 문자열이면 path 유지 (인덱스 라우트 가드).
  if (path === groupKey) {
    const segs = path.split('/').filter(Boolean)
    return segs.length > 0 ? segs[segs.length - 1]! : path
  }
  if (path.startsWith(groupKey + '/')) return path.slice(groupKey.length + 1)
  return path
}

export function renderingRouteLabel(r: RouteNode, ind: string, stripPrefix?: string): string {
  const badge = r.renderingMode === 'unknown' ? '?' : r.renderingMode
  const methodPrefix = r.httpMethod !== undefined ? `${r.httpMethod} ` : ''
  const displayPath = stripGroupPrefix(r.path, stripPrefix)
  return `${ind}${sanitizeId(r.id)}["${methodPrefix}${displayPath} · ${badge}"]:::${modeClass(r.renderingMode)}`
}

// Subgraph ID는 group.groupKey 전체에서 파생 → 다른 module의 동일 leaf segment(예: /admin/users vs /order/users)
// 가 같은 USERS_G로 충돌해 mermaid가 단일 subgraph로 합치는 사고 방지.
export function groupSubgraphId(groupKey: string): string {
  const segs = groupKey.split('/').filter(Boolean)
  if (segs.length === 0) return 'ROOT_G'
  return sanitizeId(segs.join('_').toUpperCase()) + '_G'
}
