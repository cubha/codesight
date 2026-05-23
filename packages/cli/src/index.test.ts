import { describe, it, expect, afterEach, vi } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { analyze } from './index.js'
import type { LLMAnalysisResult } from '@codebase-viz/llm'

// vi.mock is hoisted — factory cannot reference variables declared below
vi.mock('@codebase-viz/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codebase-viz/llm')>()
  return { ...actual, analyzWithLLM: vi.fn() }
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.resolve(__dirname, '../../../fixtures/mini-next-app')
const REACT_FIXTURE = path.resolve(__dirname, '../../../fixtures/mini-react-partner-mock-app')
const OUTPUT_DIR = path.join(__dirname, '../../../.tmp-cli-test')

afterEach(async () => {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('analyze CLI', () => {
  it('fixtures/mini-next-app 분석 시 3개 .md 파일을 생성한다', async () => {
    await analyze(FIXTURE, OUTPUT_DIR)

    const files = await fs.readdir(OUTPUT_DIR)
    expect(files).toContain('rendering.md')
    expect(files).toContain('screen-component.md')
    expect(files).toContain('db-screen.md')
  })

  it('rendering.md에 라우트 정보가 포함된다', async () => {
    await analyze(FIXTURE, OUTPUT_DIR)

    const content = await fs.readFile(path.join(OUTPUT_DIR, 'rendering.md'), 'utf8')
    expect(content).toContain('```mermaid')
    // v1.2.45: FE Tab1은 graph LR (표준 1 형제 X축 배치, mermaid v11 nested LR 트리거).
    expect(content).toContain('graph LR')
  })

  it('db-screen.md에 posts 테이블이 포함된다', async () => {
    await analyze(FIXTURE, OUTPUT_DIR)

    const content = await fs.readFile(path.join(OUTPUT_DIR, 'db-screen.md'), 'utf8')
    expect(content).toContain('posts')
  })

  it('--with-llm 모드: mock LLM 결과를 정적 분석에 머지하여 3개 .md를 생성한다', async () => {
    const { analyzWithLLM } = await import('@codebase-viz/llm')
    const mockResult: LLMAnalysisResult = {
      framework: 'nextjs-app-router',
      routes: [{ path: '/llm-only-page', file: 'app/page.tsx', mode: 'SSR', components: [] }],
      tables: [],
      inferenceNotes: [],
    }
    vi.mocked(analyzWithLLM).mockResolvedValue(mockResult)

    await analyze(FIXTURE, OUTPUT_DIR, { apiKey: 'mock-key' })

    const files = await fs.readdir(OUTPUT_DIR)
    expect(files).toContain('rendering.md')
    expect(files).toContain('screen-component.md')
    expect(files).toContain('db-screen.md')
    expect(vi.mocked(analyzWithLLM)).toHaveBeenCalledOnce()
  })

  // v1.2.43 ST3: LLM enabled에서 backends 우선순위 + 정적 파서 결과(api-call edges) 보존 검증.
  // mini-react-partner-mock-app은 v1.2.42에서 api-call edges가 정적으로 추출되므로
  // LLM이 backends를 추가해도 React Tab1 산출물은 BACKEND_0 분기 사용 + External API Gateway 미발동.
  it('--with-llm 모드 + LLM backends 반환: React Tab1이 LLM backends 분기를 우선 사용한다 (정적 api-call edges는 보존하되 API Gateway 분기 미발동)', async () => {
    const { analyzWithLLM } = await import('@codebase-viz/llm')
    const mockResult: LLMAnalysisResult = {
      framework: 'react-router',
      routes: [],
      tables: [],
      backendServices: [
        { name: 'Partner API', framework: 'express', modules: ['UserModule', 'OrderModule'], dbType: 'postgresql' },
      ],
      inferenceNotes: [],
    }
    vi.mocked(analyzWithLLM).mockResolvedValue(mockResult)

    await analyze(REACT_FIXTURE, OUTPUT_DIR, { apiKey: 'mock-key' })

    const tab1 = await fs.readFile(path.join(OUTPUT_DIR, 'rendering.md'), 'utf8')
    // LLM backends 분기 = BACKEND_0 노드 + Partner API · express 라벨
    expect(tab1).toContain('BACKEND_0')
    expect(tab1).toContain('Partner API · express')
    // v1.2.43 ST1 신규 외부 API Gateway 분기는 발동 안 함 (backends 우선)
    expect(tab1).not.toContain('External REST API')
  })

  it('--with-llm 모드 + backends 없음: 정적 api-call edges가 보존되어 React Tab1 External API Gateway 분기 발동', async () => {
    const { analyzWithLLM } = await import('@codebase-viz/llm')
    const mockResult: LLMAnalysisResult = {
      framework: 'react-router',
      routes: [],
      tables: [],
      inferenceNotes: [],
      // backendServices 없음 → ST1 신규 fallback 분기 발동 조건
    }
    vi.mocked(analyzWithLLM).mockResolvedValue(mockResult)

    await analyze(REACT_FIXTURE, OUTPUT_DIR, { apiKey: 'mock-key' })

    const tab1 = await fs.readFile(path.join(OUTPUT_DIR, 'rendering.md'), 'utf8')
    // 정적 파서가 추출한 axios/fetch api-call edges가 LLM 머지 후에도 보존 → External REST API Gateway 노드 표시
    expect(tab1).toContain('External REST API')
    expect(tab1).toContain('API_GATEWAY')
    // LLM backends가 없으니 LLM backends 분기는 미발동
    expect(tab1).not.toContain('BACKEND_0')
  })
})
