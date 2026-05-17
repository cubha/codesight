import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LLMAnalysisResult } from './schema.js'

const mockGenerateText = vi.fn()

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mock-anthropic-model')),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mock-google-model')),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue(vi.fn().mockReturnValue('mock-openai-model')),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('analyzWithLLM', () => {
  it('LLM 응답에서 JSON을 파싱하여 LLMAnalysisResult를 반환한다', async () => {
    const mockResult: LLMAnalysisResult = {
      framework: 'nextjs-app-router',
      routes: [{ path: '/blog', file: 'app/blog/page.tsx', mode: 'SSR', components: ['BlogList'] }],
      tables: [{ name: 'blog_posts', usedBy: ['BlogList'] }],
      inferenceNotes: ['blog route is server-rendered'],
    }

    mockGenerateText.mockResolvedValue({ text: JSON.stringify(mockResult) })

    const { analyzWithLLM } = await import('./client.js')
    const result = await analyzWithLLM(
      { apiKey: 'test-key' },
      { projectName: 'test', framework: 'nextjs-app-router', fileContents: { 'app/blog/page.tsx': 'export default function Blog() {}' } },
    )

    expect(result.framework).toBe('nextjs-app-router')
    expect(result.routes).toHaveLength(1)
    expect(result.routes[0]?.path).toBe('/blog')
    expect(result.tables[0]?.name).toBe('blog_posts')
  })

  it('JSON 마크다운 블록이 포함된 응답도 파싱한다', async () => {
    const mockResult: LLMAnalysisResult = {
      framework: 'vite-react',
      routes: [],
      tables: [],
      inferenceNotes: [],
    }

    mockGenerateText.mockResolvedValue({
      text: `Here is the analysis:\n\`\`\`json\n${JSON.stringify(mockResult)}\n\`\`\``,
    })

    const { analyzWithLLM } = await import('./client.js')
    const result = await analyzWithLLM(
      { apiKey: 'test-key' },
      { projectName: 'test', framework: 'vite-react', fileContents: {} },
    )

    expect(result.framework).toBe('vite-react')
  })

  it('JSON이 없는 응답이면 에러를 던진다', async () => {
    mockGenerateText.mockResolvedValue({ text: 'No JSON content here' })

    const { analyzWithLLM } = await import('./client.js')
    await expect(
      analyzWithLLM({ apiKey: 'test-key' }, { projectName: 'test', framework: 'unknown', fileContents: {} }),
    ).rejects.toThrow('LLM response does not contain valid JSON')
  })
})
