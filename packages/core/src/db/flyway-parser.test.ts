import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseFlywayMigrations, mergeFlywayTables } from './flyway-parser.js'
import { createTableNode, makeNodeId } from '@codebase-viz/types'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flyway-test-'))
}

function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

describe('parseFlywayMigrations', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('케이스 1: V1__init.sql 단일 파일 → TableNode 1개, name="users"', async () => {
    tempDir = makeTempDir()
    const migDir = path.join(tempDir, 'src/main/resources/db/migration')
    mkdirp(migDir)
    fs.writeFileSync(
      path.join(migDir, 'V1__init.sql'),
      `CREATE TABLE users (
  id BIGINT NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255)
);`,
    )

    const tables = await parseFlywayMigrations(tempDir)
    expect(tables).toHaveLength(1)
    expect(tables[0]!.name).toBe('users')
    expect(tables[0]!.confidence).toBe('verified')
    expect(tables[0]!.provenance.adapter).toBe('flyway-parser@0.1')
    expect(tables[0]!.columns.length).toBeGreaterThanOrEqual(1)
  })

  it('케이스 2: 다중 V (V1__init.sql, V2__add_orders.sql) → TableNode 2개', async () => {
    tempDir = makeTempDir()
    const migDir = path.join(tempDir, 'db/migrations')
    mkdirp(migDir)
    fs.writeFileSync(
      path.join(migDir, 'V1__init.sql'),
      `CREATE TABLE users (id BIGINT NOT NULL PRIMARY KEY);`,
    )
    fs.writeFileSync(
      path.join(migDir, 'V2__add_orders.sql'),
      `CREATE TABLE orders (id BIGINT NOT NULL PRIMARY KEY, user_id BIGINT NOT NULL);`,
    )

    const tables = await parseFlywayMigrations(tempDir)
    expect(tables).toHaveLength(2)
    const names = tables.map(t => t.name).sort()
    expect(names).toEqual(['orders', 'users'])
  })

  it('케이스 3: 빈 디렉토리 (sql 없음) → []', async () => {
    tempDir = makeTempDir()
    const migDir = path.join(tempDir, 'db/migrations')
    mkdirp(migDir)
    // no .sql files written

    const tables = await parseFlywayMigrations(tempDir)
    expect(tables).toEqual([])
  })

  it('케이스 4: db/migration/ 자체 없음 → []', async () => {
    tempDir = makeTempDir()
    // no migration directory at all

    const tables = await parseFlywayMigrations(tempDir)
    expect(tables).toEqual([])
  })
})

describe('mergeFlywayTables', () => {
  const dummyProvenance = {
    file: 'dummy.sql',
    line: 1,
    adapter: 'test@0.1',
    analyzerVersion: 'test@0.1',
  }

  function makeTable(name: string, cols: Array<{ name: string }> = []): ReturnType<typeof createTableNode> {
    return createTableNode({
      id: makeNodeId('table', 'dummy.sql', name),
      name,
      columns: cols.map(c => ({ name: c.name, type: 'text', nullable: true, isPrimaryKey: false })),
      provenance: dummyProvenance,
      confidence: 'verified',
    })
  }

  it('동명 테이블: ORM 우선, Flyway 컬럼 보강', () => {
    const ormTable = makeTable('users', [{ name: 'id' }, { name: 'email' }])
    const flywayTable = makeTable('users', [{ name: 'id' }, { name: 'created_at' }])

    const merged = mergeFlywayTables([ormTable], [flywayTable])
    expect(merged).toHaveLength(1)
    const cols = merged[0]!.columns.map(c => c.name)
    expect(cols).toContain('id')
    expect(cols).toContain('email')
    expect(cols).toContain('created_at')
    // ORM 우선 확인: 동일 id는 한 번만
    expect(cols.filter(n => n === 'id')).toHaveLength(1)
  })

  it('ORM에 없는 Flyway 테이블은 추가됨', () => {
    const ormTable = makeTable('users', [{ name: 'id' }])
    const flywayTable = makeTable('orders', [{ name: 'id' }, { name: 'total' }])

    const merged = mergeFlywayTables([ormTable], [flywayTable])
    expect(merged).toHaveLength(2)
    const names = merged.map(t => t.name).sort()
    expect(names).toEqual(['orders', 'users'])
  })

  it('ORM 테이블만 있고 Flyway 없으면 그대로 반환', () => {
    const ormTable = makeTable('users', [{ name: 'id' }])
    const merged = mergeFlywayTables([ormTable], [])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.name).toBe('users')
  })

  it('둘 다 비어 있으면 []', () => {
    const merged = mergeFlywayTables([], [])
    expect(merged).toEqual([])
  })
})
