import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultRegistry } from '@codebase-viz/core'
import { detectStack } from '@codebase-viz/llm'
import { EMPTY_ADAPTER_RESULT } from '@codebase-viz/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../../../fixtures')

describe('Stack routing integration — Phase A', () => {
  const registry = createDefaultRegistry()

  it('mini-next-app: NextJsAdapter 정상 동작 (회귀 보장)', async () => {
    const repoRoot = path.join(FIXTURES, 'mini-next-app')
    const stack = await detectStack(repoRoot)
    expect(stack.adapterId).toBe('nextjs-app-router')
    expect(stack.parsingLevel).toBe('L1')
    expect(stack.llmRecommended).toBe(false)

    const adapter = registry.get(stack.adapterId)
    expect(adapter).toBeDefined()
    const result = await adapter!.analyze({
      repoRoot,
      stack,
      analyzerVersion: 'codebase-viz@0.1.0',
    })
    expect(result.routeNodes.length).toBeGreaterThan(0)
    expect(result.tableNodes.length).toBeGreaterThan(0)
  })

  it('mini-nuxt-app: NuxtAdapter 정상 동작 (Phase B)', async () => {
    const repoRoot = path.join(FIXTURES, 'mini-nuxt-app')
    const stack = await detectStack(repoRoot)
    expect(stack.framework).toBe('nuxt')
    expect(stack.adapterId).toBe('nuxt')
    expect(stack.parsingLevel).toBe('L1')
    expect(stack.llmRecommended).toBe(false)

    const adapter = registry.get(stack.adapterId)
    expect(adapter).toBeDefined()
    const result = await adapter!.analyze({
      repoRoot,
      stack,
      analyzerVersion: 'codebase-viz@0.1.0',
    })
    expect(result.routeNodes.length).toBeGreaterThan(0)
  })

  it('mini-sveltekit-app: SvelteKitAdapter 정상 동작 (Phase B)', async () => {
    const repoRoot = path.join(FIXTURES, 'mini-sveltekit-app')
    const stack = await detectStack(repoRoot)
    expect(stack.framework).toBe('sveltekit')
    expect(stack.adapterId).toBe('sveltekit')
    expect(stack.parsingLevel).toBe('L1')
    expect(stack.llmRecommended).toBe(false)

    const adapter = registry.get(stack.adapterId)
    expect(adapter).toBeDefined()
    const result = await adapter!.analyze({
      repoRoot,
      stack,
      analyzerVersion: 'codebase-viz@0.1.0',
    })
    expect(result.routeNodes.length).toBeGreaterThan(0)
  })

  it('mini-nest-app: NestJS 감지하지만 어댑터 미등록 (Phase C 예정)', async () => {
    const repoRoot = path.join(FIXTURES, 'mini-nest-app')
    const stack = await detectStack(repoRoot)
    expect(stack.framework).toBe('nestjs')
    expect(stack.adapterId).toBe('nestjs')
    expect(stack.parsingLevel).toBe('L2')
    expect(stack.llmRecommended).toBe(true)

    const adapter = registry.get(stack.adapterId)
    expect(adapter).toBeUndefined()
  })

  it('mini-spring-app: package.json 없음 → unknown, L3', async () => {
    const repoRoot = path.join(FIXTURES, 'mini-spring-app')
    const stack = await detectStack(repoRoot)
    expect(stack.framework).toBe('unknown')
    expect(stack.adapterId).toBeUndefined()
    expect(stack.parsingLevel).toBe('L3')
    expect(stack.llmRecommended).toBe(true)

    expect(registry.get(stack.adapterId)).toBeUndefined()
  })

  it('mini-vanilla: 알려진 framework 없음 → unknown, L3', async () => {
    const repoRoot = path.join(FIXTURES, 'mini-vanilla')
    const stack = await detectStack(repoRoot)
    expect(stack.framework).toBe('unknown')
    expect(stack.adapterId).toBeUndefined()
    expect(stack.parsingLevel).toBe('L3')
    expect(stack.llmRecommended).toBe(true)
  })

  it('EMPTY_ADAPTER_RESULT는 graph 조립 시 안전한 기본값을 제공한다', () => {
    expect(EMPTY_ADAPTER_RESULT.routeNodes).toEqual([])
    expect(EMPTY_ADAPTER_RESULT.componentNodes).toEqual([])
    expect(EMPTY_ADAPTER_RESULT.tableNodes).toEqual([])
    expect(EMPTY_ADAPTER_RESULT.componentEdges).toEqual([])
    expect(EMPTY_ADAPTER_RESULT.mapperEdges).toEqual([])
  })
})
