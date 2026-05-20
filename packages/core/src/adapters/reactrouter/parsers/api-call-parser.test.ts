import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseApiCalls } from './api-call-parser.js'
import { parseReactRouterFull } from './route-parser.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../../../../fixtures/mini-react-partner-mock-app')

describe('parseApiCalls (mini-react-partner-mock-app)', () => {
  it('axios.get / axios.post / axios.put / axios.delete / fetch / useQuery·useMutation 콜백 안 axios 호출을 모두 api-call edge로 emit한다', async () => {
    const { componentNodes } = await parseReactRouterFull(FIXTURE, '0.1.0')
    const edges = await parseApiCalls(FIXTURE, componentNodes, '0.1.0')

    expect(edges.length).toBeGreaterThanOrEqual(8)

    const methodCount = new Map<string, number>()
    for (const e of edges) {
      const m = e.apiCall?.method ?? 'UNKNOWN'
      methodCount.set(m, (methodCount.get(m) ?? 0) + 1)
    }
    expect(methodCount.get('GET') ?? 0).toBeGreaterThanOrEqual(3)
    expect(methodCount.get('POST') ?? 0).toBeGreaterThanOrEqual(3)
    expect(methodCount.get('PUT') ?? 0).toBeGreaterThanOrEqual(1)
    expect(methodCount.get('DELETE') ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('template literal 인터폴레이션(`/api/agency/contractMgmt/${id}`)은 confidence=inferred로 분류된다', async () => {
    const { componentNodes } = await parseReactRouterFull(FIXTURE, '0.1.0')
    const edges = await parseApiCalls(FIXTURE, componentNodes, '0.1.0')

    const inferredDelete = edges.find(
      e => e.apiCall?.method === 'DELETE' && e.confidence === 'inferred',
    )
    expect(inferredDelete).toBeDefined()
    expect(inferredDelete?.apiCall?.path).toContain('${')
    if (inferredDelete?.confidence === 'inferred') {
      expect(inferredDelete.inferenceChain.length).toBeGreaterThan(0)
    }
  })

  it('모든 edge는 kind=api-call + provenance.file/line 보유', async () => {
    const { componentNodes } = await parseReactRouterFull(FIXTURE, '0.1.0')
    const edges = await parseApiCalls(FIXTURE, componentNodes, '0.1.0')
    for (const e of edges) {
      expect(e.kind).toBe('api-call')
      expect(e.apiCall).toBeDefined()
      expect(e.provenance.file.length).toBeGreaterThan(0)
      expect(e.provenance.line).toBeGreaterThan(0)
    }
  })
})
