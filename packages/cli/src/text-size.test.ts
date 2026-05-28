import { describe, it, expect, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultRegistry } from '@codebase-viz/core'
import { buildDiagrams } from '@codebase-viz/renderer'
import { detectStack } from '@codebase-viz/llm'
import { createIRGraph, EMPTY_ADAPTER_RESULT, type IRGraph } from '@codebase-viz/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../../../fixtures')
const BASELINE_PATH = path.resolve(__dirname, 'text-size-baseline.json')

const FIXTURE_LIST = [
  'mini-next-app',
  'mini-nuxt-app',
  'mini-sveltekit-app',
  'mini-nest-app',
  'mini-django-app',
  'mini-fastapi-app',
  'mini-spring-app',
  'mini-flask-app',
  'mini-vue-spa-app',
  'mini-angular-app',
  'mini-remix-app',
  'mini-react-router-app',
  'mini-nextpages-app',
] as const

const MAX_LENGTH = 1_000_000

interface FixtureMeasurement {
  rendering: number
  screenComponent: number
  dbScreen: number
  exceeded: boolean
}

const results: Record<string, FixtureMeasurement> = {}

async function buildGraphForFixture(fixtureName: string): Promise<IRGraph> {
  const repoRoot = path.join(FIXTURES, fixtureName)
  const stack = await detectStack(repoRoot)
  const registry = createDefaultRegistry()
  const adapter = registry.get(stack.adapterId)
  const result = adapter !== undefined
    ? await adapter.analyze({ repoRoot, stack, analyzerVersion: 'codebase-viz@0.1.0' })
    : EMPTY_ADAPTER_RESULT

  return createIRGraph({
    analyzerVersion: 'codebase-viz@0.1.0',
    repoRoot,
    projectName: path.basename(repoRoot),
    metadata: {
      framework: stack.framework,
      hasSupabase: stack.hasSupabase,
      hasPrisma: stack.hasPrisma,
      hasDexie: stack.hasDexie,
      hasFirebase: false,
    },
    nodes: [
      ...result.routeNodes,
      ...result.componentNodes,
      ...result.tableNodes,
      ...(result.serverNodes ?? []),
    ],
    edges: [
      ...result.componentEdges,
      ...result.mapperEdges,
      ...(result.serverEdges ?? []),
    ],
  })
}

afterAll(() => {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ fixtures: results }, null, 2), 'utf8')
})

describe('Phase XI A3 — text-size 실측 (1M cap, real IRGraph)', { timeout: 30000 }, () => {
  for (const fixtureName of FIXTURE_LIST) {
    it(`${fixtureName}: 3개 다이어그램 모두 1M 이하`, async () => {
      const graph = await buildGraphForFixture(fixtureName)
      const diagrams = buildDiagrams(graph)

      const rLen = diagrams.rendering.length
      const sLen = diagrams.screenComponent.length
      const dLen = diagrams.dbScreen.length
      const exceeded = rLen > MAX_LENGTH || sLen > MAX_LENGTH || dLen > MAX_LENGTH

      results[fixtureName] = {
        rendering: rLen,
        screenComponent: sLen,
        dbScreen: dLen,
        exceeded,
      }

      console.log(
        `[text-size] ${fixtureName}: rendering=${rLen} screenComponent=${sLen} dbScreen=${dLen} nodes=${graph.nodes.length} edges=${graph.edges.length}`,
      )

      expect(rLen).toBeLessThanOrEqual(MAX_LENGTH)
      expect(sLen).toBeLessThanOrEqual(MAX_LENGTH)
      expect(dLen).toBeLessThanOrEqual(MAX_LENGTH)
    })
  }
})
