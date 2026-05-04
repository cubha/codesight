import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseSvelteComponents } from './component-parser.js'
import { SvelteKitAdapter } from '../adapter.js'

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-svelte-comp-test-'))
  await fs.mkdir(path.join(tmpDir, 'src', 'lib'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, 'src', 'routes'), { recursive: true })

  await fs.writeFile(
    path.join(tmpDir, 'src', 'lib', 'UserCard.svelte'),
    `<script lang="ts">
  export let name: string
</script>
<div>{name}</div>`,
  )

  await fs.writeFile(
    path.join(tmpDir, 'src', 'routes', '+page.svelte'),
    `<script lang="ts">
  import UserCard from '$lib/UserCard.svelte'
</script>
<UserCard name="Alice" />`,
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('parseSvelteComponents', () => {
  it('.svelte 파일을 ComponentNode로 추출한다', async () => {
    const result = await parseSvelteComponents(tmpDir, 'test@0.1')
    expect(result.nodes.length).toBeGreaterThanOrEqual(2)
  })

  it('$lib 임포트 → componentEdge 생성', async () => {
    const result = await parseSvelteComponents(tmpDir, 'test@0.1')
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
  })

  it('.svelte 파일 없으면 빈 결과 반환', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-empty-'))
    const result = await parseSvelteComponents(emptyDir, 'test@0.1')
    expect(result.nodes).toHaveLength(0)
    await fs.rm(emptyDir, { recursive: true, force: true })
  })
})

describe('runtime 판정', () => {
  it('+page.svelte 단독 → runtime: client', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-rt-client-'))
    await fs.mkdir(path.join(dir, 'src', 'routes'), { recursive: true })

    await fs.writeFile(
      path.join(dir, 'src', 'routes', '+page.svelte'),
      `<script lang="ts">
  const x = 1
</script>`,
    )

    const result = await parseSvelteComponents(dir, 'test@0.1')
    const pageNode = result.nodes.find(n => n.name === '+page')
    expect(pageNode).toBeDefined()
    expect(pageNode?.runtime).toBe('client')

    await fs.rm(dir, { recursive: true, force: true })
  })

  it('+page.svelte + +page.server.ts → runtime: shared', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-rt-shared-'))
    await fs.mkdir(path.join(dir, 'src', 'routes'), { recursive: true })

    await fs.writeFile(
      path.join(dir, 'src', 'routes', '+page.svelte'),
      `<script lang="ts">
  export let data: { message: string }
</script>`,
    )
    await fs.writeFile(
      path.join(dir, 'src', 'routes', '+page.server.ts'),
      `export async function load() { return { message: 'hello' } }`,
    )

    const result = await parseSvelteComponents(dir, 'test@0.1')
    const pageNode = result.nodes.find(n => n.name === '+page')
    expect(pageNode).toBeDefined()
    expect(pageNode?.runtime).toBe('shared')

    await fs.rm(dir, { recursive: true, force: true })
  })

  it('+page.server.ts 단독 → runtime: server', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-rt-server-'))
    await fs.mkdir(path.join(dir, 'src', 'routes'), { recursive: true })

    await fs.writeFile(
      path.join(dir, 'src', 'routes', '+page.server.ts'),
      `export async function load() { return {} }`,
    )

    const result = await parseSvelteComponents(dir, 'test@0.1')
    const serverNode = result.nodes.find(n => n.name === '+page')
    expect(serverNode).toBeDefined()
    expect(serverNode?.runtime).toBe('server')

    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('parseSvelteComponents — svelte.config.js alias (III-B-3)', () => {
  let b3Dir: string

  beforeAll(async () => {
    b3Dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-svelte-b3-'))
    await fs.mkdir(path.join(b3Dir, 'src', 'components'), { recursive: true })
    await fs.mkdir(path.join(b3Dir, 'src', 'routes'), { recursive: true })

    await fs.writeFile(
      path.join(b3Dir, 'svelte.config.js'),
      `export default {
  kit: {
    alias: {
      '$components': 'src/components'
    }
  }
}`,
    )
    await fs.writeFile(
      path.join(b3Dir, 'src', 'components', 'Header.svelte'),
      `<script>export let title = ''</script><header>{title}</header>`,
    )
    await fs.writeFile(
      path.join(b3Dir, 'src', 'routes', '+page.svelte'),
      `<script>
  import Header from '$components/Header.svelte'
</script>
<Header title="Home" />`,
    )
  })

  afterAll(async () => {
    await fs.rm(b3Dir, { recursive: true, force: true })
  })

  it('svelte.config.js alias로 $components 임포트 해소 (III-B-3)', async () => {
    const result = await parseSvelteComponents(b3Dir, 'test@0.1')
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    const hasEdge = result.edges.some(e => {
      const to = e.to as string
      return to.includes('Header')
    })
    expect(hasEdge).toBe(true)
  })
})

describe('SvelteKitAdapter — hasSupabase', () => {
  let fixtureDir: string

  beforeAll(async () => {
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-svelte-supabase-'))
    await fs.mkdir(path.join(fixtureDir, 'src', 'routes'), { recursive: true })
    await fs.writeFile(
      path.join(fixtureDir, 'src', 'routes', '+page.svelte'),
      `<script lang="ts">const x = 1</script>`,
    )
  })

  afterAll(async () => {
    await fs.rm(fixtureDir, { recursive: true, force: true })
  })

  it('sveltekit adapter: hasSupabase=true면 tableNodes 배열 반환', async () => {
    const adapter = new SvelteKitAdapter()
    const result = await adapter.analyze({
      repoRoot: fixtureDir,
      analyzerVersion: '0.0.0-test',
      stack: { framework: 'sveltekit', adapterId: 'sveltekit', parsingLevel: 'L1',
        hasSupabase: true, hasPrisma: false, hasDexie: false, hasDrizzle: false, hasTypeOrm: false,
        hasSQLAlchemy: false, hasDjangoORM: false, hasSpringDataJpa: false,
        isMonorepo: false, appDirs: [], llmRecommended: false },
    })
    expect(Array.isArray(result.tableNodes)).toBe(true)
  })
})
