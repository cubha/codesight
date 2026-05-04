import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAngularComponents } from './component-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/mini-angular-app')

describe('parseAngularComponents', () => {
  it('@Component() 데코레이터 파일들을 ComponentNode로 파싱한다', async () => {
    const { nodes } = await parseAngularComponents(FIXTURE, '0.0.0-test')
    // home, about, users, user-detail
    expect(nodes.length).toBeGreaterThanOrEqual(3)
    const names = nodes.map(n => n.name)
    expect(names).toContain('HomeComponent')
    expect(names).toContain('AboutComponent')
    expect(names).toContain('UsersComponent')
  })

  it('Angular ComponentNode의 runtime은 client이다', async () => {
    const { nodes } = await parseAngularComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.runtime).toBe('client')
    }
  })

  it('@Component.imports 배열 → imports 엣지를 생성한다', async () => {
    const { edges } = await parseAngularComponents(FIXTURE, '0.0.0-test')
    const importsEdges = edges.filter(e => e.kind === 'imports')
    // HomeComponent imports UsersComponent
    expect(importsEdges.length).toBeGreaterThanOrEqual(1)
    const fromNames = importsEdges.map(e => String(e.from))
    expect(fromNames.some(n => n.includes('HomeComponent'))).toBe(true)
  })

  it('provenance.adapter가 설정된다', async () => {
    const { nodes } = await parseAngularComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]!.provenance.adapter).toBe('angular-component-parser@0.1')
  })

  it('template 내 selector 태그 → renders 엣지 생성 (IV-4)', async () => {
    // home.component.ts에 <app-users /> 포함됨 (fixture에 이미 추가됨)
    const { nodes, edges } = await parseAngularComponents(FIXTURE, '0.0.0-test')
    const homeNode = nodes.find(n => n.name === 'HomeComponent')
    const usersNode = nodes.find(n => n.name === 'UsersComponent')
    expect(homeNode).toBeDefined()
    expect(usersNode).toBeDefined()
    const rendersEdges = edges.filter(e => e.kind === 'renders')
    expect(rendersEdges.some(e => e.from === homeNode?.id && e.to === usersNode?.id)).toBe(true)
  })
})
