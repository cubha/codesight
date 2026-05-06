import * as path from 'node:path'
import * as fs from 'node:fs'
import { Project, SyntaxKind, type TypeNode } from 'ts-morph'
import {
  createTableNode,
  makeNodeId,
  type TableNode,
  type ColumnDef,
  type Provenance,
} from '@codebase-viz/types'

const CANDIDATE_PATHS = [
  'src/types/supabase.ts',
  'types/supabase.ts',
  'lib/types/supabase.ts',
]

function normalizeType(rawType: string): string {
  const base = rawType.replace(/\s*\|\s*null/, '').trim()
  const map: Record<string, string> = { string: 'text', number: 'int8', boolean: 'bool' }
  return map[base] ?? base
}

function extractStringLiteral(typeNode: TypeNode): string | undefined {
  if (!typeNode.isKind(SyntaxKind.LiteralType)) return undefined
  const literal = typeNode.asKindOrThrow(SyntaxKind.LiteralType).getLiteral()
  const text = literal.getText()
  if (text.startsWith('"') || text.startsWith("'")) return text.slice(1, -1)
  return undefined
}

export async function parseSupabaseTables(repoRoot: string, analyzerVersion: string): Promise<TableNode[]> {
  let supabaseTypePath: string | undefined
  for (const candidate of CANDIDATE_PATHS) {
    const p = path.join(repoRoot, candidate)
    if (fs.existsSync(p)) { supabaseTypePath = p; break }
  }
  if (supabaseTypePath === undefined) return []

  const project = new Project({ skipAddingFilesFromTsConfig: true })
  const sourceFile = project.addSourceFileAtPath(supabaseTypePath)

  const databaseType = sourceFile.getTypeAlias('Database')
  if (databaseType === undefined) return []
  const dbTypeNode = databaseType.getTypeNode()
  if (dbTypeNode === undefined || !dbTypeNode.isKind(SyntaxKind.TypeLiteral)) return []

  const publicProp = dbTypeNode.asKindOrThrow(SyntaxKind.TypeLiteral).getProperty('public')
  if (publicProp === undefined) return []
  const publicTypeNode = publicProp.getTypeNode()
  if (publicTypeNode === undefined || !publicTypeNode.isKind(SyntaxKind.TypeLiteral)) return []

  const tablesProp = publicTypeNode.asKindOrThrow(SyntaxKind.TypeLiteral).getProperty('Tables')
  if (tablesProp === undefined) return []
  const tablesTypeNode = tablesProp.getTypeNode()
  if (tablesTypeNode === undefined || !tablesTypeNode.isKind(SyntaxKind.TypeLiteral)) return []
  const tablesTypeLiteral = tablesTypeNode.asKindOrThrow(SyntaxKind.TypeLiteral)

  const repoRelativePath = path.relative(repoRoot, supabaseTypePath).replace(/\\/g, '/')
  const provenance: Provenance = {
    file: repoRelativePath,
    line: 1,
    adapter: 'supabase-types@0.1',
    analyzerVersion,
  }

  const tables: TableNode[] = []

  for (const tableProp of tablesTypeLiteral.getProperties()) {
    const tableName = tableProp.getName()
    const tableTypeNode = tableProp.getTypeNode()
    if (tableTypeNode === undefined || !tableTypeNode.isKind(SyntaxKind.TypeLiteral)) continue
    const tableTypeLiteral = tableTypeNode.asKindOrThrow(SyntaxKind.TypeLiteral)

    // Build FK map from Relationships
    const fkMap = new Map<string, { table: string; column: string }>()
    const relProp = tableTypeLiteral.getProperty('Relationships')
    if (relProp !== undefined) {
      const relTypeNode = relProp.getTypeNode()
      if (relTypeNode?.isKind(SyntaxKind.TupleType)) {
        for (const element of relTypeNode.asKindOrThrow(SyntaxKind.TupleType).getElements()) {
          if (!element.isKind(SyntaxKind.TypeLiteral)) continue
          const relLiteral = element.asKindOrThrow(SyntaxKind.TypeLiteral)
          const colsProp = relLiteral.getProperty('columns')
          const refRelProp = relLiteral.getProperty('referencedRelation')
          const refColsProp = relLiteral.getProperty('referencedColumns')
          if (!colsProp || !refRelProp || !refColsProp) continue
          const colsTypeNode = colsProp.getTypeNode()
          if (!colsTypeNode?.isKind(SyntaxKind.TupleType)) continue
          const fkColName = extractStringLiteral(colsTypeNode.asKindOrThrow(SyntaxKind.TupleType).getElements()[0]!)
          const refTableName = extractStringLiteral(refRelProp.getTypeNode()!)
          const refColsTypeNode = refColsProp.getTypeNode()
          if (!refColsTypeNode?.isKind(SyntaxKind.TupleType)) continue
          const refColName = extractStringLiteral(refColsTypeNode.asKindOrThrow(SyntaxKind.TupleType).getElements()[0]!)
          if (fkColName && refTableName && refColName) fkMap.set(fkColName, { table: refTableName, column: refColName })
        }
      }
    }

    const rowProp = tableTypeLiteral.getProperty('Row')
    if (rowProp === undefined) continue
    const rowTypeNode = rowProp.getTypeNode()
    if (rowTypeNode === undefined || !rowTypeNode.isKind(SyntaxKind.TypeLiteral)) continue

    const columns: ColumnDef[] = []
    for (const colProp of rowTypeNode.asKindOrThrow(SyntaxKind.TypeLiteral).getProperties()) {
      const colName = colProp.getName()
      const colTypeNode = colProp.getTypeNode()
      if (colTypeNode === undefined) continue
      const rawType = colTypeNode.getText()
      const nullable = rawType.includes('| null') || rawType.includes('null |')
      const fk = fkMap.get(colName)
      columns.push({
        name: colName,
        type: normalizeType(rawType),
        nullable,
        ...(colName === 'id' ? { isPrimaryKey: true } : {}),
        ...(fk !== undefined ? { references: fk } : {}),
      })
    }

    tables.push(
      createTableNode({
        id: makeNodeId('table', repoRelativePath, tableName),
        name: tableName,
        columns,
        provenance,
        confidence: 'verified',
      }),
    )
  }

  return tables
}
