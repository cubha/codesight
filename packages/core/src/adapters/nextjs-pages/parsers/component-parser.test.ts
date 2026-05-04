import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseNextPagesComponents } from './component-parser.js'
import { NextJsPagesAdapter } from '../adapter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/mini-nextpages-app')

describe('parseNextPagesComponents', () => {
  it('pages/ 파일들을 ComponentNode로 파싱한다', async () => {
    const { nodes } = await parseNextPagesComponents(FIXTURE, '0.0.0-test')
    // pages/index.tsx, pages/about.tsx, pages/users/[id].tsx, pages/_components/UserCard.tsx
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    const names = nodes.map(n => n.name)
    expect(names).toContain('index')
    expect(names).toContain('about')
  })

  it('API 라우트는 ComponentNode에서 제외한다', async () => {
    const { nodes } = await parseNextPagesComponents(FIXTURE, '0.0.0-test')
    const apiNodes = nodes.filter(n => n.filePath.includes('api/'))
    expect(apiNodes).toHaveLength(0)
  })

  it('ComponentNode의 runtime은 server이다', async () => {
    const { nodes } = await parseNextPagesComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.runtime).toBe('server')
    }
  })

  it('pages 내 컴포넌트 import → renders 엣지를 생성한다', async () => {
    const { edges } = await parseNextPagesComponents(FIXTURE, '0.0.0-test')
    const rendersEdges = edges.filter(e => e.kind === 'renders')
    // index.tsx imports _components/UserCard.tsx
    expect(rendersEdges.length).toBeGreaterThanOrEqual(1)
    const fromPaths = rendersEdges.map(e => String(e.from))
    expect(fromPaths.some(p => p.includes('index'))).toBe(true)
  })

  it('provenance.adapter가 설정된다', async () => {
    const { nodes } = await parseNextPagesComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]!.provenance.adapter).toBe('nextjs-pages-component-parser@0.1')
  })

  it('hasSupabase=true면 tableNodes 배열을 반환한다 (빈 fixture여도 배열)', async () => {
    const adapter = new NextJsPagesAdapter()
    const result = await adapter.analyze({
      repoRoot: FIXTURE,
      analyzerVersion: '0.0.0-test',
      stack: { framework: 'nextjs-pages', adapterId: 'nextjs-pages', parsingLevel: 'L2',
        hasSupabase: true, hasPrisma: false, hasDexie: false, hasDrizzle: false, hasTypeOrm: false,
        hasSQLAlchemy: false, hasDjangoORM: false, hasSpringDataJpa: false,
        isMonorepo: false, appDirs: [], llmRecommended: false },
    })
    expect(Array.isArray(result.tableNodes)).toBe(true)
  })
})
