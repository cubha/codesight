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

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.vite', 'build'])
const VUE_SCRIPT_RE = /<script(?:\s[^>]*)?>(?<content>[\s\S]*?)<\/script>/
const VUE_TEMPLATE_RE = /<template(?:\s[^>]*)?>(?<content>[\s\S]*?)<\/template>/
const COMPONENT_TAG_RE = /<([A-Z][A-Za-z0-9]*)/g

async function findVueFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(path.join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.vue')) {
        results.push(path.join(dir, entry.name))
      }
    }
  }
  await recurse(repoRoot)
  return results
}

export async function parseVueSpaComponents(
  repoRoot: string,
  analyzerVersion: string,
): Promise<{ nodes: ComponentNode[]; edges: IREdge[] }> {
  const vueFiles = await findVueFiles(repoRoot)
  if (vueFiles.length === 0) return { nodes: [], edges: [] }

  const vueRelSet = new Set(vueFiles.map(f => path.relative(repoRoot, f).replace(/\\/g, '/')))

  const nodes: ComponentNode[] = []
  const edges: IREdge[] = []

  const project = new Project({
    compilerOptions: { target: 99, allowJs: true, strict: false },
    useInMemoryFileSystem: true,
  })

  for (const filePath of vueFiles) {
    const source = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (source === null) continue

    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const name = path.basename(filePath, '.vue')

    const provenance: Provenance = {
      file: relPath,
      line: 1,
      adapter: 'vue-spa-component-parser@0.1',
      analyzerVersion,
    }

    const nodeId = makeNodeId('component', relPath, name)
    nodes.push(
      createComponentNode({
        id: nodeId,
        name,
        filePath: relPath,
        runtime: 'client',
        provenance,
        confidence: 'inferred',
        inferenceChain: [`vue-spa: .vue SFC file detected`],
      }),
    )

    const scriptMatch = VUE_SCRIPT_RE.exec(source)
    if (scriptMatch?.groups?.['content'] !== undefined) {
      const scriptContent = scriptMatch.groups['content']
      const sf = project.createSourceFile(`${relPath}.ts`, scriptContent, { overwrite: true })

      for (const imp of sf.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue()
        if (!spec.startsWith('.')) continue

        const resolved = path.resolve(path.dirname(filePath), spec)
        const ext = path.extname(spec)
        const candidates = ext !== ''
          ? [resolved]
          : [resolved + '.vue', path.join(resolved, 'index.vue')]

        for (const candidate of candidates) {
          const rel = path.relative(repoRoot, candidate).replace(/\\/g, '/')
          if (vueRelSet.has(rel)) {
            const toId = makeNodeId('component', rel, path.basename(rel, '.vue'))
            const edgeId = makeEdgeId('imports', nodeId, toId)
            if (!edges.some(e => e.id === edgeId)) {
              edges.push(createEdge({
                id: edgeId,
                from: nodeId,
                to: toId,
                kind: 'imports',
                importDepth: 1,
                provenance,
                confidence: 'inferred',
                inferenceChain: [`vue-spa: import '${spec}' in ${relPath}`],
              }))
            }
            break
          }
        }
      }
    }

    const templateMatch = VUE_TEMPLATE_RE.exec(source)
    if (templateMatch?.groups?.['content'] !== undefined) {
      const templateContent = templateMatch.groups['content']
      let tagMatch: RegExpExecArray | null
      const tagRe = new RegExp(COMPONENT_TAG_RE.source, 'g')
      while ((tagMatch = tagRe.exec(templateContent)) !== null) {
        const tagName = tagMatch[1]!
        for (const rel of vueRelSet) {
          if (path.basename(rel, '.vue') === tagName) {
            const toId = makeNodeId('component', rel, tagName)
            const edgeId = makeEdgeId('imports', nodeId, toId)
            if (!edges.some(e => e.id === edgeId)) {
              edges.push(createEdge({
                id: edgeId,
                from: nodeId,
                to: toId,
                kind: 'imports',
                importDepth: 1,
                provenance,
                confidence: 'inferred',
                inferenceChain: [`vue-spa: <${tagName}> in template of ${relPath}`],
              }))
            }
            break
          }
        }
      }
    }
  }

  return { nodes, edges }
}
