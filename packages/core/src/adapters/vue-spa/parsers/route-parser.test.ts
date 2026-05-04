import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseVueRoutes } from './route-parser.js'

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-vue-test-'))
  await fs.mkdir(path.join(tmpDir, 'src', 'router'), { recursive: true })
  await fs.writeFile(
    path.join(tmpDir, 'src', 'router', 'index.ts'),
    `import { createRouter, createWebHistory } from 'vue-router'
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('../Home.vue') },
    { path: '/about', component: () => import('../About.vue') },
    { path: '/users/:id', component: () => import('../UserDetail.vue') },
  ],
})
export default router`,
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('parseVueRoutes', () => {
  it('createRouter routes 배열에서 path를 추출한다', async () => {
    const routes = await parseVueRoutes(tmpDir, 'test@0.1')
    expect(routes.length).toBeGreaterThanOrEqual(3)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/users/:id')
  })

  it(':id 포함 라우트를 dynamic으로 감지', async () => {
    const routes = await parseVueRoutes(tmpDir, 'test@0.1')
    const dynamic = routes.find(r => r.path === '/users/:id')
    expect(dynamic?.dynamicSegmentType).toBe('dynamic')
  })

  it('routeFileKind는 page', async () => {
    const routes = await parseVueRoutes(tmpDir, 'test@0.1')
    for (const r of routes) expect(r.routeFileKind).toBe('page')
  })
})

describe('parseVueRoutes — nested children (B-1)', () => {
  it('nested children 라우트를 부모 prefix와 결합한다', async () => {
    const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-vue-nested-'))
    await fs.mkdir(path.join(tmpDir2, 'src', 'router'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir2, 'src', 'router', 'index.ts'),
      `import { createRouter, createWebHistory } from 'vue-router'
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/users',
      component: () => import('../Users.vue'),
      children: [
        { path: ':id', component: () => import('../UserDetail.vue') },
        { path: 'new', component: () => import('../UserNew.vue') },
      ],
    },
  ],
})
export default router`,
    )
    const routes = await parseVueRoutes(tmpDir2, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/users')
    expect(paths).toContain('/users/:id')
    expect(paths).toContain('/users/new')
    expect(paths).not.toContain(':id')
    expect(paths).not.toContain('new')
    await fs.rm(tmpDir2, { recursive: true, force: true })
  })
})
