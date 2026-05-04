import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  createTableNode,
  makeNodeId,
  type TableNode,
  type ColumnDef,
  type Provenance,
} from '@codebase-viz/types'
import { createPythonParser } from '../../_shared/tree-sitter-loader.js'

const EXCLUDE_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'venv', '.venv', 'env'])

// Flask-SQLAlchemy 베이스 이름: 단순 identifier 형태
const SQLALCHEMY_BASES = new Set(['Base', 'DeclarativeBase', 'Model'])

// attribute 형태의 베이스 전체 텍스트 (예: db.Model)
const SQLALCHEMY_ATTR_BASES = new Set(['db.Model', 'Base.Model'])

const SQLALCHEMY_COLUMN_TYPES = new Set([
  'String', 'Integer', 'Float', 'Boolean', 'DateTime', 'Date', 'Text', 'JSON',
  'BigInteger', 'Numeric', 'LargeBinary', 'UUID', 'Enum',
])

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

function extractStringContent(node: import('web-tree-sitter').SyntaxNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null && child.type === 'string_content') return child.text
  }
  return undefined
}

/**
 * call의 argument_list에서 keyword_argument를 탐색하여 nullable 값을 추출한다.
 * 기본값: true (SQLAlchemy Column/mapped_column 기본값)
 */
function parseNullable(callNode: import('web-tree-sitter').SyntaxNode): boolean {
  const argList = callNode.childForFieldName('arguments')
  if (argList === null) return true

  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null || arg.type !== 'keyword_argument') continue

    const key = arg.child(0)
    const val = arg.child(2)
    if (key?.text === 'nullable' && val !== null) {
      if (val.text === 'True') return true
      if (val.text === 'False') return false
    }
  }

  return true
}

/**
 * call의 argument_list에서 primary_key=True 여부를 추출한다.
 */
function parsePrimaryKey(callNode: import('web-tree-sitter').SyntaxNode): boolean {
  const argList = callNode.childForFieldName('arguments')
  if (argList === null) return false
  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null || arg.type !== 'keyword_argument') continue
    const key = arg.child(0)
    const val = arg.child(2)
    if (key?.text === 'primary_key' && val?.text === 'True') return true
  }
  return false
}

/**
 * Mapped[T] 타입 어노테이션 노드에서 nullable 여부를 추론한다.
 * Optional[T] 또는 T | None 패턴이면 true, 구체 타입이면 false, Mapped 없으면 undefined.
 */
function parseMappedNullable(typeAnnotationNode: import('web-tree-sitter').SyntaxNode | null): boolean | undefined {
  if (typeAnnotationNode === null) return undefined

  function findMappedNode(node: import('web-tree-sitter').SyntaxNode): import('web-tree-sitter').SyntaxNode | undefined {
    if (node.type === 'generic_type' && node.child(0)?.text === 'Mapped') return node
    if (node.type === 'subscript') {
      const valueNode = node.childForFieldName('value') ?? node.child(0)
      if (valueNode?.text === 'Mapped') return node
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child !== null) {
        const found = findMappedNode(child)
        if (found !== undefined) return found
      }
    }
    return undefined
  }

  const mappedNode = findMappedNode(typeAnnotationNode)
  if (mappedNode === undefined) return undefined

  let typeArgText: string | undefined
  if (mappedNode.type === 'generic_type') {
    typeArgText = mappedNode.child(1)?.text
  } else {
    const subscriptArg = mappedNode.childForFieldName('subscript') ?? mappedNode.child(2)
    typeArgText = subscriptArg?.text
  }

  if (typeArgText === undefined) return undefined

  if (
    typeArgText.includes('Optional') ||
    typeArgText.includes('| None') ||
    typeArgText.includes('None |')
  ) {
    return true
  }

  return false
}

/**
 * call의 argument_list에서 첫 번째 positional argument(타입명)를 추출한다.
 * ForeignKey(...)가 있으면 타입명 뒤 →FK를 붙인다.
 * 추출 실패 시 funcName(fallback)을 반환한다.
 */
function parseColumnType(
  callNode: import('web-tree-sitter').SyntaxNode,
  fallback: string,
): string {
  const argList = callNode.childForFieldName('arguments')
  if (argList === null) return fallback

  let firstPositionalType: string | undefined
  let hasForeignKey = false

  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null) continue

    if (arg.type === 'keyword_argument') continue
    if (arg.type === ',') continue

    if (arg.type === 'call') {
      const funcNode = arg.childForFieldName('function')
      const callName =
        funcNode?.type === 'attribute' ? funcNode.lastChild?.text : funcNode?.text
      if (callName === 'ForeignKey') {
        hasForeignKey = true
        continue
      }
      continue
    }

    if (arg.type === 'identifier' || arg.type === 'attribute') {
      if (firstPositionalType === undefined) {
        const typeName =
          arg.type === 'attribute' ? (arg.lastChild?.text ?? arg.text) : arg.text
        firstPositionalType = typeName
      }
      continue
    }
  }

  if (firstPositionalType === undefined) return fallback

  return hasForeignKey ? `${firstPositionalType}→FK` : firstPositionalType
}

/**
 * 클래스의 베이스가 Flask-SQLAlchemy 모델 베이스인지 확인한다.
 * - identifier 노드: Base, DeclarativeBase, Model (SQLALCHEMY_BASES)
 * - attribute 노드: db.Model 등 (전체 텍스트 비교)
 */
function isFlaskModelBase(baseNode: import('web-tree-sitter').SyntaxNode): boolean {
  if (baseNode.type === 'identifier') {
    return SQLALCHEMY_BASES.has(baseNode.text)
  }
  if (baseNode.type === 'attribute') {
    // 전체 텍스트 비교 (예: "db.Model")
    return SQLALCHEMY_ATTR_BASES.has(baseNode.text)
  }
  return false
}

export async function parseFlaskSqlAlchemyModels(
  repoRoot: string,
  analyzerVersion: string,
): Promise<TableNode[]> {
  const pyFiles = await findPyFiles(repoRoot)

  const parser = await createPythonParser()
  const tables: TableNode[] = []

  for (const filePath of pyFiles) {
    const source = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (source === null) continue

    // 파일 필터: SQLAlchemy 관련 코드가 없으면 스킵
    if (
      !source.includes('SQLAlchemy') &&
      !source.includes('db.Model') &&
      !source.includes('Base')
    ) continue

    // Column 정의가 없으면 스킵
    if (!source.includes('Column') && !source.includes('mapped_column')) continue

    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const tree = parser.parse(source)

    for (let i = 0; i < tree.rootNode.childCount; i++) {
      const node = tree.rootNode.child(i)
      if (node === null || node.type !== 'class_definition') continue

      const nameNode = node.childForFieldName('name')
      if (nameNode === null) continue

      const baseClause = node.childForFieldName('superclasses')
      if (baseClause === null) continue

      let isModel = false
      for (let j = 0; j < baseClause.childCount; j++) {
        const base = baseClause.child(j)
        if (base !== null && isFlaskModelBase(base)) {
          isModel = true
          break
        }
      }
      if (!isModel) continue

      const className = nameNode.text
      const columns: ColumnDef[] = []
      let tableName: string = className

      const body = node.childForFieldName('body')
      if (body !== null) {
        // 1패스: __tablename__ 추출
        for (let j = 0; j < body.childCount; j++) {
          const stmt = body.child(j)
          if (stmt === null || stmt.type !== 'expression_statement') continue

          const assign = stmt.child(0)
          if (assign === null || assign.type !== 'assignment') continue

          const left = assign.childForFieldName('left')
          const right = assign.childForFieldName('right')
          if (left === null || right === null) continue

          if (left.type === 'identifier' && left.text === '__tablename__') {
            if (right.type === 'string') {
              const extracted = extractStringContent(right)
              if (extracted !== undefined) tableName = extracted
            }
            break
          }
        }

        // 2패스: Column/mapped_column 필드 추출
        for (let j = 0; j < body.childCount; j++) {
          const stmt = body.child(j)
          if (stmt === null) continue

          if (stmt.type === 'expression_statement') {
            const assign = stmt.child(0)
            if (assign === null || assign.type !== 'assignment') continue
            const left = assign.childForFieldName('left')
            const right = assign.childForFieldName('right')
            if (left === null || right === null || left.type !== 'identifier') continue

            const fieldName = left.text
            if (fieldName === '__tablename__') continue
            if (right.type !== 'call') continue
            const funcNode = right.childForFieldName('function')
            if (funcNode === null) continue

            const funcName = funcNode.type === 'attribute' ? funcNode.lastChild?.text : funcNode.text
            if (funcName !== 'Column' && funcName !== 'mapped_column') continue

            const isPrimaryKey = parsePrimaryKey(right)

            const typeAnnotation = assign.childForFieldName('type')
            const mappedNullable = parseMappedNullable(typeAnnotation)
            const nullable = isPrimaryKey ? false : (mappedNullable ?? parseNullable(right))

            const colType = parseColumnType(right, funcName ?? 'Column')

            columns.push({
              name: fieldName,
              type: colType,
              nullable,
              ...(isPrimaryKey ? { isPrimaryKey: true } : {}),
            })
          }
        }
      }

      const provenance: Provenance = {
        file: relPath,
        line: node.startPosition.row + 1,
        adapter: 'flask-orm-parser@0.1',
        analyzerVersion,
      }

      if (columns.length === 0) continue

      tables.push(
        createTableNode({
          id: makeNodeId('table', relPath, className),
          name: tableName,
          columns,
          provenance,
          confidence: 'inferred',
          inferenceChain: [`flask-sqlalchemy: db.Model subclass ${className} in ${relPath}`],
        }),
      )
    }
  }

  return tables
}
