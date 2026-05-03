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
import { normalizeUrlPath } from '../../_shared/url-path-normalizer.js'

const EXCLUDE_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'venv', '.venv', 'env'])
const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options'])

async function findPyFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        results.push(fullPath)
      }
    }
  }
  await recurse(repoRoot)
  return results
}

function extractStringValue(node: Parser.SyntaxNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null && child.type === 'string_content') return child.text
  }
  return undefined
}

// decorator node → HTTP method name if it's a route decorator, else undefined
function getHttpMethod(decorator: Parser.SyntaxNode): string | undefined {
  // decorator: @ call(attribute(obj.method), argument_list)
  for (let i = 0; i < decorator.childCount; i++) {
    const child = decorator.child(i)
    if (child === null || child.type !== 'call') continue
    const func = child.child(0)
    if (func === null || func.type !== 'attribute') continue
    const methodName = func.child(2) // obj.method → child[2] is method identifier
    if (methodName !== null && HTTP_METHODS.has(methodName.text)) return methodName.text
  }
  return undefined
}

// Get first string argument from argument_list
function getFirstStringArg(callNode: Parser.SyntaxNode): { value: string; row: number; col: number } | undefined {
  const argList = callNode.child(1)
  if (argList === null) return undefined
  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg !== null && arg.type === 'string') {
      const val = extractStringValue(arg)
      if (val !== undefined) return { value: val, row: arg.startPosition.row, col: arg.startPosition.column }
    }
  }
  return undefined
}

function getDynamicSegmentType(urlPath: string): DynamicSegmentType {
  if (urlPath.includes(':')) return 'dynamic'
  return 'static'
}

function extractRoutes(
  node: Parser.SyntaxNode,
  relPath: string,
  analyzerVersion: string,
): RouteNode[] {
  const routes: RouteNode[] = []

  if (node.type === 'decorated_definition') {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child === null || child.type !== 'decorator') continue
      const httpMethod = getHttpMethod(child)
      if (httpMethod === undefined) continue

      // Get path from decorator call's first argument
      for (let j = 0; j < child.childCount; j++) {
        const callNode = child.child(j)
        if (callNode === null || callNode.type !== 'call') continue
        const pathArg = getFirstStringArg(callNode)
        if (pathArg === undefined) continue

        const urlPath = normalizeUrlPath(pathArg.value)
        routes.push(
          createRouteNode({
            id: makeNodeId('route', relPath, `${urlPath}:${httpMethod}`),
            path: urlPath,
            filePath: relPath,
            routeFileKind: 'route-handler',
            dynamicSegmentType: getDynamicSegmentType(urlPath),
            isGroupRoute: false,
            renderingMode: 'SSR',
            provenance: astToProvenance(
              relPath,
              { row: pathArg.row, column: pathArg.col },
              'fastapi@0.1',
              analyzerVersion,
            ),
            confidence: 'verified',
          }),
        )
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null) routes.push(...extractRoutes(child, relPath, analyzerVersion))
  }

  return routes
}

export async function parseDecorators(
  repoRoot: string,
  analyzerVersion = 'codebase-viz@0.1.0',
): Promise<RouteNode[]> {
  const pyFiles = await findPyFiles(repoRoot)
  if (pyFiles.length === 0) return []

  const parser = await createPythonParser()
  const routes: RouteNode[] = []

  for (const absPath of pyFiles) {
    const source = await fs.readFile(absPath, 'utf-8').catch(() => null)
    if (source === null) continue
    const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/')
    const tree = parser.parse(source)
    routes.push(...extractRoutes(tree.rootNode, relPath, analyzerVersion))
  }

  return routes
}
