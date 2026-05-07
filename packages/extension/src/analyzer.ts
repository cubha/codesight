import * as path from 'node:path'
import * as os from 'node:os'
import { createDefaultRegistry, extractFeCalls, matchFeCallsToBeRoutes, remapCrossEdgeFromIds } from '@codebase-viz/core'
import {
  renderMermaid,
  buildDiagrams,
  DEFAULT_GROUPING,
  type DiagramSet,
  type GroupingOptions,
} from '@codebase-viz/renderer'
import { createIRGraph, EMPTY_ADAPTER_RESULT, isComponentNode, isRouteNode, type IREdge, type IRGraph } from '@codebase-viz/types'
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

export interface AnalysisResult {
  graph: IRGraph
  diagrams: DiagramSet
  pair?: { graph: IRGraph; crossEdges: IREdge[] }
}

export interface RunAnalysisOptions {
  llm?: LLMOptions
  grouping?: GroupingOptions
  pairRepoRoot?: string
}

export async function runAnalysis(
  repoRoot: string,
  options?: RunAnalysisOptions | LLMOptions,
): Promise<AnalysisResult> {
  const opts: RunAnalysisOptions = options !== undefined && 'apiKey' in options
    ? { llm: options }
    : (options ?? {})
  const llmOptions = opts.llm
  const grouping: GroupingOptions = { ...DEFAULT_GROUPING, ...(opts.grouping ?? {}) }
  const stack = await detectStack(repoRoot)
  const registry = createDefaultRegistry()
  const adapter = registry.get(stack.adapterId)

  const result = adapter !== undefined
    ? await adapter.analyze({ repoRoot, stack, analyzerVersion: 'codebase-viz@0.1.0' })
    : EMPTY_ADAPTER_RESULT

  let finalGraph: IRGraph = createIRGraph({
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

  const outputDir = path.join(repoRoot, '.codesight')
  await renderMermaid(finalGraph, outputDir).catch(() => { /* best-effort */ })

  if (opts.pairRepoRoot !== undefined) {
    const pairResult = await buildPairResult(finalGraph, opts.pairRepoRoot, grouping)
    return { graph: finalGraph, diagrams: buildDiagrams(finalGraph, { grouping }), pair: pairResult }
  }

  return { graph: finalGraph, diagrams: buildDiagrams(finalGraph, { grouping }) }
}

async function buildPairResult(
  feGraph: IRGraph,
  pairRepoRoot: string,
  grouping: Required<GroupingOptions>,
): Promise<{ graph: IRGraph; crossEdges: IREdge[] }> {
  const pairStack = await detectStack(pairRepoRoot)
  const registry = createDefaultRegistry()
  const pairAdapter = registry.get(pairStack.adapterId)
  const pairAdapterResult = pairAdapter !== undefined
    ? await pairAdapter.analyze({ repoRoot: pairRepoRoot, stack: pairStack, analyzerVersion: 'codebase-viz@0.1.0' })
    : EMPTY_ADAPTER_RESULT

  const beGraph = createIRGraph({
    analyzerVersion: 'codebase-viz@0.1.0',
    repoRoot: pairRepoRoot,
    projectName: path.basename(pairRepoRoot),
    metadata: {
      framework: pairStack.framework,
      hasSupabase: pairStack.hasSupabase,
      hasPrisma: pairStack.hasPrisma,
      hasDexie: pairStack.hasDexie,
      hasFirebase: false,
    },
    nodes: [
      ...pairAdapterResult.routeNodes,
      ...pairAdapterResult.componentNodes,
      ...pairAdapterResult.tableNodes,
      ...(pairAdapterResult.serverNodes ?? []),
    ],
    edges: [
      ...pairAdapterResult.componentEdges,
      ...pairAdapterResult.mapperEdges,
      ...(pairAdapterResult.serverEdges ?? []),
    ],
  })

  // Extract FE fetch calls from component file paths
  const feComponentFiles = feGraph.nodes
    .filter(isComponentNode)
    .map(n => path.join(feGraph.repoRoot, n.filePath))

  const feCalls = await extractFeCalls(feComponentFiles, feGraph.repoRoot, 'codebase-viz@0.1.0')

  const beRoutes = beGraph.nodes.filter(isRouteNode)
  const rawEdges = matchFeCallsToBeRoutes(feCalls, beRoutes, {
    fromRepoRoot: feGraph.repoRoot,
    toRepoRoot: pairRepoRoot,
    analyzerVersion: 'codebase-viz@0.1.0',
  })
  const crossEdges = remapCrossEdgeFromIds(rawEdges, feGraph)

  return { graph: beGraph, crossEdges }
}

export async function getCacheDir(): Promise<string> {
  return path.join(os.homedir(), '.codesight', 'cache')
}
