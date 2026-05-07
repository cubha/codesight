import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  createTableNode,
  makeNodeId,
  type TableNode,
  type ColumnDef,
} from '@codebase-viz/types'

// Flyway V<version>__<name>.sql naming convention
// version can be: 1, 1_1, 1.1 etc.
const FLYWAY_FILE_RE = /^[Vv][\d._]+__[^/\\]+\.sql$/

// Candidate directories for Flyway migrations, checked in order
const MIGRATION_DIRS = [
  'src/main/resources/db/migration',
  'db/migrations',
  'migrations',
]

async function collectFlywayFiles(repoRoot: string): Promise<string[]> {
  const collected: string[] = []
  for (const rel of MIGRATION_DIRS) {
    const dir = path.join(repoRoot, rel)
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null)
    if (!entries) continue
    for (const e of entries) {
      if (e.isFile() && FLYWAY_FILE_RE.test(e.name)) {
        collected.push(path.join(dir, e.name))
      }
    }
  }
  return collected
}

interface ParsedTable {
  name: string
  columns: ColumnDef[]
  line: number
}

// Extract table name and columns from a single CREATE TABLE statement.
// Handles nested parentheses (e.g. DECIMAL(10,2)).
// TODO: ALTER TABLE support (column add/drop) is excluded in this phase.
function parseCreateTable(sql: string): ParsedTable[] {
  const results: ParsedTable[] = []

  // Match CREATE TABLE [IF NOT EXISTS] [schema.]name (...)
  const createRe = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[A-Za-z_][A-Za-z0-9_$]*\.)?([A-Za-z_][A-Za-z0-9_$]*)\s*\(/gi

  let m: RegExpExecArray | null
  while ((m = createRe.exec(sql)) !== null) {
    const tableName = m[1]
    if (!tableName) continue

    const line = sql.slice(0, m.index).split('\n').length

    // Find the matching closing paren, tracking depth
    const startIdx = m.index + m[0].length
    let depth = 1
    let i = startIdx
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth++
      else if (sql[i] === ')') depth--
      i++
    }
    const bodyRaw = sql.slice(startIdx, i - 1)
    const columns = extractColumnsFromBody(bodyRaw)
    results.push({ name: tableName, columns, line })
  }
  return results
}

// Non-column constraint keywords that start a definition line
const CONSTRAINT_START = /^\s*(?:PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|UNIQUE|INDEX|KEY|CHECK)\b/i

function extractColumnsFromBody(body: string): ColumnDef[] {
  // Split on commas that are NOT inside parentheses
  const defs = splitTopLevel(body)
  const cols: ColumnDef[] = []
  const pkSet = new Set<string>()

  // First pass: collect PRIMARY KEY inline markers and standalone PK constraints
  for (const def of defs) {
    const trimmed = def.trim()
    // Standalone PRIMARY KEY (col1, col2)
    const pkConstraintM = /^\s*(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(trimmed)
    if (pkConstraintM) {
      for (const col of (pkConstraintM[1] ?? '').split(',')) {
        pkSet.add(col.trim().replace(/`|"/g, ''))
      }
    }
  }

  for (const def of defs) {
    const trimmed = def.trim()
    if (!trimmed) continue
    if (CONSTRAINT_START.test(trimmed)) continue

    // Column name: first identifier (may be backtick- or quote-delimited)
    const colNameM = /^[`"]?([A-Za-z_][A-Za-z0-9_$]*)[`"]?\s+/.exec(trimmed)
    if (!colNameM) continue
    const colName = colNameM[1]
    if (!colName) continue

    // Type: next token after column name (skip length spec)
    const rest = trimmed.slice(colNameM[0].length)
    const typeM = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest)
    const colType = typeM?.[1] ?? 'unknown'

    const isPrimaryKey = pkSet.has(colName) || /\bPRIMARY\s+KEY\b/i.test(trimmed)
    const nullable = !isPrimaryKey && !/\bNOT\s+NULL\b/i.test(trimmed)

    cols.push({ name: colName, type: colType.toLowerCase(), nullable, isPrimaryKey })
  }
  return cols
}

// Split a string on commas that are not inside parentheses
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts
}

export async function parseFlywayMigrations(repoRoot: string): Promise<TableNode[]> {
  const files = await collectFlywayFiles(repoRoot)
  const tableMap = new Map<string, TableNode>()

  for (const filePath of files) {
    const sql = await fs.readFile(filePath, 'utf-8').catch(() => null)
    if (!sql) continue
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/')
    const parsed = parseCreateTable(sql)
    for (const { name, columns, line } of parsed) {
      if (tableMap.has(name)) continue
      tableMap.set(
        name,
        createTableNode({
          id: makeNodeId('table', relPath, name),
          name,
          columns,
          provenance: {
            file: relPath,
            line,
            adapter: 'flyway-parser@0.1',
            analyzerVersion: 'codebase-viz@0.1.0',
          },
          confidence: 'verified',
        }),
      )
    }
  }

  return [...tableMap.values()]
}

// Merge Flyway tables into ORM tables.
// ORM tables take precedence by name.
// Flyway columns that do not exist in the ORM table are appended.
export function mergeFlywayTables(ormTables: TableNode[], flywayTables: TableNode[]): TableNode[] {
  const result = new Map<string, TableNode>(ormTables.map(t => [t.name, t]))

  for (const fw of flywayTables) {
    const existing = result.get(fw.name)
    if (!existing) {
      result.set(fw.name, fw)
    } else {
      // Supplement: add Flyway columns not present in ORM table
      const existingColNames = new Set(existing.columns.map(c => c.name))
      const extraCols = fw.columns.filter(c => !existingColNames.has(c.name))
      if (extraCols.length > 0) {
        result.set(fw.name, { ...existing, columns: [...existing.columns, ...extraCols] })
      }
    }
  }

  return [...result.values()]
}
