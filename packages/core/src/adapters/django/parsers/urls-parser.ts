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
      } else if (
        entry.isFile() &&
        (entry.name === 'urls.py' ||
          (entry.name === '__init__.py' && path.basename(dir) === 'urls'))
      ) {
        results.push(fullPath)
      }
    }
  }
  await recurse(repoRoot)
  return results
}

async function findViewFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(fullPath)
      } else if (entry.isFile() && (entry.name === 'views.py' || entry.name.includes('views'))) {
        results.push(fullPath)
      }
    }
  }
  await recurse(repoRoot)
  return results
}

// views.py에서 @api_view([...]) 데코레이터가 있는 함수 → HTTP methods 맵 생성
async function buildApiViewMethodMap(
  repoRoot: string,
  parser: Parser,
): Promise<Map<string, string>> {
  const methodMap = new Map<string, string>()
  const viewFiles = await findViewFiles(repoRoot)

  for (const filePath of viewFiles) {
    const source = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (source === null || !source.includes('@api_view')) continue

    const tree = parser.parse(source)

    for (let i = 0; i < tree.rootNode.childCount; i++) {
      const node = tree.rootNode.child(i)
      if (node === null || node.type !== 'decorated_definition') continue

      let apiViewMethods: string | undefined
      let funcName: string | undefined

      for (let j = 0; j < node.childCount; j++) {
        const child = node.child(j)
        if (child === null) continue

        if (child.type === 'decorator') {
          const m = child.text.match(/@api_view\(\[([^\]]+)\]\)/)
          if (m !== null) {
            apiViewMethods = m[1]!
              .replace(/['"]/g, '')
              .split(',')
              .map((s: string) => s.trim().toUpperCase())
              .filter(Boolean)
              .join(',')
          }
        } else if (child.type === 'function_definition') {
          const nameNode = child.childForFieldName('name')
          funcName = nameNode?.text
        }
      }

      if (funcName !== undefined && apiViewMethods !== undefined) {
        methodMap.set(funcName, apiViewMethods)
      }
    }
  }

  return methodMap
}

// views.py에서 CBV(Class Based View) def get/post/... → HTTP methods 맵 생성
async function buildCbvMethodMap(
  repoRoot: string,
  parser: Parser,
): Promise<Map<string, string>> {
  const methodMap = new Map<string, string>()
  const viewFiles = await findViewFiles(repoRoot)

  const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

  for (const filePath of viewFiles) {
    const source = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (source === null) continue

    const tree = parser.parse(source)

    for (let i = 0; i < tree.rootNode.childCount; i++) {
      const node = tree.rootNode.child(i)
      if (node === null || node.type !== 'class_definition') continue

      const nameNode = node.childForFieldName('name')
      if (nameNode === null) continue
      const className = nameNode.text

      const body = node.childForFieldName('body')
      if (body === null) continue

      const methods: string[] = []
      for (let j = 0; j < body.childCount; j++) {
        const stmt = body.child(j)
        if (stmt === null || stmt.type !== 'function_definition') continue
        const funcName = stmt.childForFieldName('name')?.text
        if (funcName !== undefined && HTTP_METHODS.has(funcName)) {
          methods.push(funcName.toUpperCase())
        }
      }

      if (methods.length > 0) {
        methodMap.set(className, methods.join(','))
      }
    }
  }

  return methodMap
}

function normalizeDjangoPattern(pattern: string): { urlPath: string; dynamicSegmentType: DynamicSegmentType } {
  const normalized = pattern
    .replace(/<\w+:(\w+)>/g, ':$1')
    .replace(/<(\w+)>/g, ':$1')
    .replace(/\/+$/, '')
  const urlPath = normalized.startsWith('/') ? normalized : '/' + normalized
  const dynamicSegmentType: DynamicSegmentType = urlPath.includes(':') ? 'dynamic' : 'static'
  return { urlPath, dynamicSegmentType }
}

function extractStringValue(node: Parser.SyntaxNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null && child.type === 'string_content') return child.text
  }
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
  if (node.type !== 'call') return false
  const func = node.child(0)
  return func !== null && func.text === 'include'
}

function extractIncludeModuleName(includeCallNode: Parser.SyntaxNode): string | undefined {
  const argList = includeCallNode.child(1)
  if (argList === null) return undefined
  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg !== null && arg.type === 'string') return extractStringValue(arg)
  }
  return undefined
}

function moduleNameToRelPaths(moduleName: string): string[] {
  const base = moduleName.replace(/\./g, '/')
  return [base + '.py', base + '/__init__.py']
}

function composePrefixedPath(prefixRaw: string, routePath: string): string {
  const prefix = '/' + prefixRaw.replace(/^\//, '').replace(/\/$/, '')
  if (routePath === '/' || routePath === '') return prefix
  return prefix + routePath
}

interface IncludeEntry {
  prefix: string
  moduleName: string
  row: number
}

interface FileData {
  directRoutes: RouteNode[]
  includes: IncludeEntry[]
}

function extractViewName(node: Parser.SyntaxNode): string | undefined {
  // path('url/', views.func_name) or path('url/', func_name)
  if (node.type === 'identifier') return node.text
  if (node.type === 'attribute') {
    const last = node.child(node.childCount - 1)
    return last?.text
  }
  return undefined
}

function extractCbvClassName(node: Parser.SyntaxNode): string | undefined {
  // views.UserView.as_view() 또는 UserView.as_view() 패턴
  if (node.type !== 'call') return undefined
  const func = node.child(0)
  if (func === null) return undefined
  const m = func.text.match(/(?:^|\.)([\w]+)\.as_view$/)
  return m?.[1]
}

function extractAll(
  rootNode: Parser.SyntaxNode,
  relPath: string,
  analyzerVersion: string,
  apiViewMethodMap: Map<string, string>,
  cbvMethodMap: Map<string, string>,
): FileData {
  const directRoutes: RouteNode[] = []
  const includes: IncludeEntry[] = []
  const drfRouterVars = new Set<string>()
  const drfRegisterCalls: Array<{ prefix: string; row: number }> = []

  function walk(node: Parser.SyntaxNode): void {
    if (node.type === 'assignment') {
      const left = node.childForFieldName?.('left') ?? node.child(0)
      const right = node.childForFieldName?.('right') ?? node.child(2)
      if (left?.type === 'identifier' && right?.type === 'call') {
        const funcNode = right.child(0)
        const funcName =
          funcNode?.type === 'attribute' ? funcNode.lastChild?.text : funcNode?.text
        if (funcName === 'DefaultRouter' || funcName === 'SimpleRouter') {
          drfRouterVars.add(left.text)
        }
      }
    }

    if (node.type === 'call') {
      const func = node.child(0)
      if (func !== null && (func.text === 'path' || func.text === 're_path')) {
        const args = node.child(1)
        if (args !== null && args.type === 'argument_list') {
          const firstArg = args.namedChild(0)
          const secondArg = args.namedChild(1)
          if (
            firstArg !== null &&
            (firstArg.type === 'string' || firstArg.type === 'concatenated_string')
          ) {
            if (secondArg !== null && isIncludeCall(secondArg)) {
              const moduleName = extractIncludeModuleName(secondArg)
              const prefix = extractStringValue(firstArg)
              if (moduleName !== undefined && prefix !== undefined) {
                includes.push({ prefix, moduleName, row: node.startPosition.row })
              }
              return
            } else if (secondArg !== null) {
              const rawPattern = extractStringValue(firstArg)
              if (rawPattern !== undefined && rawPattern !== '') {
                const { urlPath, dynamicSegmentType } = normalizeDjangoPattern(rawPattern)
                if (urlPath !== '/') {
                  const viewName = extractViewName(secondArg)
                  const fbvMethod = viewName !== undefined ? apiViewMethodMap.get(viewName) : undefined
                  const cbvClassName = extractCbvClassName(secondArg)
                  const cbvMethod = cbvClassName !== undefined ? cbvMethodMap.get(cbvClassName) : undefined
                  const httpMethod = fbvMethod ?? cbvMethod
                  directRoutes.push(
                    createRouteNode({
                      id: makeNodeId('route', relPath, urlPath),
                      path: urlPath,
                      filePath: relPath,
                      routeFileKind: 'page',
                      dynamicSegmentType,
                      isGroupRoute: false,
                      renderingMode: 'SSR',
                      ...(httpMethod !== undefined ? { httpMethod } : {}),
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
        return
      }

      if (func?.type === 'attribute') {
        const obj = func.child(0)
        const method = func.child(2)
        if (obj !== null && drfRouterVars.has(obj.text) && method?.text === 'register') {
          const argList = node.child(1)
          if (argList !== null) {
            const firstArg = argList.namedChild(0)
            if (firstArg?.type === 'string') {
              const prefix = extractStringValue(firstArg)
              if (prefix !== undefined) {
                drfRegisterCalls.push({ prefix, row: node.startPosition.row })
              }
            }
          }
          return
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child !== null) walk(child)
    }
  }

  walk(rootNode)

  for (const reg of drfRegisterCalls) {
    const { prefix, row } = reg
    const listPath = '/' + prefix.replace(/^\//, '').replace(/\/$/, '')
    const detailPath = listPath + '/:pk'

    directRoutes.push(
      createRouteNode({
        id: makeNodeId('route', relPath, listPath + ':drf'),
        path: listPath,
        filePath: relPath,
        routeFileKind: 'page',
        dynamicSegmentType: 'static',
        isGroupRoute: false,
        renderingMode: 'SSR',
        provenance: astToProvenance(
          relPath,
          { row, column: 0 },
          'django-drf@0.1',
          analyzerVersion,
        ),
        confidence: 'inferred',
        inferenceChain: [`DRF router.register('${prefix}', ...) → list route`],
      }),
    )

    directRoutes.push(
      createRouteNode({
        id: makeNodeId('route', relPath, detailPath + ':drf'),
        path: detailPath,
        filePath: relPath,
        routeFileKind: 'page',
        dynamicSegmentType: 'dynamic',
        isGroupRoute: false,
        renderingMode: 'SSR',
        provenance: astToProvenance(
          relPath,
          { row, column: 0 },
          'django-drf@0.1',
          analyzerVersion,
        ),
        confidence: 'inferred',
        inferenceChain: [`DRF router.register('${prefix}', ...) → detail route`],
      }),
    )
  }

  return { directRoutes, includes }
}

export async function parseUrls(
  repoRoot: string,
  analyzerVersion = 'codebase-viz@0.1.0',
): Promise<RouteNode[]> {
  const urlFiles = await findUrlFiles(repoRoot)
  if (urlFiles.length === 0) return []

  const parser = await createPythonParser()

  // Pre-pass: views.py에서 @api_view HTTP method 맵 빌드
  const apiViewMethodMap = await buildApiViewMethodMap(repoRoot, parser)
  // Pre-pass: views.py에서 CBV HTTP method 맵 빌드
  const cbvMethodMap = await buildCbvMethodMap(repoRoot, parser)

  // Pass 1: 모든 urls.py → fileMap
  const fileMap = new Map<string, FileData>()
  for (const absPath of urlFiles) {
    const source = await fs.readFile(absPath, 'utf-8').catch(() => null)
    if (source === null) continue
    const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/')
    const tree = parser.parse(source)
    fileMap.set(relPath, extractAll(tree.rootNode, relPath, analyzerVersion, apiViewMethodMap, cbvMethodMap))
  }

  // Pass 2: 포함(include)된 파일 목록 계산 → 루트 파일에서 시작해 재귀 수집
  const includedFiles = new Set<string>()
  for (const data of fileMap.values()) {
    for (const inc of data.includes) {
      for (const candidate of moduleNameToRelPaths(inc.moduleName)) {
        if (fileMap.has(candidate)) {
          includedFiles.add(candidate)
          break
        }
      }
    }
  }

  const result: RouteNode[] = []
  const visited = new Set<string>()

  function collect(relPath: string, prefixStack: string[]): void {
    if (visited.has(relPath)) return
    visited.add(relPath)

    const data = fileMap.get(relPath)
    if (data === undefined) return

    for (const route of data.directRoutes) {
      if (prefixStack.length === 0) {
        result.push(route)
      } else {
        const composedPath = composePrefixedPath(prefixStack.join(''), route.path)
        const dynamicSegmentType: DynamicSegmentType = composedPath.includes(':') ? 'dynamic' : 'static'
        result.push(
          createRouteNode({
            id: makeNodeId('route', route.filePath, `${composedPath}:include`),
            path: composedPath,
            filePath: route.filePath,
            routeFileKind: route.routeFileKind,
            dynamicSegmentType,
            isGroupRoute: route.isGroupRoute,
            renderingMode: route.renderingMode,
            provenance: route.provenance,
            confidence: 'inferred',
            inferenceChain: [
              `cross-file include() prefix='${prefixStack.join('')}' → ${relPath}`,
            ],
          }),
        )
      }
    }

    for (const inc of data.includes) {
      const candidates = moduleNameToRelPaths(inc.moduleName)
      const targetRelPath = candidates.find(c => fileMap.has(c)) ?? candidates[0]!
      collect(targetRelPath, [...prefixStack, inc.prefix])
    }
  }

  for (const relPath of fileMap.keys()) {
    if (!includedFiles.has(relPath)) {
      collect(relPath, [])
    }
  }

  return result
}
