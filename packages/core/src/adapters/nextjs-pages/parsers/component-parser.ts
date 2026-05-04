import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Project } from 'ts-morph'
import {
  createComponentNode,
  createEdge,
  makeNodeId,
  makeEdgeId,
  type ComponentNode,
  type IREdge,
  type Provenance,
} from '@codebase-viz/types'

const PAGE_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js'])
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build'])

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(d: string): Promise<void> {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(path.join(d, entry.name))
      } else if (entry.isFile() && PAGE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(path.join(d, entry.name))
      }
    }
  }
  await recurse(dir)
  return results
}

export async function parseNextPagesComponents(
  repoRoot: string,
  analyzerVersion: string,
): Promise<{ nodes: ComponentNode[]; edges: IREdge[] }> {
  const pagesDir = await (async () => {
    for (const candidate of ['pages', 'src/pages']) {
      const p = path.join(repoRoot, candidate)
      try { await fs.access(p); return p } catch { /* skip */ }
    }
    return null
  })()

  if (pagesDir === null) return { nodes: [], edges: [] }

  const files = await walkDir(pagesDir)
  if (files.length === 0) return { nodes: [], edges: [] }

  const relFileSet = new Set(files.map(f => path.relative(repoRoot, f).replace(/\\/g, '/')))

  const nodes: ComponentNode[] = []
  const edges: IREdge[] = []

  const project = new Project({
    compilerOptions: { target: 99, allowJs: true, strict: false },
    skipAddingFilesFromTsConfig: true,
  })
  for (const f of files) project.addSourceFileAtPath(f)

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const relToPages = path.relative(pagesDir, filePath).replace(/\\/g, '/')

    // API routes are route-handlers, skip as components
    if (relToPages.startsWith('api/')) continue

    const name = path.basename(filePath, path.extname(filePath))
    // Skip underscore-prefixed non-route files (e.g. _app.tsx, _document.tsx)
    // but DO include them as components
    const provenance: Provenance = {
      file: relPath,
      line: 1,
      adapter: 'nextjs-pages-component-parser@0.1',
      analyzerVersion,
    }

    const nodeId = makeNodeId('component', relPath, name)
    nodes.push(
      createComponentNode({
        id: nodeId,
        name,
        filePath: relPath,
        runtime: 'server',
        provenance,
        confidence: 'inferred',
        inferenceChain: [`nextjs-pages: page file in pages/`],
      }),
    )

    for (const imp of sourceFile.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue()
      if (!spec.startsWith('.')) continue

      const resolved = path.resolve(path.dirname(filePath), spec)
      const ext = path.extname(spec)
      const candidates = ext !== ''
        ? [resolved]
        : [resolved + '.tsx', resolved + '.jsx', resolved + '.ts', resolved + '.js',
           path.join(resolved, 'index.tsx'), path.join(resolved, 'index.jsx')]

      for (const candidate of candidates) {
        const rel = path.relative(repoRoot, candidate).replace(/\\/g, '/')
        if (relFileSet.has(rel)) {
          const toName = path.basename(rel, path.extname(rel))
          const toId = makeNodeId('component', rel, toName)
          const edgeId = makeEdgeId('renders', nodeId, toId)
          if (!edges.some(e => e.id === edgeId)) {
            edges.push(createEdge({
              id: edgeId,
              from: nodeId,
              to: toId,
              kind: 'renders',
              provenance,
              confidence: 'inferred',
              inferenceChain: [`nextjs-pages: import '${spec}' in ${relPath}`],
            }))
          }
          break
        }
      }
    }
  }

  return { nodes, edges }
}
