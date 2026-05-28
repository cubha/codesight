import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Project, SyntaxKind } from 'ts-morph'
import {
  createRouteNode,
  makeNodeId,
  type RouteNode,
  type DynamicSegmentType,
  type Provenance,
} from '@codebase-viz/types'
import { buildImportMap } from '../../_shared/ts-morph-utils.js'

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.nuxt'])

async function findTsFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(path.join(dir, entry.name))
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
        && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) {
        results.push(path.join(dir, entry.name))
      }
    }
  }
  await recurse(repoRoot)
  return results
}

// v1.2.44 A1-1: path + componentSpec 추출.
// componentSpec: () => import('./Foo.vue') 패턴의 spec 문자열, 또는 Identifier(sync import).
// filePath 치환은 호출자(parseVueRoutes)에서 routerDir 기준으로 resolve.
interface VueRouteEntry {
  urlPath: string
  componentSpec?: string  // dynamic import spec ('./Foo.vue') 또는 sync import 식별자명
  componentIsIdentifier?: boolean  // true면 componentSpec은 식별자명, false/undefined면 dynamic import path
}

function extractRoutesFromArray(
  arrayNode: import('ts-morph').Node,
  parentPath = '',
): VueRouteEntry[] {
  const entries: VueRouteEntry[] = []
  if (!arrayNode.isKind(SyntaxKind.ArrayLiteralExpression)) return entries

  for (const el of arrayNode.asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements()) {
    if (!el.isKind(SyntaxKind.ObjectLiteralExpression)) continue
    const obj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)

    const pathProp = obj.getProperty('path')
    let rawSegment = ''
    if (pathProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const init = pathProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
      if (init?.isKind(SyntaxKind.StringLiteral)) {
        rawSegment = init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
      }
    }

    const combined = rawSegment.startsWith('/')
      ? rawSegment
      : parentPath
        ? (parentPath + '/' + rawSegment).replace('//', '/')
        : rawSegment
    const normalized = combined || '/'

    const entry: VueRouteEntry = { urlPath: normalized }

    // component: () => import('./Foo.vue') 또는 component: FooComponent
    const componentProp = obj.getProperty('component')
    if (componentProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const init = componentProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
      if (init !== undefined) {
        const m = init.getText().match(/import\(['"`]([^'"`]+)['"`]\)/)
        if (m !== null) {
          entry.componentSpec = m[1]!
        } else if (init.isKind(SyntaxKind.Identifier)) {
          entry.componentSpec = init.getText()
          entry.componentIsIdentifier = true
        }
      }
    }

    entries.push(entry)

    const childrenProp = obj.getProperty('children')
    if (childrenProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const childInit = childrenProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
      if (childInit !== undefined) entries.push(...extractRoutesFromArray(childInit, normalized))
    }
  }

  return entries
}

function normalizePath(rawPath: string): { urlPath: string; dynamicSegmentType: DynamicSegmentType } {
  // Vue Router uses :param syntax natively
  const urlPath = rawPath.startsWith('/') ? rawPath : '/' + rawPath
  const dynamicSegmentType: DynamicSegmentType = urlPath.includes(':') ? 'dynamic' : 'static'
  return { urlPath, dynamicSegmentType }
}

export async function parseVueRoutes(
  repoRoot: string,
  analyzerVersion: string,
): Promise<RouteNode[]> {
  const allFiles = await findTsFiles(repoRoot)

  const routerFiles: string[] = []
  for (const f of allFiles) {
    const content = await fs.readFile(f, 'utf-8').catch(() => '')
    if (content.includes('createRouter')) routerFiles.push(f)
  }
  if (routerFiles.length === 0) return []

  const project = new Project({
    compilerOptions: { target: 99, allowJs: true, strict: false },
    skipAddingFilesFromTsConfig: true,
  })
  for (const f of routerFiles) project.addSourceFileAtPath(f)

  const routes: RouteNode[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')

    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = callExpr.getExpression()
      if (expr.getText() !== 'createRouter') continue

      const args = callExpr.getArguments()
      if (args.length === 0) continue

      const firstArg = args[0]!
      if (!firstArg.isKind(SyntaxKind.ObjectLiteralExpression)) continue

      const routesProp = firstArg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression).getProperty('routes')
      if (!routesProp?.isKind(SyntaxKind.PropertyAssignment)) continue

      const routesInit = routesProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
      if (routesInit === undefined) continue

      let routesArray: import('ts-morph').Node | undefined
      if (routesInit.isKind(SyntaxKind.ArrayLiteralExpression)) {
        routesArray = routesInit
      } else if (routesInit.isKind(SyntaxKind.Identifier)) {
        const varName = routesInit.getText()
        const varDecl = sourceFile.getVariableDeclarations().find(v => v.getName() === varName)
        routesArray = varDecl?.getInitializer()

        if (routesArray === undefined) {
          for (const impDecl of sourceFile.getImportDeclarations()) {
            const hasNamedImport = impDecl.getNamedImports().some(ni => ni.getName() === varName)
            if (!hasNamedImport) continue
            const moduleSpec = impDecl.getModuleSpecifierValue()
            if (!moduleSpec.startsWith('.')) continue

            const absBase = path.resolve(path.dirname(filePath), moduleSpec)
            for (const tryExt of ['.ts', '/index.ts', '.js', '/index.js']) {
              const candidate = absBase + tryExt
              let importedSf = project.getSourceFile(candidate)
              if (importedSf === undefined) {
                try { importedSf = project.addSourceFileAtPath(candidate) } catch { continue }
              }
              if (importedSf === undefined) continue
              const vd = importedSf.getVariableDeclarations().find(v => v.getName() === varName)
              if (vd !== undefined) {
                routesArray = vd.getInitializer()
                break
              }
            }
            if (routesArray !== undefined) break
          }
        }
      }

      if (routesArray === undefined) continue

      // v1.2.44 A1-1: routesArray가 외부 파일 import인 경우 routerDir은 그 외부 파일 디렉토리
      // (componentSpec은 외부 파일 기준 상대 경로). 그렇지 않으면 현재 sourceFile 디렉토리.
      const routerDir = path.dirname(routesArray.getSourceFile().getFilePath())

      const extractedEntries = extractRoutesFromArray(routesArray)

      // sourceFile importMap (sync component Identifier resolve용)
      const importMap = buildImportMap(routesArray.getSourceFile())

      for (const entry of extractedEntries) {
        const { urlPath, dynamicSegmentType } = normalizePath(entry.urlPath)
        const provenance: Provenance = {
          file: relPath,
          line: callExpr.getStartLineNumber(),
          adapter: 'vue-spa@0.1',
          analyzerVersion,
        }

        // v1.2.44 A1-1: componentSpec resolve → 컴포넌트 abs path → relPath 치환
        // dynamic import: spec은 이미 상대 경로
        // sync Identifier: importMap에서 lookup하여 모듈 spec 획득
        let routeFilePath = relPath  // fallback: 라우터 정의 파일 (기존 동작)
        let routeConfidence: 'verified' | 'inferred' = 'verified'
        let routeInferenceChain: string[] | undefined
        if (entry.componentSpec !== undefined) {
          let moduleSpec: string | undefined
          if (entry.componentIsIdentifier === true) {
            moduleSpec = importMap.get(entry.componentSpec)
          } else {
            moduleSpec = entry.componentSpec
          }
          if (moduleSpec !== undefined && moduleSpec.startsWith('.')) {
            const absBase = path.resolve(routerDir, moduleSpec)
            let compAbsPath: string | undefined
            // .vue 우선, .ts/.tsx/.js/.jsx fallback
            const exts = absBase.endsWith('.vue') || absBase.endsWith('.ts') || absBase.endsWith('.tsx') || absBase.endsWith('.js') || absBase.endsWith('.jsx')
              ? ['']  // spec에 이미 확장자 포함
              : ['.vue', '.ts', '.tsx', '.js', '.jsx']
            for (const ext of exts) {
              try {
                await fs.access(absBase + ext)
                compAbsPath = absBase + ext
                break
              } catch { /* try next */ }
            }
            if (compAbsPath !== undefined) {
              routeFilePath = path.relative(repoRoot, compAbsPath).replace(/\\/g, '/')
              routeInferenceChain = [`라우트 정의의 component spec '${entry.componentSpec}' → 컴포넌트 파일로 매핑`]
              routeConfidence = 'inferred'
            }
          }
        }

        const confField = routeConfidence === 'inferred' && routeInferenceChain !== undefined
          ? { confidence: 'inferred' as const, inferenceChain: routeInferenceChain }
          : { confidence: 'verified' as const }

        routes.push(
          createRouteNode({
            id: makeNodeId('route', routeFilePath, urlPath),
            path: urlPath,
            filePath: routeFilePath,
            routeFileKind: 'page',
            dynamicSegmentType,
            isGroupRoute: false,
            renderingMode: 'CSR',
            provenance,
            ...confField,
          }),
        )
      }
    }
  }

  return routes
}
