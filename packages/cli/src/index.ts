import * as path from 'node:path'
import * as process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createDefaultRegistry } from '@codebase-viz/core'
import { renderMermaid } from '@codebase-viz/renderer'
import { createIRGraph, EMPTY_ADAPTER_RESULT } from '@codebase-viz/types'
import {
  detectStack,
  collectFiles,
  analyzWithLLM,
  convertToIR,
  verifyNodes,
  mergeGraphs,
} from '@codebase-viz/llm'

export async function analyze(
  repoRoot: string,
  outputDir: string,
  llmOptions?: { apiKey: string; model?: string },
): Promise<void> {
  const stack = await detectStack(repoRoot)
  const registry = createDefaultRegistry()
  const adapter = registry.get(stack.adapterId)

  const result = adapter !== undefined
    ? await adapter.analyze({ repoRoot, stack, analyzerVersion: 'codebase-viz@0.1.0' })
    : EMPTY_ADAPTER_RESULT

  let finalGraph = createIRGraph({
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

  if (llmOptions !== undefined) {
    const fileContents = await collectFiles(repoRoot, stack)

    const llmResult = await analyzWithLLM(llmOptions, {
      projectName: path.basename(repoRoot),
      framework: stack.framework,
      fileContents,
    })

    const { routeNodes: llmRoutes, componentNodes: llmComponents, tableNodes: llmTables, edges: llmEdges } =
      convertToIR(llmResult, repoRoot, 'codebase-viz@0.1.0')

    const allLLMNodes = [...llmRoutes, ...llmComponents, ...llmTables]
    const { verified } = await verifyNodes(allLLMNodes, repoRoot)

    const llmMeta = {
      framework: llmResult.framework || stack.framework,
      hasSupabase: llmResult.hasSupabase ?? stack.hasSupabase,
      hasPrisma: llmResult.hasPrisma ?? stack.hasPrisma,
      hasDexie: llmResult.hasDexie ?? stack.hasDexie,
      hasFirebase: llmResult.hasFirebase ?? false,
      ...(llmResult.deployTarget !== undefined ? { deployTarget: llmResult.deployTarget } : {}),
      ...(llmResult.backendServices !== undefined && llmResult.backendServices.length > 0
        ? { backends: llmResult.backendServices }
        : {}),
    }
    finalGraph = {
      ...mergeGraphs(finalGraph, verified, llmEdges),
      metadata: llmMeta,
    }
  }

  await renderMermaid(finalGraph, outputDir)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const subcommand = args[0]

  if (subcommand !== 'analyze') {
    console.error('Usage: codebase-viz analyze <path> [--output <dir>] [--with-llm] [--api-key <key>] [--model <model>]')
    process.exit(1)
  }

  const targetPath = args[1]
  if (targetPath === undefined || targetPath === '') {
    console.error('Error: <path> is required')
    process.exit(1)
  }

  const outputFlagIndex = args.indexOf('--output')
  const outputArg = outputFlagIndex !== -1 ? args[outputFlagIndex + 1] : undefined

  const withLLM = args.includes('--with-llm')
  const apiKeyFlagIndex = args.indexOf('--api-key')
  const apiKeyArg = apiKeyFlagIndex !== -1 ? args[apiKeyFlagIndex + 1] : undefined
  const apiKey = apiKeyArg ?? process.env['CODESIGHT_API_KEY']

  const modelFlagIndex = args.indexOf('--model')
  const model = modelFlagIndex !== -1 ? args[modelFlagIndex + 1] : undefined

  const repoRoot = path.resolve(targetPath)
  const outputDir =
    outputArg !== undefined && outputArg !== ''
      ? path.resolve(outputArg)
      : path.join(repoRoot, '.codebase-viz')

  if (withLLM && (apiKey === undefined || apiKey === '')) {
    console.error('Error: --with-llm requires --api-key <key> or CODESIGHT_API_KEY env var')
    process.exit(1)
  }

  const llmOptions = withLLM && apiKey !== undefined
    ? { apiKey, ...(model !== undefined ? { model } : {}) }
    : undefined

  console.log(`Analyzing: ${repoRoot}`)
  if (llmOptions !== undefined) console.log('  LLM analysis: enabled')
  await analyze(repoRoot, outputDir, llmOptions)
  console.log(`Output written to: ${outputDir}`)
  console.log('  rendering.md')
  console.log('  screen-component.md')
  console.log('  db-screen.md')
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
