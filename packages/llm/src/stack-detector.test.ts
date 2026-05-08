import { describe, it, expect, afterEach } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'
import { detectStack } from './stack-detector.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.resolve(__dirname, '../../../fixtures')

describe('detectStack', () => {
  it('Next.js App Router 프로젝트를 nextjs-app-router로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-next-app'))
    expect(info.framework).toBe('nextjs-app-router')
  })

  it('Supabase 의존성을 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-next-app'))
    expect(info.hasSupabase).toBe(true)
  })

  it('존재하지 않는 디렉토리는 unknown으로 반환한다', async () => {
    const info = await detectStack('/tmp/non-existent-project-xyz')
    expect(info.framework).toBe('unknown')
  })

  it('vite-react 프로젝트를 감지한다', async () => {
    const info = await detectStack('/mnt/d/workspace/dev-note')
    expect(info.framework).toBe('vite-react')
    expect(info.hasDexie).toBe(true)
  })

  it('Turbo 모노레포(fa-support)에서 최상위 프레임워크를 감지한다', async () => {
    const info = await detectStack('/mnt/d/workspace/fa-support')
    expect(info.isMonorepo).toBe(true)
    expect(info.framework).toBe('nextjs-app-router')
    expect(info.appDirs.length).toBeGreaterThan(1)
  })

  it('Next.js App Router는 adapterId/L3/llmRecommended=false 매핑된다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-next-app'))
    expect(info.adapterId).toBe('nextjs-app-router')
    expect(info.parsingLevel).toBe('L3')
    expect(info.llmRecommended).toBe(false)
  })

  it('unknown 스택은 adapterId 없음/L3/llmRecommended=true', async () => {
    const info = await detectStack('/tmp/non-existent-project-xyz')
    expect(info.adapterId).toBeUndefined()
    expect(info.parsingLevel).toBe('L3')
    expect(info.llmRecommended).toBe(true)
  })

  it('vite-react는 adapterId=undefined/L3/llmRecommended=true', async () => {
    const info = await detectStack('/mnt/d/workspace/dev-note')
    expect(info.adapterId).toBeUndefined()
    expect(info.parsingLevel).toBe('L3')
    expect(info.llmRecommended).toBe(true)
  })

  it('Flask 프로젝트를 flask로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-flask-app'))
    expect(info.framework).toBe('flask')
    expect(info.adapterId).toBe('flask')
  })

  it('Next.js Pages Router를 nextjs-pages로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-nextpages-app'))
    expect(info.framework).toBe('nextjs-pages')
    expect(info.adapterId).toBe('nextjs-pages')
  })

  it('Vue SPA 프로젝트를 vue-spa로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-vue-spa-app'))
    expect(info.framework).toBe('vue-spa')
    expect(info.adapterId).toBe('vue-spa')
  })

  it('Remix 프로젝트를 remix로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-remix-app'))
    expect(info.framework).toBe('remix')
    expect(info.adapterId).toBe('remix')
  })

  it('Angular 프로젝트를 angular로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-angular-app'))
    expect(info.framework).toBe('angular')
    expect(info.adapterId).toBe('angular')
  })

  it('React Router 프로젝트를 react-router로 감지한다', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-react-router-app'))
    expect(info.framework).toBe('react-router')
    expect(info.adapterId).toBe('react-router')
  })
})

describe('detectStack — 모노레포 / 멀티서비스 구조 감지', () => {
  const tmpDirs: string[] = []

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-viz-monorepo-test-'))
    tmpDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  it('루트 package.json에 프레임워크 없는 Turbo 모노레포 → apps/ 스캔 후 최상위 프레임워크 감지', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { turbo: '^2.0.0' } }))
    // apps/web: Next.js App Router
    await fs.mkdir(path.join(dir, 'apps', 'web'), { recursive: true })
    await fs.mkdir(path.join(dir, 'apps', 'web', 'app'), { recursive: true })
    await fs.writeFile(path.join(dir, 'apps', 'web', 'package.json'), JSON.stringify({ dependencies: { next: '^15.0.0', react: '^18.0.0' } }))
    // apps/api: NestJS
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true })
    await fs.writeFile(path.join(dir, 'apps', 'api', 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }))
    const info = await detectStack(dir)
    expect(info.framework).toBe('nextjs-app-router') // L3+adapter beats nestjs L2+adapter
    expect(info.isMonorepo).toBe(true)
    expect(info.appDirs.length).toBe(2)
  })

  it('루트 package.json 없는 멀티서비스 프로젝트 → backend/ 스캔 후 NestJS 감지', async () => {
    const dir = await makeTmpDir()
    // No root package.json
    await fs.mkdir(path.join(dir, 'backend'), { recursive: true })
    await fs.writeFile(
      path.join(dir, 'backend', 'package.json'),
      JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0', '@nestjs/common': '^10.0.0' } }),
    )
    const info = await detectStack(dir)
    expect(info.framework).toBe('nestjs')
    expect(info.adapterId).toBe('nestjs')
  })

  it('루트 package.json 없는 멀티서비스 → Python 서비스(FastAPI) 감지', async () => {
    const dir = await makeTmpDir()
    await fs.mkdir(path.join(dir, 'api'), { recursive: true })
    await fs.writeFile(path.join(dir, 'api', 'requirements.txt'), 'fastapi>=0.100\nuvicorn>=0.20\n')
    const info = await detectStack(dir)
    expect(info.framework).toBe('fastapi')
  })

  it('Flutter 프로젝트를 flutter로 감지한다 (pubspec.yaml 기반)', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'pubspec.yaml'),
      'name: my_app\nenvironment:\n  sdk: flutter\n',
    )
    const info = await detectStack(dir)
    expect(info.framework).toBe('flutter')
    expect(info.llmRecommended).toBe(true)
  })

  it('services/ 하위 모노레포를 감지한다', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ devDependencies: { turbo: '^2.0.0' } }))
    await fs.mkdir(path.join(dir, 'services', 'auth'), { recursive: true })
    await fs.writeFile(path.join(dir, 'services', 'auth', 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }))
    await fs.mkdir(path.join(dir, 'services', 'gateway'), { recursive: true })
    await fs.writeFile(path.join(dir, 'services', 'gateway', 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }))
    const info = await detectStack(dir)
    expect(info.framework).toBe('nestjs')
    expect(info.isMonorepo).toBe(true)
  })
})

describe('detectStack — ORM 플래그 감지', () => {
  const tmpDirs: string[] = []

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-viz-orm-test-'))
    tmpDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  it('drizzle-orm → hasDrizzle: true', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { 'drizzle-orm': '^0.29.0', 'vite': '^5.0.0', 'react': '^18.0.0' },
      }),
    )
    const info = await detectStack(dir)
    expect(info.hasDrizzle).toBe(true)
    expect(info.hasTypeOrm).toBe(false)
  })

  it('typeorm → hasTypeOrm: true', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: { 'typeorm': '^0.3.0', 'vite': '^5.0.0', 'react': '^18.0.0' },
      }),
    )
    const info = await detectStack(dir)
    expect(info.hasTypeOrm).toBe(true)
    expect(info.hasDrizzle).toBe(false)
  })

  it('requirements.txt에 sqlalchemy → hasSQLAlchemy: true', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'SQLAlchemy>=2.0\nfastapi>=0.100\n')
    const info = await detectStack(dir)
    expect(info.hasSQLAlchemy).toBe(true)
    expect(info.framework).toBe('fastapi')
  })

  it('pyproject.toml에 sqlalchemy → hasSQLAlchemy: true', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'pyproject.toml'),
      '[tool.poetry.dependencies]\nsqlalchemy = "^2.0"\nflask = "^3.0"\n',
    )
    const info = await detectStack(dir)
    expect(info.hasSQLAlchemy).toBe(true)
  })

  it('django 프레임워크 → hasDjangoORM: true', async () => {
    const info = await detectStack(path.join(FIXTURES, 'mini-django-app'))
    expect(info.framework).toBe('django')
    expect(info.hasDjangoORM).toBe(true)
  })

  it('build.gradle에 spring-boot-starter-data-jpa → hasSpringDataJpa: true', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'build.gradle'),
      "dependencies {\n  implementation 'org.springframework.boot:spring-boot-starter-data-jpa:3.2.0'\n}\n",
    )
    const info = await detectStack(dir)
    expect(info.hasSpringDataJpa).toBe(true)
    expect(info.framework).toBe('springboot')
  })

  it('pom.xml에 spring-data-jpa → hasSpringDataJpa: true', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'pom.xml'),
      '<project><dependencies><dependency><artifactId>spring-data-jpa</artifactId></dependency></dependencies></project>',
    )
    const info = await detectStack(dir)
    expect(info.hasSpringDataJpa).toBe(true)
  })

  it('vite + react + react-router-dom 조합은 react-router로 감지된다', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {
          'vite': '^5.0.11',
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
          'react-router-dom': '^6.10.0',
        },
      }),
    )
    const info = await detectStack(dir)
    expect(info.framework).toBe('react-router')
    expect(info.adapterId).toBe('react-router')
    expect(info.llmRecommended).toBe(false)
  })

  it('vite + react (react-router-dom 없음)는 vite-react로 감지된다', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {
          'vite': '^5.0.11',
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
      }),
    )
    const info = await detectStack(dir)
    expect(info.framework).toBe('vite-react')
  })

  it('ORM 의존성 없으면 모두 false', async () => {
    const dir = await makeTmpDir()
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { 'next': '^15.0.0', 'react': '^18.0.0' } }),
    )
    await fs.mkdir(path.join(dir, 'app'), { recursive: true })
    const info = await detectStack(dir)
    expect(info.hasDrizzle).toBe(false)
    expect(info.hasTypeOrm).toBe(false)
    expect(info.hasSQLAlchemy).toBe(false)
    expect(info.hasDjangoORM).toBe(false)
    expect(info.hasSpringDataJpa).toBe(false)
  })
})
