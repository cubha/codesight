import * as path from 'node:path'
import * as os from 'node:os'
import { parseRoutes, parseComponents, parseTables, mapScreenToTable, mapServerFilesToTable } from '@codebase-viz/core'
import { renderMermaid } from '@codebase-viz/renderer'
import { createIRGraph, type IRGraph } from '@codebase-viz/types'
import {
  detectStack,
  collectFiles,
  analyzWithLLM,
  convertToIR,
  verifyNodes,
  mergeGraphs,
} from '@codebase-viz/llm'

export interface LLMOptions {
  apiKey: string
  model?: string
}

export async function runAnalysis(
  repoRoot: string,
  llmOptions?: LLMOptions,
): Promise<IRGraph> {
  const [routeNodes, { nodes: componentNodes, edges: componentEdges }, tableNodes, stack] =
    await Promise.all([
      parseRoutes(repoRoot),
      parseComponents(repoRoot),
      parseTables(repoRoot),
      detectStack(repoRoot),
    ])

  const staticGraph = createIRGraph({
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
    nodes: [...routeNodes, ...componentNodes, ...tableNodes],
    edges: componentEdges,
  })

  const mapperEdges = await mapScreenToTable(staticGraph)
  const { nodes: serverNodes, edges: serverEdges } = await mapServerFilesToTable(repoRoot, tableNodes)
  let finalGraph: IRGraph = {
    ...staticGraph,
    nodes: [...staticGraph.nodes, ...serverNodes],
    edges: [...staticGraph.edges, ...mapperEdges, ...serverEdges],
  }

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

  const outputDir = path.join(repoRoot, '.codesight')
  await renderMermaid(finalGraph, outputDir).catch(() => { /* best-effort */ })

  return finalGraph
}

export async function getCacheDir(): Promise<string> {
  return path.join(os.homedir(), '.codesight', 'cache')
}
