import { describe, it, expect } from 'vitest'
import { extractFeCallsFromText } from './fe-call-extractor.js'

describe('extractFeCallsFromText', () => {
  it('fetch string literal — GET 기본', () => {
    const src = `fetch('/api/users')`
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('/api/users')
    expect(calls[0]?.confidence).toBe('verified')
  })

  it('fetch with method POST option', () => {
    const src = `fetch('/api/users', { method: 'POST', body: JSON.stringify(data) })`
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('/api/users')
  })

  it('axios.get — GET 추출', () => {
    const src = `axios.get('/api/users')`
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('/api/users')
    expect(calls[0]?.confidence).toBe('verified')
  })

  it('axios.post — POST 추출', () => {
    const src = `axios.post('/api/users', { name: 'Alice' })`
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe('/api/users')
  })

  it('동일파일 const 상수 template literal 추적', () => {
    const src = `
      const API_BASE = '/api'
      fetch(\`\${API_BASE}/users\`)
    `
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/users')
    expect(calls[0]?.confidence).toBe('inferred')
    expect(calls[0]?.inferenceChain).toContain('template-literal: API_BASE=/api')
  })

  it('dynamic ${id} — inferred + ${…} placeholder', () => {
    const src = `fetch(\`/api/users/\${id}\`)`
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/users/${…}')
    expect(calls[0]?.confidence).toBe('inferred')
  })

  it('arrow function 내부 axios.delete 추출', () => {
    const src = `
      const deleteUser = (id: number) => axios.delete(\`/api/users/\${id}\`)
    `
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.confidence).toBe('inferred')
  })

  it('fetch().then() 체인 — URL 추출', () => {
    const src = `
      fetch('/api/data').then(r => r.json()).then(data => console.log(data))
    `
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/data')
  })

  it('useSWR hook — GET 추출', () => {
    const src = `useSWR('/api/users', fetcher)`
    const calls = extractFeCallsFromText(src, '/virtual/test.tsx')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('/api/users')
  })

  it('빈 파일 — 빈 배열 반환', () => {
    const calls = extractFeCallsFromText('', '/virtual/empty.tsx')
    expect(calls).toHaveLength(0)
  })

  it('여러 호출이 혼재 — 모두 추출', () => {
    const src = `
      const BASE = '/api'
      axios.get('/api/products')
      fetch(\`\${BASE}/orders\`, { method: 'POST' })
      useSWR('/api/status', fetcher)
    `
    const calls = extractFeCallsFromText(src, '/virtual/multi.tsx')
    expect(calls).toHaveLength(3)
    const methods = calls.map(c => c.method)
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
  })
})
