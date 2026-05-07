import { describe, it, expect } from 'vitest'
import { buildDiagrams, DEFAULT_GROUPING } from './mermaid-renderer.js'
import { createIRGraph } from '@codebase-viz/types'

describe('GroupingOptions (P3)', () => {
  it('DEFAULT_GROUPING은 maxNodesPerGroup=30, maxDepth=8', () => {
    expect(DEFAULT_GROUPING).toEqual({ maxNodesPerGroup: 30, maxDepth: 8 })
  })

  it('opts 없이 호출 시 기존 동작과 동일 (빈 IRGraph)', () => {
    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      nodes: [],
      edges: [],
    })
    const diagrams = buildDiagrams(graph)
    expect(diagrams.rendering).toContain('graph TD')
    expect(diagrams.screenComponent).toContain('graph TB')
    expect(diagrams.dbScreen).toContain('erDiagram')
  })

  it('opts.grouping 전달 시 시그니처 수용 (현 단계에서는 동작 동일)', () => {
    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: '/tmp/test',
      nodes: [],
      edges: [],
    })
    const a = buildDiagrams(graph)
    const b = buildDiagrams(graph, { grouping: { maxNodesPerGroup: 10, maxDepth: 3 } })
    expect(b.rendering).toBe(a.rendering)
    expect(b.screenComponent).toBe(a.screenComponent)
    expect(b.dbScreen).toBe(a.dbScreen)
  })
})
