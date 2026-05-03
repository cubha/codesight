import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type Parser from 'web-tree-sitter'
import {
  createRouteNode,
  makeNodeId,
  astToProvenance,
  type RouteNode,
  type DynamicSegmentType,
} from '@codebase-viz/types'
import { createPythonParser } from '../../_shared/tree-sitter-loader.js'

const EXCLUDE_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'venv', '.venv', 'env'])

async function findUrlFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(fullPath)
      } else if (entry.isFile() && entry.name === 'urls.py') {
        results.push(fullPath)
      }
    }
  }
  await recurse(repoRoot)
  return results
}

// Converts Django path converter syntax to :param format.
// <int:pk> → :pk, <str:name> → :name, <slug:slug> → :slug, <pk> → :pk
function normalizeDjangoPattern(pattern: string): { urlPath: string; dynamicSegmentType: DynamicSegmentType } {
  const normalized = pattern
    .replace(/<\w+:(\w+)>/g, ':$1')   // <type:name> → :name
    .replace(/<(\w+)>/g, ':$1')        // <name> → :name
    .replace(/\/+$/, '')               // strip trailing slash
  const urlPath = normalized.startsWith('/') ? normalized : '/' + normalized
  const dynamicSegmentType: DynamicSegmentType = urlPath.includes(':') ? 'dynamic' : 'static'
  return { urlPath, dynamicSegmentType }
}

function extractStringValue(node: Parser.SyntaxNode): string | undefined {
  // string → string_content
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null && child.type === 'string_content') return child.text
  }
  // concatenated string
  if (node.type === 'concatenated_string') {
    let result = ''
    for (let i = 0; i < node.childCount; i++) {
      const part = node.child(i)
      if (part !== null && part.type === 'string') {
        const val = extractStringValue(part)
        if (val !== undefined) result += val
      }
    }
    return result || undefined
  }
  return undefined
}

function isIncludeCall(node: Parser.SyntaxNode): boolean {
  // call where function identifier is 'include'
  if (node.type !== 'call') return false
  const func = node.child(0)
  return func !== null && func.text === 'include'
}

function extractPathCalls(
  node: Parser.SyntaxNode,
  relPath: string,
  analyzerVersion: string,
): RouteNode[] {
  const routes: RouteNode[] = []
  if (node.type === 'call') {
    const func = node.child(0)
    if (func !== null && (func.text === 'path' || func.text === 're_path')) {
      const args = node.child(1)
      if (args !== null && args.type === 'argument_list') {
        const firstArg = args.namedChild(0)
        const secondArg = args.namedChild(1)
        if (
          firstArg !== null &&
          (firstArg.type === 'string' || firstArg.type === 'concatenated_string') &&
          secondArg !== null &&
          !isIncludeCall(secondArg)
        ) {
          const rawPattern = extractStringValue(firstArg)
          if (rawPattern !== undefined && rawPattern !== '') {
            const { urlPath, dynamicSegmentType } = normalizeDjangoPattern(rawPattern)
            if (urlPath !== '/') {
              routes.push(
                createRouteNode({
                  id: makeNodeId('route', relPath, urlPath),
                  path: urlPath,
                  filePath: relPath,
                  routeFileKind: 'route-handler',
                  dynamicSegmentType,
                  isGroupRoute: false,
                  renderingMode: 'SSR',
                  provenance: astToProvenance(
                    relPath,
                    { row: node.startPosition.row, column: node.startPosition.column },
                    'django@0.1',
                    analyzerVersion,
                  ),
                  confidence: 'verified',
                }),
              )
            }
          }
        }
      }
    }
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null) routes.push(...extractPathCalls(child, relPath, analyzerVersion))
  }
  return routes
}

export async function parseUrls(
  repoRoot: string,
  analyzerVersion = 'codebase-viz@0.1.0',
): Promise<RouteNode[]> {
  const urlFiles = await findUrlFiles(repoRoot)
  if (urlFiles.length === 0) return []

  const parser = await createPythonParser()
  const routes: RouteNode[] = []

  for (const absPath of urlFiles) {
    const source = await fs.readFile(absPath, 'utf-8').catch(() => null)
    if (source === null) continue
    const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/')
    const tree = parser.parse(source)
    routes.push(...extractPathCalls(tree.rootNode, relPath, analyzerVersion))
  }

  return routes
}
