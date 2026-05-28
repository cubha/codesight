import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Project } from 'ts-morph'
import { resolveComponentToAbsBase, type ResolveContext } from './component-resolver.js'
import { loadTsConfigPaths } from './ts-config-loader.js'

describe('resolveComponentToAbsBase', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-comp-resolver-'))
    await fs.mkdir(path.join(tmpDir, 'src', 'pages'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }),
    )
    await fs.writeFile(path.join(tmpDir, 'src', 'pages', 'home.tsx'), `export function HomePage() { return null }`)
    await fs.writeFile(path.join(tmpDir, 'src', 'pages', 'menu.tsx'), `export function MenuPage() { return null }`)
    await fs.writeFile(path.join(tmpDir, 'src', 'pages', 'about.tsx'), `export default function About() { return null }`)
    await fs.writeFile(path.join(tmpDir, 'src', 'pages', 'index.ts'), `export { HomePage as Home } from './home'`)
    await fs.writeFile(path.join(tmpDir, 'src', 'pages', 'lazy-page.tsx'), `export default function LazyPage() { return null }`)
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function ctxFor(routerSrc: string): Promise<{ ctx: ResolveContext; sf: import('ts-morph').SourceFile }> {
    const project = new Project({ compilerOptions: { target: 99, allowJs: true, jsx: 4 }, skipAddingFilesFromTsConfig: true })
    const routerPath = path.join(tmpDir, 'src', 'router.tsx')
    await fs.writeFile(routerPath, routerSrc)
    const sf = project.addSourceFileAtPath(routerPath)
    const paths = await loadTsConfigPaths(tmpDir)
    return { ctx: { project, repoRoot: tmpDir, paths }, sf }
  }

  it('direct named import + @/ alias', async () => {
    const { ctx, sf } = await ctxFor(
      `import { HomePage } from '@/pages/home'\nconst _ = HomePage`,
    )
    const r = resolveComponentToAbsBase('HomePage', sf, ctx)
    expect(r).toBeDefined()
    expect(r!.hops).toBe('direct')
    expect(r!.absBase.endsWith(path.join('src', 'pages', 'home'))).toBe(true)
  })

  it('named import + as rename + @/ alias', async () => {
    const { ctx, sf } = await ctxFor(
      `import { MenuPage as MenuManagePage } from '@/pages/menu'\nconst _ = MenuManagePage`,
    )
    const r = resolveComponentToAbsBase('MenuManagePage', sf, ctx)
    expect(r).toBeDefined()
    expect(r!.hops).toBe('direct')
    expect(r!.absBase.endsWith(path.join('src', 'pages', 'menu'))).toBe(true)
  })

  it('default import + @/ alias', async () => {
    const { ctx, sf } = await ctxFor(
      `import About from '@/pages/about'\nconst _ = About`,
    )
    const r = resolveComponentToAbsBase('About', sf, ctx)
    expect(r).toBeDefined()
    expect(r!.hops).toBe('direct')
    expect(r!.absBase.endsWith(path.join('src', 'pages', 'about'))).toBe(true)
  })

  it('barrel re-export 1-hop (export { X as Y } from)', async () => {
    const { ctx, sf } = await ctxFor(
      `import { Home } from '@/pages'\nconst _ = Home`,
    )
    const r = resolveComponentToAbsBase('Home', sf, ctx)
    expect(r).toBeDefined()
    expect(r!.hops).toBe('barrel')
    expect(r!.absBase.endsWith(path.join('src', 'pages', 'home'))).toBe(true)
  })

  it('lazy(() => import(...)) local const', async () => {
    const { ctx, sf } = await ctxFor(
      `import { lazy } from 'react'\nconst LazyPage = lazy(() => import('@/pages/lazy-page'))\nconst _ = LazyPage`,
    )
    const r = resolveComponentToAbsBase('LazyPage', sf, ctx)
    expect(r).toBeDefined()
    expect(r!.hops).toBe('lazy')
    expect(r!.absBase.endsWith(path.join('src', 'pages', 'lazy-page'))).toBe(true)
    expect(r!.inferenceChain?.[0]).toMatch(/lazy/)
  })

  it('상대경로 import도 정상 resolve', async () => {
    const { ctx, sf } = await ctxFor(
      `import { HomePage } from './pages/home'\nconst _ = HomePage`,
    )
    const r = resolveComponentToAbsBase('HomePage', sf, ctx)
    expect(r).toBeDefined()
    expect(r!.hops).toBe('direct')
    expect(r!.absBase.endsWith(path.join('src', 'pages', 'home'))).toBe(true)
  })

  it('외부 패키지(node_modules)는 undefined 반환', async () => {
    const { ctx, sf } = await ctxFor(
      `import { Foo } from 'react'\nconst _ = Foo`,
    )
    const r = resolveComponentToAbsBase('Foo', sf, ctx)
    expect(r).toBeUndefined()
  })

  it('정의 못 찾으면 undefined', async () => {
    const { ctx, sf } = await ctxFor(`const _ = 1`)
    const r = resolveComponentToAbsBase('Nonexistent', sf, ctx)
    expect(r).toBeUndefined()
  })

  it('cycle 가드 (depth ≥ 2)', async () => {
    const { ctx, sf } = await ctxFor(
      `const A = B\nconst B = A\nconst _ = A`,
    )
    const r = resolveComponentToAbsBase('A', sf, ctx)
    expect(r).toBeUndefined()
  })
})
