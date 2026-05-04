import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseReactRoutes } from './route-parser.js'

const FIXTURE = path.resolve(process.cwd(), 'fixtures/mini-react-router-app')

describe('parseReactRoutes — mini-react-router-app fixture', () => {
  it('createBrowserRouter routes 배열에서 path를 추출한다', async () => {
    const routes = await parseReactRoutes(FIXTURE, 'test@0.1')
    expect(routes.length).toBeGreaterThanOrEqual(4)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/users')
  })

  it('nested children route를 부모 prefix와 합성한다', async () => {
    const routes = await parseReactRoutes(FIXTURE, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/users/:id')
  })

  it(':id 포함 라우트를 dynamic으로 감지', async () => {
    const routes = await parseReactRoutes(FIXTURE, 'test@0.1')
    const dynamic = routes.find(r => r.path === '/users/:id')
    expect(dynamic?.dynamicSegmentType).toBe('dynamic')
  })

  it('renderingMode는 CSR', async () => {
    const routes = await parseReactRoutes(FIXTURE, 'test@0.1')
    for (const r of routes) expect(r.renderingMode).toBe('CSR')
  })

  it('routeFileKind는 page', async () => {
    const routes = await parseReactRoutes(FIXTURE, 'test@0.1')
    for (const r of routes) expect(r.routeFileKind).toBe('page')
  })
})
