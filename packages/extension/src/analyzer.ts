import * as fs from 'node:fs/promises'
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
  provider?: 'anthropic' | 'google' | 'openai'
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

  if (llmOptions === undefined && opts.pairRepoRoot === undefined) {
    const cached = await loadCachedGraph(repoRoot)
    if (cached !== null) {
      return { graph: cached, diagrams: buildDiagrams(cached, { grouping }) }
    }
  }

  const stack = await detectStack(repoRoot)
  const registry = createDefaultRegistry()

  if (stack.adapterId === undefined && stack.llmRecommended && llmOptions === undefined) {
    throw new Error(
      `이 프레임워크(${stack.framework})는 LLM 분석이 필요합니다. API Key를 설정해 주세요.`,
    )
  }

  const adapter = registry.get(stack.adapterId)

  const result = adapter !== undefined
    ? await adapter.analyze({ repoRoot, stack, analyzerVersion: ANALYZER_VERSION })
    : EMPTY_ADAPTER_RESULT

  let finalGraph: IRGraph = createIRGraph({
    analyzerVersion: ANALYZER_VERSION,
    repoRoot,
    projectName: path.basename(repoRoot),
    metadata: {
      framework: stack.framework,
      hasSupabase: stack.hasSupabase,
      hasPrisma: stack.hasPrisma,
      hasDexie: stack.hasDexie,
      hasFirebase: false,
      ...(adapter !== undefined ? { adapterCategory: adapter.category } : {}),
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

    let llmResult
    try {
      llmResult = await analyzWithLLM(llmOptions, {
        projectName: path.basename(repoRoot),
        framework: stack.framework,
        fileContents,
      })
    } catch (err) {
      // LLM 호출 실패 시 provider/model 컨텍스트와 raw 에러를 한 번에 surface
      const provider = llmOptions.provider ?? 'anthropic'
      const model = llmOptions.model ?? '(default)'
      const errMsg = err instanceof Error ? err.message : String(err)
      const errName = err instanceof Error ? err.name : 'Unknown'
      throw new Error(
        `LLM 호출 실패 [provider=${provider} model=${model}]: ${errName}: ${errMsg}. ` +
        `keyword Not Found이면 모델 ID 또는 API endpoint 확인, 401/403이면 API 키 권한 확인.`,
      )
    }

    // v1.2.45 결함 #13: 정적 어댑터가 component를 verified로 등록한 경우 LLM component skip.
    // v1.2.45 #18 (회귀 해소): adapter 존재 여부가 아닌 "adapter가 실제 component를 만들었는지"로 분기.
    // turborepo/monorepo 케이스(fa-support 등)에서 NextAdapter는 repoRoot의 단일 appDir만 보므로
    // 0 component 생성 → adapter !== undefined만 보고 skip하면 LLM component까지 차단 → file_leaf 0건 회귀.
    const adapterHasComponents = result.componentNodes.length > 0
    const { routeNodes: llmRoutes, componentNodes: llmComponents, tableNodes: llmTables, edges: llmEdges } =
      convertToIR(llmResult, repoRoot, ANALYZER_VERSION, { skipComponents: adapterHasComponents })

    const allLLMNodes = [...llmRoutes, ...llmComponents, ...llmTables]
    const { verified } = await verifyNodes(allLLMNodes, repoRoot)

    const llmMeta = {
      // v1.2.45 결함 #10: 정적 어댑터가 결정한 framework는 LLM이 덮어쓰지 못한다.
      // LLM이 mini-react-partner-mock-app을 'vite-react'로 분류하면 isFileTreeTab2Eligible 화이트리스트
      // 통과 실패 → Tab2 file-tree 표준 우회 → legacy renderScreenSection fallback이 1.2.44 마이그레이션
      // 구조(파일 경로 leaf)를 잃는다. stack.adapterId 있으면 stack.framework 신뢰.
      framework: adapter !== undefined ? stack.framework : (llmResult.framework || stack.framework),
      hasSupabase: llmResult.hasSupabase ?? stack.hasSupabase,
      hasPrisma: llmResult.hasPrisma ?? stack.hasPrisma,
      hasDexie: llmResult.hasDexie ?? stack.hasDexie,
      hasFirebase: llmResult.hasFirebase ?? false,
      ...(adapter !== undefined ? { adapterCategory: adapter.category } : {}),
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

  const outputDir = path.join(repoRoot, '.codebase-viz')
  await renderMermaid(finalGraph, outputDir).catch(() => { /* best-effort */ })
  await saveCachedGraph(repoRoot, finalGraph)

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
    ? await pairAdapter.analyze({ repoRoot: pairRepoRoot, stack: pairStack, analyzerVersion: ANALYZER_VERSION })
    : EMPTY_ADAPTER_RESULT

  const beGraph = createIRGraph({
    analyzerVersion: ANALYZER_VERSION,
    repoRoot: pairRepoRoot,
    projectName: path.basename(pairRepoRoot),
    metadata: {
      framework: pairStack.framework,
      hasSupabase: pairStack.hasSupabase,
      hasPrisma: pairStack.hasPrisma,
      hasDexie: pairStack.hasDexie,
      hasFirebase: false,
      ...(pairAdapter !== undefined ? { adapterCategory: pairAdapter.category } : {}),
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

  const feCalls = await extractFeCalls(feComponentFiles, feGraph.repoRoot, ANALYZER_VERSION)

  const beRoutes = beGraph.nodes.filter(isRouteNode)
  const rawEdges = matchFeCallsToBeRoutes(feCalls, beRoutes, {
    fromRepoRoot: feGraph.repoRoot,
    toRepoRoot: pairRepoRoot,
    analyzerVersion: ANALYZER_VERSION,
  })
  const crossEdges = remapCrossEdgeFromIds(rawEdges, feGraph)

  return { graph: beGraph, crossEdges }
}

export const ANALYZER_VERSION = 'codebase-viz@1.1.4'

interface CacheEntry {
  analyzerVersion: string
  graph: IRGraph
}

export async function loadCachedGraph(repoRoot: string): Promise<IRGraph | null> {
  const candidates = [
    path.join(repoRoot, '.codebase-viz', 'cache.json'),
    path.join(repoRoot, '.codesight', 'cache.json'),
  ]
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const entry = JSON.parse(raw) as CacheEntry
      if (entry.analyzerVersion !== ANALYZER_VERSION) continue
      return entry.graph
    } catch {
      continue
    }
  }
  return null
}

export async function saveCachedGraph(repoRoot: string, graph: IRGraph): Promise<void> {
  try {
    const dir = path.join(repoRoot, '.codebase-viz')
    await fs.mkdir(dir, { recursive: true })
    const entry: CacheEntry = { analyzerVersion: ANALYZER_VERSION, graph }
    await fs.writeFile(path.join(dir, 'cache.json'), JSON.stringify(entry), 'utf8')
  } catch {
    // best-effort
  }
}

export async function getCacheDir(): Promise<string> {
  return path.join(os.homedir(), '.codebase-viz', 'cache')
}
