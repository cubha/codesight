import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseSupabaseTables } from './supabase-parser.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-supabase-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function writeFile(relPath: string, content: string): Promise<void> {
  const absPath = path.join(tmpDir, relPath)
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf-8')
}

const SUPABASE_TYPES_SIMPLE = `
export type Database = {
  public: {
    Tables: {
      posts: {
        Row: {
          id: number
          title: string
          body: string | null
        }
        Insert: { title: string }
        Update: { title?: string }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
`

const SUPABASE_TYPES_WITH_FK = `
export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          id: number
          post_id: number
          content: string
        }
        Insert: { post_id: number; content: string }
        Update: { content?: string }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            referencedRelation: "posts"
            referencedColumns: ["id"]
          }
        ]
      }
      posts: {
        Row: {
          id: number
          title: string
        }
        Insert: { title: string }
        Update: { title?: string }
        Relationships: []
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
`

describe('parseSupabaseTables', () => {
  it('supabase.ts 없으면 빈 배열 반환', async () => {
    const tables = await parseSupabaseTables(tmpDir, 'test')
    expect(tables).toEqual([])
  })

  it('src/types/supabase.ts 경로 감지', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    expect(tables).toHaveLength(1)
    expect(tables[0]?.name).toBe('posts')
  })

  it('types/supabase.ts 경로 감지', async () => {
    await writeFile('types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    expect(tables).toHaveLength(1)
  })

  it('lib/types/supabase.ts 경로 감지', async () => {
    await writeFile('lib/types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    expect(tables).toHaveLength(1)
  })

  it('Row 컬럼 추출 — 타입·nullable', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    const cols = tables[0]?.columns ?? []
    const bodyCol = cols.find(c => c.name === 'body')
    expect(bodyCol?.nullable).toBe(true)
    const titleCol = cols.find(c => c.name === 'title')
    expect(titleCol?.nullable).toBe(false)
    expect(titleCol?.type).toBe('text')
  })

  it('id 컬럼 → isPrimaryKey: true', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    const idCol = tables[0]?.columns.find(c => c.name === 'id')
    expect(idCol?.isPrimaryKey).toBe(true)
  })

  it('Relationships → ColumnDef.references FK 연결', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_WITH_FK)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    const comments = tables.find(t => t.name === 'comments')
    const fkCol = comments?.columns.find(c => c.name === 'post_id')
    expect(fkCol?.references?.table).toBe('posts')
    expect(fkCol?.references?.column).toBe('id')
  })

  it('복수 테이블 모두 추출', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_WITH_FK)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    expect(tables.map(t => t.name)).toEqual(expect.arrayContaining(['comments', 'posts']))
  })

  it('confidence: verified', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const tables = await parseSupabaseTables(tmpDir, 'test')
    expect(tables[0]?.confidence).toBe('verified')
  })

  it('NodeId 결정론적 생성', async () => {
    await writeFile('src/types/supabase.ts', SUPABASE_TYPES_SIMPLE)
    const [r1, r2] = await Promise.all([
      parseSupabaseTables(tmpDir, 'test'),
      parseSupabaseTables(tmpDir, 'test'),
    ])
    expect(r1[0]?.id).toBe(r2[0]?.id)
  })
})
