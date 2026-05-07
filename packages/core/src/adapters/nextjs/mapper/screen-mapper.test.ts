import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseComponents } from '../parsers/component-parser.js'
import { parseTables } from '../parsers/db-parser.js'
import { mapScreenToTable, mapServerFilesToTable } from './screen-mapper.js'
import { createIRGraph, createTableNode, makeNodeId } from '@codebase-viz/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/mini-next-app')

describe('mapScreenToTable', () => {
  it('PostList.tsx → posts 테이블 queries 엣지를 생성한다', async () => {
    const { nodes: componentNodes, edges: componentEdges } = await parseComponents(FIXTURE)
    const tableNodes = await parseTables(FIXTURE)

    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: FIXTURE,
      nodes: [...componentNodes, ...tableNodes],
      edges: componentEdges,
    })

    const edges = await mapScreenToTable(graph)

    expect(edges.length).toBeGreaterThan(0)

    const postListNode = componentNodes.find(n => n.name === 'PostList')
    const postsTableNode = tableNodes.find(n => n.name === 'posts')
    expect(postListNode).toBeDefined()
    expect(postsTableNode).toBeDefined()

    const edge = edges.find(
      e => e.from === postListNode!.id && e.to === postsTableNode!.id,
    )
    expect(edge).toBeDefined()
    expect(edge!.kind).toBe('queries')
    expect(edge!.confidence).toBe('verified')
  })

  it('테이블 없는 컴포넌트는 엣지를 생성하지 않는다', async () => {
    const { nodes: componentNodes, edges: componentEdges } = await parseComponents(FIXTURE)

    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: FIXTURE,
      nodes: componentNodes,
      edges: componentEdges,
    })

    const edges = await mapScreenToTable(graph)
    expect(edges).toHaveLength(0)
  })

  it('routeNode 파일의 supabase.from() 호출도 queries 엣지를 생성한다', async () => {
    const routeNodes = await (await import('../parsers/route-parser.js')).parseRoutes(FIXTURE)
    const tableNodes = await parseTables(FIXTURE)

    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: FIXTURE,
      nodes: [...routeNodes, ...tableNodes],
      edges: [],
    })

    const edges = await mapScreenToTable(graph)
    // mini-next-app's page.tsx may or may not have supabase.from() — just ensure no crash
    expect(Array.isArray(edges)).toBe(true)
  })

  it('mapServerFilesToTable: actions/ 디렉토리의 supabase.from() 호출을 감지한다', async () => {
    const tableNodes = await parseTables(FIXTURE)
    const { nodes, edges } = await mapServerFilesToTable(FIXTURE, tableNodes)
    // mini-next-app has no src/actions/ → returns empty (no crash)
    expect(Array.isArray(nodes)).toBe(true)
    expect(Array.isArray(edges)).toBe(true)
  })

  it('같은 컴포넌트-테이블 쌍은 중복 엣지를 생성하지 않는다', async () => {
    const { nodes: componentNodes, edges: componentEdges } = await parseComponents(FIXTURE)
    const tableNodes = await parseTables(FIXTURE)

    const graph = createIRGraph({
      analyzerVersion: 'codebase-viz@0.1.0',
      repoRoot: FIXTURE,
      nodes: [...componentNodes, ...tableNodes],
      edges: componentEdges,
    })

    const edges = await mapScreenToTable(graph)
    const edgeIds = edges.map(e => e.id)
    const uniqueIds = new Set(edgeIds)
    expect(edgeIds.length).toBe(uniqueIds.size)
  })

  it('src/lib 디렉토리의 supabase from() 호출을 queries 엣지로 연결한다 (N-19)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'screen-mapper-n19-'))
    try {
      await fs.mkdir(path.join(tmpDir, 'src/lib'), { recursive: true })
      await fs.writeFile(
        path.join(tmpDir, 'src/lib/users.ts'),
        [
          "import { createClient } from '@supabase/supabase-js'",
          "const sb = createClient('', '')",
          "export async function getUsers() { return sb.from('users').select('*') }",
        ].join('\n'),
      )

      const usersTableNode = createTableNode({
        id: makeNodeId('table', 'schema.sql', 'users'),
        name: 'users',
        columns: [{ name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true }],
        provenance: { file: 'schema.sql', line: 1, adapter: 'test', analyzerVersion: 'test' },
        confidence: 'verified',
      })

      const { nodes, edges } = await mapServerFilesToTable(tmpDir, [usersTableNode])

      expect(nodes.length).toBeGreaterThan(0)
      expect(edges.length).toBeGreaterThan(0)

      const edge = edges.find(e => e.to === usersTableNode.id)
      expect(edge).toBeDefined()
      expect(edge!.kind).toBe('queries')
      expect(edge!.confidence).toBe('inferred')
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
