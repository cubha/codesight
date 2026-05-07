import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRemixComponents } from './component-parser.js'
import { RemixAdapter } from '../adapter.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/mini-remix-app')

describe('parseRemixComponents', () => {
  it('app/routes/ 파일들을 ComponentNode로 파싱한다', async () => {
    const { nodes } = await parseRemixComponents(FIXTURE, '0.0.0-test')
    // app/routes/_index.tsx, about.tsx, users.$id.tsx
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    const names = nodes.map(n => n.name)
    expect(names).toContain('_index')
    expect(names).toContain('about')
  })

  it('ComponentNode filePath가 app/routes/ 하위를 가리킨다', async () => {
    const { nodes } = await parseRemixComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.filePath).toMatch(/app\/routes\//)
    }
  })

  it('ComponentNode의 runtime은 server이다', async () => {
    const { nodes } = await parseRemixComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.runtime).toBe('server')
    }
  })

  it('provenance.adapter가 설정된다', async () => {
    const { nodes } = await parseRemixComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]!.provenance.adapter).toBe('remix-component-parser@0.1')
  })

  it('alias import (~/routes/) → renders 엣지를 생성한다 (N-9)', async () => {
    // _index.tsx에 `import About from '~/routes/about'` 추가됨 (tsconfig ~/* → app/*)
    const { edges } = await parseRemixComponents(FIXTURE, '0.0.0-test')
    const rendersEdges = edges.filter(e => e.kind === 'renders')
    const indexToAbout = rendersEdges.some(
      e => String(e.from).includes('_index') && String(e.to).includes('about'),
    )
    expect(indexToAbout).toBe(true)
  })
})

describe('RemixAdapter', () => {
  it('hasSupabase=true면 tableNodes 배열을 반환한다', async () => {
    const adapter = new RemixAdapter()
    const result = await adapter.analyze({
      repoRoot: FIXTURE,
      analyzerVersion: '0.0.0-test',
      stack: { framework: 'remix', adapterId: 'remix', parsingLevel: 'L2',
        hasSupabase: true, hasPrisma: false, hasDexie: false, hasDrizzle: false, hasTypeOrm: false,
        hasSQLAlchemy: false, hasDjangoORM: false, hasSpringDataJpa: false,
        isMonorepo: false, appDirs: [], llmRecommended: false },
    })
    expect(Array.isArray(result.tableNodes)).toBe(true)
  })
})
