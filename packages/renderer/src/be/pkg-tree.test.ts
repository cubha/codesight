import { describe, it, expect } from 'vitest'
import {
  buildPkgTree,
  estimateChunkCost,
  splitTreeByBudget,
  type PkgTreeNode,
} from './pkg-tree.js'

// 합성 fileRoutes 생성기 — segments 경로 + 파일명.
function fr(segments: string[], file: string): { filePath: string; segments: string[]; routes: [] } {
  return { filePath: `${segments.join('/')}/${file}`, segments, routes: [] }
}

// 모든 chunk에 담긴 파일 수 합 = 입력 파일 수 (누락/중복 없음) 검증용.
function collectFiles(node: PkgTreeNode): string[] {
  const out: string[] = []
  const walk = (n: PkgTreeNode): void => {
    for (const [, c] of n.children) walk(c)
    for (const f of n.files) out.push(f.filePath)
  }
  walk(node)
  return out
}

describe('BE chunking — node/edge budget 2차 sub-chunk (v1.2.51 B)', () => {
  it('estimateChunkCost: 패키지 노드 + leaf cost 합산', () => {
    // a/b/X.java, a/b/Y.java → 패키지 노드 a,b (각 2) + leaf 2개
    const tree = buildPkgTree([fr(['a', 'b'], 'X.java'), fr(['a', 'b'], 'Y.java')])
    const cost = estimateChunkCost(tree, () => 5)
    // pkg a(2) + pkg b(2) + leaf X(5) + leaf Y(5) = 14
    expect(cost).toBe(14)
  })

  it('예산 이내 subtree → 단일 chunk (분할 안 함, 입력 그대로)', () => {
    const tree = buildPkgTree([fr(['dom'], 'A.java'), fr(['dom'], 'B.java')])
    const sub = tree.children.get('dom')!
    const chunks = splitTreeByBudget(['dom'], sub, 1000, st => estimateChunkCost(st, () => 5))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.pathSegs).toEqual(['dom'])
    expect(collectFiles(chunks[0]!.subtree).sort()).toEqual(['dom/A.java', 'dom/B.java'])
  })

  it('예산 초과 → 서브패키지 단위 다중 chunk 분할 + 파일 누락 0', () => {
    // dom 아래 5개 서브패키지, 각 leaf cost 큼 → 합산이 예산 초과
    const files = ['svc1', 'svc2', 'svc3', 'svc4', 'svc5'].flatMap(s =>
      [fr(['dom', s], `${s}A.java`), fr(['dom', s], `${s}B.java`)],
    )
    const tree = buildPkgTree(files)
    const sub = tree.children.get('dom')!
    const leafCost = (): number => 100
    const total = estimateChunkCost(sub, leafCost)
    const budget = Math.floor(total / 3) // 3~4개 chunk로 쪼개질 예산
    const chunks = splitTreeByBudget(['dom'], sub, budget, st => estimateChunkCost(st, leafCost))

    expect(chunks.length).toBeGreaterThan(1)
    // 각 chunk는 예산 이내 (더 못 쪼개는 단일 leaf 초과 케이스 제외)
    for (const c of chunks) {
      expect(estimateChunkCost(c.subtree, leafCost)).toBeLessThanOrEqual(budget)
    }
    // 전체 파일 누락/중복 0
    const all = chunks.flatMap(c => collectFiles(c.subtree)).sort()
    expect(all).toEqual(files.map(f => f.filePath).sort())
    // 모든 chunk는 dom 경로 유지 (헤더 보존)
    for (const c of chunks) expect(c.pathSegs[0]).toBe('dom')
  })

  it('단일 서브패키지가 홀로 예산 초과 → 그 패키지로 재귀하여 더 깊이 분할', () => {
    // dom/heavy 안에 다수 서브패키지 → heavy 하나가 예산 초과 → heavy 내부로 재귀
    const files = ['p1', 'p2', 'p3', 'p4'].flatMap(p =>
      [fr(['dom', 'heavy', p], `${p}.java`)],
    )
    files.push(fr(['dom', 'light'], 'L.java'))
    const tree = buildPkgTree(files)
    const sub = tree.children.get('dom')!
    const leafCost = (): number => 100
    const chunks = splitTreeByBudget(['dom'], sub, 150, st => estimateChunkCost(st, leafCost))
    // heavy가 재귀 분할되어 dom/heavy 경로의 chunk가 ≥1 존재
    const hasDeepPath = chunks.some(c => c.pathSegs.join('/').startsWith('dom/heavy'))
    expect(hasDeepPath).toBe(true)
    const all = chunks.flatMap(c => collectFiles(c.subtree)).sort()
    expect(all).toEqual(files.map(f => f.filePath).sort())
  })

  it('더 못 쪼개는 leaf-heavy 단일 패키지 초과 → onOverflow 호출 (silent truncation 금지)', () => {
    // children 없이 한 패키지에 무거운 leaf 다수 → 파일 단위로 쪼개되 단일 leaf가 예산 초과면 overflow log
    const files = [fr(['dom'], 'Huge.java')]
    const tree = buildPkgTree(files)
    const sub = tree.children.get('dom')!
    const overflows: Array<{ pathSegs: string[]; cost: number }> = []
    const chunks = splitTreeByBudget(['dom'], sub, 10, st => estimateChunkCost(st, () => 100), (pathSegs, cost) =>
      overflows.push({ pathSegs, cost }),
    )
    // 파일 1개라 더 못 쪼갬 → 그대로 emit + overflow 보고
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(overflows.length).toBeGreaterThanOrEqual(1)
  })
})
