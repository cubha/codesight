import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVueSpaComponents } from './component-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/mini-vue-spa-app')

describe('parseVueSpaComponents', () => {
  it('.vue SFC 파일들을 ComponentNode로 파싱한다', async () => {
    const { nodes } = await parseVueSpaComponents(FIXTURE, '0.0.0-test')
    // src/views/About.vue, Home.vue, UserDetail.vue, Users.vue
    expect(nodes.length).toBeGreaterThanOrEqual(4)
    const names = nodes.map(n => n.name)
    expect(names).toContain('Home')
    expect(names).toContain('Users')
    expect(names).toContain('UserDetail')
  })

  it('Vue SPA ComponentNode의 runtime은 client이다', async () => {
    const { nodes } = await parseVueSpaComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(node.runtime).toBe('client')
    }
  })

  it('.vue import → imports 엣지를 생성한다', async () => {
    const { edges } = await parseVueSpaComponents(FIXTURE, '0.0.0-test')
    const importsEdges = edges.filter(e => e.kind === 'imports')
    // Users.vue imports UserDetail.vue
    expect(importsEdges.length).toBeGreaterThanOrEqual(1)
  })

  it('template 컴포넌트 태그 → imports 엣지를 생성한다', async () => {
    const { edges } = await parseVueSpaComponents(FIXTURE, '0.0.0-test')
    // Users.vue uses <UserDetail /> in template
    const edgesFromUsers = edges.filter(e => String(e.from).includes('Users'))
    expect(edgesFromUsers.length).toBeGreaterThanOrEqual(1)
  })

  it('provenance.adapter가 설정된다', async () => {
    const { nodes } = await parseVueSpaComponents(FIXTURE, '0.0.0-test')
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes[0]!.provenance.adapter).toBe('vue-spa-component-parser@0.1')
  })
})
