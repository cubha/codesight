import type { IREdge } from '@codebase-viz/types'

export function edgeArrow(edge: IREdge): string {
  return edge.confidence === 'inferred' ? '-.->' : '-->'
}

export function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function modeClass(mode: string): string {
  const map: Record<string, string> = {
    SSR: 'ssr', CSR: 'csr', SSG: 'ssg', ISR: 'isr', PPR: 'ppr',
  }
  return map[mode] ?? 'unk'
}
