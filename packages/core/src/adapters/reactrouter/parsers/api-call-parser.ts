import * as path from 'node:path'
import {
  createEdge,
  makeEdgeId,
  makeNodeId,
  type ComponentNode,
  type IREdge,
  type NodeId,
} from '@codebase-viz/types'
import { extractFeCalls } from '../../_shared/fe-call-extractor.js'

export async function parseApiCalls(
  repoRoot: string,
  componentNodes: ComponentNode[],
  analyzerVersion: string,
): Promise<IREdge[]> {
  if (componentNodes.length === 0) return []

  const filePaths = Array.from(new Set(componentNodes.map(c => path.resolve(repoRoot, c.filePath))))
  const calls = await extractFeCalls(filePaths, repoRoot, analyzerVersion)
  if (calls.length === 0) return []

  const fileToComponentId = new Map<string, NodeId>()
  for (const c of componentNodes) {
    if (!fileToComponentId.has(c.filePath)) fileToComponentId.set(c.filePath, c.id)
  }

  const edges: IREdge[] = []
  const seen = new Set<string>()
  for (const call of calls) {
    const fromId = fileToComponentId.get(call.filePath)
    if (fromId === undefined) continue

    const method = call.method.toUpperCase()
    const dedupeKey = `${fromId}::${method}::${call.url}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const toId = makeNodeId('endpoint', 'virtual', `${method}:${call.url}`)
    const library = call.library

    const base = {
      id: makeEdgeId('api-call', fromId, toId),
      from: fromId,
      to: toId,
      kind: 'api-call' as const,
      apiCall: { method, path: call.url, library },
      provenance: {
        file: call.filePath,
        line: call.line,
        adapter: 'react-router-api-call@0.1',
        analyzerVersion,
      },
    }

    edges.push(
      call.confidence === 'verified'
        ? createEdge({ ...base, confidence: 'verified' })
        : createEdge({
            ...base,
            confidence: 'inferred',
            inferenceChain: call.inferenceChain ?? ['template-literal'],
          }),
    )
  }
  return edges
}
