import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadTsConfigPaths, resolveModuleSpecWithPaths } from './ts-config-loader.js'

describe('loadTsConfigPaths', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-tsconfig-'))
    await fs.writeFile(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@/*': ['./src/*'],
            '~components/*': ['./src/components/*'],
          },
        },
      }),
    )
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('compilerOptions.paths를 (aliasPrefix → absDir) Map으로 반환', async () => {
    const paths = await loadTsConfigPaths(tmpDir)
    expect(paths.get('@')).toBe(path.resolve(tmpDir, './src'))
    expect(paths.get('~components')).toBe(path.resolve(tmpDir, './src/components'))
  })

  it('tsconfig.json이 없으면 빈 Map 반환', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-tsconfig-empty-'))
    try {
      const paths = await loadTsConfigPaths(empty)
      expect(paths.size).toBe(0)
    } finally {
      await fs.rm(empty, { recursive: true, force: true })
    }
  })
})

describe('resolveModuleSpecWithPaths', () => {
  const paths = new Map([
    ['@', '/repo/src'],
    ['~components', '/repo/src/components'],
  ])
  const fromDir = '/repo/src/router'

  it('relative path (./foo)는 fromFileDir 기준으로 resolve', () => {
    expect(resolveModuleSpecWithPaths('./appRoutes', fromDir, paths)).toBe('/repo/src/router/appRoutes')
  })

  it('parent relative (../pages/Home)도 정상 resolve', () => {
    expect(resolveModuleSpecWithPaths('../pages/Home', fromDir, paths)).toBe('/repo/src/pages/Home')
  })

  it('@/ alias를 PathsMap으로 resolve', () => {
    expect(resolveModuleSpecWithPaths('@/pages/home-page', fromDir, paths)).toBe('/repo/src/pages/home-page')
  })

  it('다중 alias 중 매칭되는 것을 선택', () => {
    expect(resolveModuleSpecWithPaths('~components/Button', fromDir, paths)).toBe('/repo/src/components/Button')
  })

  it('alias prefix 자체와 동일한 spec (예: @만 단독)도 처리', () => {
    expect(resolveModuleSpecWithPaths('@', fromDir, paths)).toBe('/repo/src')
  })

  it('외부 모듈명(react, lodash 등)은 undefined', () => {
    expect(resolveModuleSpecWithPaths('react', fromDir, paths)).toBeUndefined()
    expect(resolveModuleSpecWithPaths('react-router-dom', fromDir, paths)).toBeUndefined()
  })

  it('빈 paths Map일 때 relative만 처리, alias는 undefined', () => {
    const empty = new Map()
    expect(resolveModuleSpecWithPaths('./foo', fromDir, empty)).toBe('/repo/src/router/foo')
    expect(resolveModuleSpecWithPaths('@/foo', fromDir, empty)).toBeUndefined()
  })
})
