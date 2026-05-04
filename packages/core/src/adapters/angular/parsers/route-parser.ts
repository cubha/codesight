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

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.angular'])

async function findTsFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(path.join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
        && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        results.push(path.join(dir, entry.name))
      }
    }
  }
  await recurse(repoRoot)
  return results
}

function resolveLoadChildrenPaths(
  prop: import('ts-morph').PropertyAssignment,
  parentPath: string,
  project: import('ts-morph').Project,
  currentFileDir: string,
): string[] {
  const init = prop.getInitializer()
  if (init === undefined) return []

  // Pattern: loadChildren: () => import('./path').then(m => m.exportName)
  for (const call of init.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression()
    if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) continue
    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
    if (propAccess.getName() !== 'then') continue

    const importText = propAccess.getExpression().getText()
    const importMatch = importText.match(/^import\(['"`]([^'"`]+)['"`]\)$/)
    if (importMatch === null) continue

    const importPathRel = importMatch[1]!

    const thenArgs = call.getArguments()
    if (thenArgs.length === 0) continue
    const thenArg = thenArgs[0]!
    if (!thenArg.isKind(SyntaxKind.ArrowFunction)) continue
    const body = thenArg.asKindOrThrow(SyntaxKind.ArrowFunction).getBody()
    if (!body.isKind(SyntaxKind.PropertyAccessExpression)) continue
    const exportName = body.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName()

    for (const candidate of [
      path.resolve(currentFileDir, importPathRel + '.ts'),
      path.resolve(currentFileDir, importPathRel),
      path.resolve(currentFileDir, importPathRel, 'index.ts'),
    ]) {
      let sf = project.getSourceFile(candidate)
      if (sf === undefined) {
        try { sf = project.addSourceFileAtPath(candidate) } catch { continue }
      }
      const varDecl = sf.getVariableDeclarations().find(v => v.getName() === exportName)
      const routesArray = varDecl?.getInitializer()
      if (routesArray === undefined) continue
      return extractPathsFromRoutesArray(routesArray, parentPath, project, path.dirname(candidate))
    }
  }

  return []
}

function extractPathsFromRoutesArray(
  arrayNode: import('ts-morph').Node,
  parentPath = '',
  project?: import('ts-morph').Project,
  currentFileDir?: string,
): string[] {
  const paths: string[] = []
  if (!arrayNode.isKind(SyntaxKind.ArrayLiteralExpression)) return paths

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

    if (rawSegment === '**') continue

    // Accumulate full path: combine parent prefix with current segment
    const fullPath = rawSegment.startsWith('/')
      ? rawSegment
      : parentPath
        ? (parentPath + '/' + rawSegment).replace('//', '/')
        : rawSegment

    paths.push(fullPath)

    // Recurse into children: [] passing accumulated path as prefix
    const childrenProp = obj.getProperty('children')
    if (childrenProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const childInit = childrenProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
      if (childInit !== undefined) {
        paths.push(...extractPathsFromRoutesArray(childInit, fullPath, project, currentFileDir))
      }
    }

    // Attempt to resolve loadChildren: () => import('./path').then(m => m.routes)
    const loadChildrenProp = obj.getProperty('loadChildren')
    if (loadChildrenProp?.isKind(SyntaxKind.PropertyAssignment) && project !== undefined && currentFileDir !== undefined) {
      paths.push(...resolveLoadChildrenPaths(
        loadChildrenProp.asKindOrThrow(SyntaxKind.PropertyAssignment),
        fullPath, project, currentFileDir,
      ))
    }
  }

  return paths
}

export async function parseAngularRoutes(
  repoRoot: string,
  analyzerVersion: string,
): Promise<RouteNode[]> {
  const allFiles = await findTsFiles(repoRoot)

  const routerFiles: string[] = []
  for (const f of allFiles) {
    const content = await fs.readFile(f, 'utf-8').catch(() => '')
    if (content.includes('provideRouter') || content.includes('RouterModule.forRoot')
      || content.includes('RouterModule.forChild')
      || (content.includes('Routes') && content.includes('path:'))) {
      routerFiles.push(f)
    }
  }
  if (routerFiles.length === 0) return []

  const project = new Project({
    compilerOptions: {
      target: 99,
      experimentalDecorators: true,
      allowJs: false,
      strict: false,
    },
    skipAddingFilesFromTsConfig: true,
  })
  for (const f of routerFiles) project.addSourceFileAtPath(f)

  const routes: RouteNode[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const fileDir = path.dirname(filePath)

    for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const exprText = callExpr.getExpression().getText()
      if (exprText !== 'provideRouter' && exprText !== 'RouterModule.forRoot' && exprText !== 'RouterModule.forChild') continue

      const args = callExpr.getArguments()
      if (args.length === 0) continue

      const firstArg = args[0]!
      let routesArray: import('ts-morph').Node | undefined

      if (firstArg.isKind(SyntaxKind.ArrayLiteralExpression)) {
        routesArray = firstArg
      } else if (firstArg.isKind(SyntaxKind.Identifier)) {
        const varName = firstArg.getText()
        const varDecl = sourceFile.getVariableDeclarations().find(v => v.getName() === varName)
        routesArray = varDecl?.getInitializer()
        if (routesArray === undefined) {
          for (const sf of project.getSourceFiles()) {
            const vd = sf.getVariableDeclarations().find(v => v.getName() === varName)
            if (vd !== undefined) {
              routesArray = vd.getInitializer()
              break
            }
          }
        }
      }

      if (routesArray === undefined) continue

      const extractedPaths = extractPathsFromRoutesArray(routesArray, '', project, fileDir)

      for (const rawPath of extractedPaths) {
        const urlPath = rawPath === '' ? '/' : rawPath.startsWith('/') ? rawPath : ('/' + rawPath)
        const dynamicSegmentType: DynamicSegmentType = urlPath.includes(':') ? 'dynamic' : 'static'

        const provenance: Provenance = {
          file: relPath,
          line: callExpr.getStartLineNumber(),
          adapter: 'angular@0.1',
          analyzerVersion,
        }

        routes.push(
          createRouteNode({
            id: makeNodeId('route', relPath, urlPath),
            path: urlPath,
            filePath: relPath,
            routeFileKind: 'page',
            dynamicSegmentType,
            isGroupRoute: false,
            renderingMode: 'CSR',
            provenance,
            confidence: 'verified',
          }),
        )
      }
    }
  }

  return routes
}
