import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type Parser from 'web-tree-sitter'
import {
  createEdge,
  makeEdgeId,
  type IREdge,
  type ComponentNode,
  type Provenance,
} from '@codebase-viz/types'
import { createJavaParser } from '../../_shared/tree-sitter-loader.js'
import { findJavaFiles } from '../../_shared/file-finder.js'

const SPRING_COMPONENT_ANNOTATIONS = new Set([
  'Controller', 'RestController', 'Service', 'Repository', 'Component',
])

function getAnnotationName(node: Parser.SyntaxNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null && child.type === 'identifier') return child.text
    if (child !== null && child.type === 'scoped_identifier') {
      const last = child.lastChild
      if (last !== null) return last.text
    }
  }
  return undefined
}

function hasAutowired(modifiers: Parser.SyntaxNode): boolean {
  for (let i = 0; i < modifiers.childCount; i++) {
    const node = modifiers.child(i)
    if (node === null) continue
    if (node.type === 'annotation' || node.type === 'marker_annotation') {
      if (getAnnotationName(node) === 'Autowired') return true
    }
  }
  return false
}

function extractParamTypes(formalParams: Parser.SyntaxNode): string[] {
  const types: string[] = []
  for (let i = 0; i < formalParams.childCount; i++) {
    const param = formalParams.child(i)
    if (param === null || param.type !== 'formal_parameter') continue
    for (let j = 0; j < param.childCount; j++) {
      const child = param.child(j)
      if (child !== null && child.type === 'type_identifier') {
        types.push(child.text)
        break
      }
    }
  }
  return types
}

export async function parseSpringDependencies(
  repoRoot: string,
  componentNodes: ComponentNode[],
  analyzerVersion: string,
): Promise<IREdge[]> {
  if (componentNodes.length === 0) return []

  const nameToNode = new Map<string, ComponentNode>()
  for (const node of componentNodes) {
    nameToNode.set(node.name, node)
  }

  const javaFiles = await findJavaFiles(repoRoot)
  if (javaFiles.length === 0) return []

  const parser = await createJavaParser()
  const edges: IREdge[] = []
  const seenEdgeIds = new Set<string>()

  function addEdge(from: ComponentNode, toTypeName: string, provenance: Provenance): void {
    // v1.2.41 ST-FIX: interface 타입 매핑 실패 시 Impl 컨벤션 fallback
    // (Spring 표준: Controller가 Service interface 주입 → ServiceImpl 매핑)
    const toNode = nameToNode.get(toTypeName) ?? nameToNode.get(`${toTypeName}Impl`)
    if (toNode === undefined || from.id === toNode.id) return
    const edgeId = makeEdgeId('calls', from.id, toNode.id)
    if (seenEdgeIds.has(edgeId)) return
    seenEdgeIds.add(edgeId)
    edges.push(
      createEdge({
        id: edgeId,
        from: from.id,
        to: toNode.id,
        kind: 'calls',
        provenance,
        confidence: 'inferred',
        inferenceChain: [
          `spring-di: ${from.name} → ${toTypeName} in ${provenance.file}`,
        ],
      }),
    )
  }

  for (const filePath of javaFiles) {
    const source = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (source === null) continue

    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const tree = parser.parse(source)

    function walkNode(node: Parser.SyntaxNode): void {
      if (node.type !== 'class_declaration') {
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (child !== null) walkNode(child)
        }
        return
      }

      const nameNode = node.childForFieldName('name')
      if (nameNode === null) return
      const fromNode = nameToNode.get(nameNode.text)
      if (fromNode === undefined) return

      // Verify class has Spring component annotation
      let isSpringComponent = false
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child === null || child.type !== 'modifiers') continue
        for (let j = 0; j < child.childCount; j++) {
          const mod = child.child(j)
          if (mod === null || (mod.type !== 'annotation' && mod.type !== 'marker_annotation')) continue
          const annotName = getAnnotationName(mod)
          if (annotName !== undefined && SPRING_COMPONENT_ANNOTATIONS.has(annotName)) {
            isSpringComponent = true
            break
          }
        }
        if (isSpringComponent) break
      }
      if (!isSpringComponent) return

      const provenance: Provenance = {
        file: relPath,
        line: node.startPosition.row + 1,
        adapter: 'spring-di-parser@0.1',
        analyzerVersion,
      }

      for (let i = 0; i < node.childCount; i++) {
        const classBody = node.child(i)
        if (classBody === null || classBody.type !== 'class_body') continue

        const constructors: Array<{ autowired: boolean; paramTypes: string[] }> = []

        for (let j = 0; j < classBody.childCount; j++) {
          const member = classBody.child(j)
          if (member === null) continue

          // Field injection: @Autowired on field
          if (member.type === 'field_declaration') {
            let autowired = false
            let fieldType: string | undefined
            for (let k = 0; k < member.childCount; k++) {
              const part = member.child(k)
              if (part === null) continue
              if (part.type === 'modifiers' && hasAutowired(part)) autowired = true
              if (part.type === 'type_identifier') fieldType = part.text
            }
            if (autowired && fieldType !== undefined) addEdge(fromNode, fieldType, provenance)
          }

          // Constructor injection (collected for single-ctor auto-inject)
          if (member.type === 'constructor_declaration') {
            let autowired = false
            let paramTypes: string[] = []
            for (let k = 0; k < member.childCount; k++) {
              const part = member.child(k)
              if (part === null) continue
              if (part.type === 'modifiers' && hasAutowired(part)) autowired = true
              if (part.type === 'formal_parameters') paramTypes = extractParamTypes(part)
            }
            constructors.push({ autowired, paramTypes })
          }

          // Setter injection: @Autowired on method starting with "set"
          if (member.type === 'method_declaration') {
            let autowired = false
            let methodName: string | undefined
            let paramTypes: string[] = []
            for (let k = 0; k < member.childCount; k++) {
              const part = member.child(k)
              if (part === null) continue
              if (part.type === 'modifiers' && hasAutowired(part)) autowired = true
              if (part.type === 'identifier') methodName = part.text
              if (part.type === 'formal_parameters') paramTypes = extractParamTypes(part)
            }
            if (autowired && methodName?.startsWith('set') === true) {
              for (const t of paramTypes) addEdge(fromNode, t, provenance)
            }
          }
        }

        // Single constructor → Spring auto-injects. Multi-constructor → only @Autowired one.
        if (constructors.length === 1 && constructors[0] !== undefined) {
          for (const t of constructors[0].paramTypes) addEdge(fromNode, t, provenance)
        } else {
          for (const ctor of constructors) {
            if (ctor.autowired) {
              for (const t of ctor.paramTypes) addEdge(fromNode, t, provenance)
            }
          }
        }
      }
    }

    walkNode(tree.rootNode)
  }

  return edges
}
