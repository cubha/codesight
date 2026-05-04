import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseNuxtComponents } from './component-parser.js'

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-nuxt-comp-test-'))
  await fs.mkdir(path.join(tmpDir, 'components'), { recursive: true })
  await fs.mkdir(path.join(tmpDir, 'pages'), { recursive: true })

  await fs.writeFile(
    path.join(tmpDir, 'components', 'UserCard.vue'),
    `<template><div>{{ name }}</div></template>
<script setup lang="ts">
defineProps<{ name: string }>()
</script>`,
  )

  await fs.writeFile(
    path.join(tmpDir, 'pages', 'index.vue'),
    `<template><UserCard name="Alice" /></template>
<script setup lang="ts">
import UserCard from '~/components/UserCard.vue'
</script>`,
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('parseNuxtComponents', () => {
  it('.vue 파일을 ComponentNode로 추출한다', async () => {
    const result = await parseNuxtComponents(tmpDir, 'test@0.1')
    expect(result.nodes.length).toBeGreaterThanOrEqual(2)
  })

  it('~/components 임포트 → componentEdge 생성', async () => {
    const result = await parseNuxtComponents(tmpDir, 'test@0.1')
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    const edge = result.edges[0]!
    expect(edge.kind).toBe('imports')
  })

  it('.vue 파일 없으면 빈 결과 반환', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-empty-'))
    const result = await parseNuxtComponents(emptyDir, 'test@0.1')
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    await fs.rm(emptyDir, { recursive: true, force: true })
  })
})

describe('parseNuxtComponents — extensionless import + template (III-B-2)', () => {
  let b2Dir: string

  beforeAll(async () => {
    b2Dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-nuxt-b2-'))
    await fs.mkdir(path.join(b2Dir, 'components'), { recursive: true })
    await fs.mkdir(path.join(b2Dir, 'pages'), { recursive: true })

    await fs.writeFile(
      path.join(b2Dir, 'components', 'MyButton.vue'),
      `<template><button>Click</button></template>`,
    )
    await fs.writeFile(
      path.join(b2Dir, 'components', 'MyCard.vue'),
      `<template><div><MyButton /></div></template>`,
    )
    await fs.writeFile(
      path.join(b2Dir, 'pages', 'index.vue'),
      `<template><MyCard /></template>
<script setup>
import MyCard from '../components/MyCard'
</script>`,
    )
  })

  afterAll(async () => {
    await fs.rm(b2Dir, { recursive: true, force: true })
  })

  it('extensionless import → .vue 파일 엣지 생성 (III-B-2)', async () => {
    const { edges } = await parseNuxtComponents(b2Dir, 'test@0.1')
    // pages/index.vue → components/MyCard.vue (extensionless import)
    expect(edges.length).toBeGreaterThanOrEqual(1)
  })

  it('template <ComponentTag> → imports 엣지 생성 (III-B-2)', async () => {
    const { edges } = await parseNuxtComponents(b2Dir, 'test@0.1')
    // MyCard.vue template has <MyButton> → edge to MyButton.vue
    const hasButtonEdge = edges.some(e => {
      const toId = e.to as string
      return toId.includes('MyButton')
    })
    expect(hasButtonEdge).toBe(true)
  })
})
