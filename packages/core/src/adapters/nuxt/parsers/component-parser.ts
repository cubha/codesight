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
import { NUXT_EXCLUDE_DIRS } from '../../_shared/file-finder.js'
import { VUE_SCRIPT_RE, VUE_TEMPLATE_RE, COMPONENT_TAG_RE, findVueFiles } from '../../_shared/vue-sfc-utils.js'

export async function parseNuxtComponents(
  repoRoot: string,
  analyzerVersion: string,
): Promise<{ nodes: ComponentNode[]; edges: IREdge[] }> {
  const vueFiles = await findVueFiles(repoRoot, NUXT_EXCLUDE_DIRS)
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
      adapter: 'nuxt-component-parser@0.1',
      analyzerVersion,
    }

    const nodeId = makeNodeId('component', relPath, name)
    nodes.push(
      createComponentNode({
        id: nodeId,
        name,
        filePath: relPath,
        runtime: relPath.includes('pages/') ? 'server' : 'client',
        provenance,
        confidence: 'inferred',
        inferenceChain: [`nuxt: .vue file detected`],
      }),
    )

    const match = VUE_SCRIPT_RE.exec(source)
    if (match?.groups?.['content'] !== undefined) {
      const scriptContent = match.groups['content']
      const sf = project.createSourceFile(`${relPath}.ts`, scriptContent, { overwrite: true })

      for (const imp of sf.getImportDeclarations()) {
        const spec = imp.getModuleSpecifierValue()
        if (!spec.startsWith('.') && !spec.startsWith('~/') && !spec.startsWith('@/')) continue

        let resolvedRel: string | undefined

        if (spec.startsWith('~/') || spec.startsWith('@/')) {
          const withoutPrefix = spec.replace(/^[~@]\//, '')
          const withVue = withoutPrefix.endsWith('.vue') ? withoutPrefix : withoutPrefix + '.vue'
          if (vueRelSet.has(withVue)) {
            resolvedRel = withVue
          }
        } else if (spec.startsWith('.')) {
          const resolved = path.resolve(path.dirname(filePath), spec)
          const candidates = [resolved, resolved.replace(/\.vue$/, '')]
          for (const candidate of candidates) {
            const withVue = candidate.endsWith('.vue') ? candidate : candidate + '.vue'
            const rel = path.relative(repoRoot, withVue).replace(/\\/g, '/')
            if (vueRelSet.has(rel)) {
              resolvedRel = rel
              break
            }
          }
        }

        if (resolvedRel === undefined) continue

        const toId = makeNodeId('component', resolvedRel, path.basename(resolvedRel, '.vue'))
        const edgeId = makeEdgeId('imports', nodeId, toId)
        edges.push(
          createEdge({
            id: edgeId,
            from: nodeId,
            to: toId,
            kind: 'imports',
            importDepth: 1,
            provenance,
            confidence: 'inferred',
            inferenceChain: [`nuxt: import '${spec}' in ${relPath}`],
          }),
        )
      }
    }

    // Template component tags: detect <ComponentName> usage
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
              edges.push(
                createEdge({
                  id: edgeId,
                  from: nodeId,
                  to: toId,
                  kind: 'imports',
                  importDepth: 1,
                  provenance,
                  confidence: 'inferred',
                  inferenceChain: [`nuxt: <${tagName}> in template of ${relPath}`],
                }),
              )
            }
            break
          }
        }
      }
    }
  }

  return { nodes, edges }
}
