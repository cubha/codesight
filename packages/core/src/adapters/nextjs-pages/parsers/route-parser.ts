import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  createRouteNode,
  makeNodeId,
  type RouteNode,
  type DynamicSegmentType,
  type RenderingMode,
  type Provenance,
} from '@codebase-viz/types'
import { walkDir, NEXTJS_EXCLUDE_DIRS } from '../../_shared/file-finder.js'

const PAGE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js'])

function fileToRoute(relToPages: string): {
  urlPath: string
  dynamicSegmentType: DynamicSegmentType
  routeFileKind: 'page' | 'route-handler'
} | null {
  const ext = path.extname(relToPages)
  if (!PAGE_EXTENSIONS.has(ext)) return null

  let p = relToPages.slice(0, -ext.length)

  // API routes → route-handler
  const isApiRoute = p.startsWith('api/') || p.startsWith('api\\')
  if (isApiRoute) {
    // [param] → :param, [...param] → :param*, [[...param]] → :param?
    p = p
      .replace(/\[\[\.\.\.(\w+)\]\]/g, ':$1?')
      .replace(/\[\.\.\.(\w+)\]/g, ':$1*')
      .replace(/\[(\w+)\]/g, ':$1')
    const urlPath = '/' + p.replace(/\\/g, '/')
    const clean = urlPath.replace(/\/+$/, '') || '/'
    const dynamicSegmentType: DynamicSegmentType = clean.includes(':') ? 'dynamic' : 'static'
    return { urlPath: clean, dynamicSegmentType, routeFileKind: 'route-handler' as const }
  }

  // index → /
  p = p.replace(/\/index$/, '').replace(/\\index$/, '').replace(/^index$/, '')

  // [param] → :param, [...param] → :param*, [[...param]] → :param?
  p = p
    .replace(/\[\[\.\.\.(\w+)\]\]/g, ':$1?')
    .replace(/\[\.\.\.(\w+)\]/g, ':$1*')
    .replace(/\[(\w+)\]/g, ':$1')

  const urlPath = '/' + p.replace(/\\/g, '/')
  const clean = urlPath === '//' ? '/' : urlPath.replace(/\/+$/, '') || '/'

  const dynamicSegmentType: DynamicSegmentType =
    clean.includes(':') ? 'dynamic' : 'static'

  return { urlPath: clean, dynamicSegmentType, routeFileKind: 'page' as const }
}

function detectRenderingMode(source: string): RenderingMode {
  const hasGetStaticProps = /export\s+(async\s+)?function\s+getStaticProps\b/.test(source)
  const hasGetServerSideProps = /export\s+(async\s+)?function\s+getServerSideProps\b/.test(source)
  const hasRevalidate = /\brevalidate\s*:/.test(source)

  if (hasGetServerSideProps) return 'SSR'
  if (hasGetStaticProps) return hasRevalidate ? 'ISR' : 'SSG'
  return 'SSR'
}

async function walkPages(pagesDir: string): Promise<string[]> {
  return walkDir(pagesDir, { excludeDirs: NEXTJS_EXCLUDE_DIRS })
}

export async function parseNextPagesRoutes(
  repoRoot: string,
  analyzerVersion: string,
): Promise<RouteNode[]> {
  const pagesDir = await (async () => {
    for (const candidate of ['pages', 'src/pages']) {
      const p = path.join(repoRoot, candidate)
      try {
        await fs.access(p)
        return p
      } catch { /* skip */ }
    }
    return null
  })()

  if (pagesDir === null) return []

  const files = await walkPages(pagesDir)
  const routes: RouteNode[] = []

  for (const filePath of files) {
    const relToPages = path.relative(pagesDir, filePath)
    const routeInfo = fileToRoute(relToPages)
    if (routeInfo === null) continue

    const source = await fs.readFile(filePath, 'utf-8').catch(() => '')
    const renderingMode = detectRenderingMode(source)

    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const provenance: Provenance = {
      file: relPath,
      line: 1,
      adapter: 'nextjs-pages@0.1',
      analyzerVersion,
    }

    routes.push(
      createRouteNode({
        id: makeNodeId('route', relPath, routeInfo.routeFileKind),
        path: routeInfo.urlPath,
        filePath: relPath,
        routeFileKind: routeInfo.routeFileKind,
        dynamicSegmentType: routeInfo.dynamicSegmentType,
        isGroupRoute: false,
        renderingMode,
        provenance,
        confidence: 'verified',
      }),
    )
  }

  return routes
}
