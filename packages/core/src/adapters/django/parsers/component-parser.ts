import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  createComponentNode,
  makeNodeId,
  type ComponentNode,
  type Provenance,
} from '@codebase-viz/types'
import { createPythonParser } from '../../_shared/tree-sitter-loader.js'

const EXCLUDE_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'venv', '.venv', 'env', 'migrations'])

async function findPyFiles(repoRoot: string): Promise<string[]> {
  const results: string[] = []
  async function recurse(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) await recurse(path.join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        results.push(path.join(dir, entry.name))
      }
    }
  }
  await recurse(repoRoot)
  return results
}

const DJANGO_BASE_CLASSES = new Set([
  'View', 'TemplateView', 'ListView', 'DetailView', 'CreateView', 'UpdateView', 'DeleteView',
  'APIView', 'ViewSet', 'ModelViewSet', 'ReadOnlyModelViewSet', 'GenericViewSet',
])

export async function parseDjangoComponents(
  repoRoot: string,
  analyzerVersion: string,
): Promise<ComponentNode[]> {
  const pyFiles = await findPyFiles(repoRoot)
  const viewFiles = pyFiles.filter(f => path.basename(f) === 'views.py' || f.includes('views'))

  if (viewFiles.length === 0) return []

  const parser = await createPythonParser()
  const nodes: ComponentNode[] = []

  for (const filePath of viewFiles) {
    const source = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (source === null) continue

    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const tree = parser.parse(source)

    for (let i = 0; i < tree.rootNode.childCount; i++) {
      const node = tree.rootNode.child(i)
      if (node === null) continue

      // CBV: class_definition with View/ViewSet base class
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name')
        if (nameNode === null) continue
        const className = nameNode.text

        const baseClause = node.childForFieldName('superclasses')
        let hasViewBase = false
        if (baseClause !== null) {
          for (let j = 0; j < baseClause.childCount; j++) {
            const base = baseClause.child(j)
            if (base !== null && (DJANGO_BASE_CLASSES.has(base.text) || base.text.endsWith('View') || base.text.endsWith('ViewSet'))) {
              hasViewBase = true
              break
            }
          }
        }

        if (!hasViewBase) continue

        nodes.push(
          createComponentNode({
            id: makeNodeId('component', relPath, className),
            name: className,
            filePath: relPath,
            runtime: 'server',
            provenance: {
              file: relPath,
              line: node.startPosition.row + 1,
              adapter: 'django-component-parser@0.1',
              analyzerVersion,
            },
            confidence: 'inferred',
            inferenceChain: [`django: View subclass ${className} in ${relPath}`],
          }),
        )
        continue
      }

      // FBV: function_definition with first parameter named 'request'
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name')
        if (nameNode === null) continue
        const funcName = nameNode.text

        const paramsNode = node.childForFieldName('parameters')
        let firstParam = ''
        if (paramsNode !== null) {
          for (let k = 0; k < paramsNode.childCount; k++) {
            const p = paramsNode.child(k)
            if (p !== null && p.type === 'identifier') {
              firstParam = p.text
              break
            }
          }
        }

        if (firstParam !== 'request' && firstParam !== 'req') continue

        nodes.push(
          createComponentNode({
            id: makeNodeId('component', relPath, funcName),
            name: funcName,
            filePath: relPath,
            runtime: 'server',
            provenance: {
              file: relPath,
              line: node.startPosition.row + 1,
              adapter: 'django-component-parser@0.1',
              analyzerVersion,
            },
            confidence: 'inferred',
            inferenceChain: [`django: FBV ${funcName}(request, ...) in ${relPath}`],
          }),
        )
      }
    }
  }

  return nodes
}
