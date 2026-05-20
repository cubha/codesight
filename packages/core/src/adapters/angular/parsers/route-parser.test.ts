import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseAngularRoutes } from './route-parser.js'
import { AngularAdapter } from '../adapter.js'

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-angular-test-'))
  await fs.mkdir(path.join(tmpDir, 'src', 'app'), { recursive: true })
  await fs.writeFile(
    path.join(tmpDir, 'src', 'app', 'app.routes.ts'),
    `import { Routes } from '@angular/router'
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'about', component: AboutComponent },
  { path: 'users', component: UsersComponent },
  { path: 'users/:id', loadChildren: () => import('./user-detail.module').then(m => m.Module) },
]`,
  )
  await fs.writeFile(
    path.join(tmpDir, 'src', 'app', 'app.config.ts'),
    `import { provideRouter } from '@angular/router'
import { routes } from './app.routes'
export const appConfig = { providers: [provideRouter(routes)] }`,
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('parseAngularRoutes — RouterModule.forChild (B-6)', () => {
  it('RouterModule.forChild routes 추출', async () => {
    const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-ng-b6-'))
    await fs.mkdir(path.join(tmpDir2, 'src', 'app', 'users'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDir2, 'src', 'app', 'users', 'users.module.ts'),
      `import { NgModule } from '@angular/core'
import { RouterModule } from '@angular/router'
import { UsersComponent } from './users.component'
import { UserDetailComponent } from './user-detail.component'

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: UsersComponent },
      { path: ':id', component: UserDetailComponent },
    ]),
  ],
})
export class UsersModule {}`,
    )
    const { routes } = await parseAngularRoutes(tmpDir2, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/:id')
    await fs.rm(tmpDir2, { recursive: true, force: true })
  })
})

describe('parseAngularRoutes — mini-angular-app fixture', () => {
  it('mini-angular-app: forRoot + forChild 라우트 모두 추출', async () => {
    const FIXTURE = path.resolve(process.cwd(), 'fixtures/mini-angular-app')
    const { routes } = await parseAngularRoutes(FIXTURE, 'test@0.1')
    const paths = routes.map(r => r.path)
    // forRoot routes
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/users')
    expect(paths).toContain('/users/:id')
    // forChild route from user-detail.module.ts (path: '' → /)
    // The forChild { path: '' } creates an additional '/' route
    expect(routes.length).toBeGreaterThanOrEqual(4)
  })

  // v1.2.44 A1-2: filePath 컴포넌트 파일 치환
  it('A1-2: 각 라우트 filePath는 component Identifier가 가리키는 .ts 파일로 치환됨', async () => {
    const FIXTURE = path.resolve(process.cwd(), 'fixtures/mini-angular-app')
    const { routes } = await parseAngularRoutes(FIXTURE, 'test@0.1')
    const home = routes.find(r => r.path === '/' && r.filePath.endsWith('home.component.ts'))
    const about = routes.find(r => r.path === '/about')
    const users = routes.find(r => r.path === '/users')
    expect(home).toBeDefined()
    expect(about?.filePath).toMatch(/about\.component\.ts$/)
    expect(users?.filePath).toMatch(/users\.component\.ts$/)
    // 라우터 정의 파일과 달라야 함
    expect(about?.filePath).not.toMatch(/app\.routes\.ts$/)
  })

  it('A1-2: loadChildren 라우트는 라우터 정의 파일 fallback (loadChildren은 자체 모듈)', async () => {
    const FIXTURE = path.resolve(process.cwd(), 'fixtures/mini-angular-app')
    const { routes } = await parseAngularRoutes(FIXTURE, 'test@0.1')
    const detail = routes.find(r => r.path === '/users/:id')
    // loadChildren은 component spec이 없으므로 라우터 정의 파일 유지
    expect(detail?.filePath).toMatch(/app\.routes\.ts$/)
  })
})

describe('parseAngularRoutes — nested children path prefix (III-A-2)', () => {
  let nestedDir: string

  beforeAll(async () => {
    nestedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-ng-nested-'))
    await fs.mkdir(path.join(nestedDir, 'src', 'app'), { recursive: true })
    await fs.writeFile(
      path.join(nestedDir, 'src', 'app', 'app.routes.ts'),
      `import { Routes } from '@angular/router'
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', children: [
    { path: '', component: AdminDashboardComponent },
    { path: 'users', component: UsersListComponent },
    { path: 'settings', component: SettingsComponent },
  ]},
]`,
    )
    await fs.writeFile(
      path.join(nestedDir, 'src', 'app', 'app.config.ts'),
      `import { provideRouter } from '@angular/router'
import { routes } from './app.routes'
export const appConfig = { providers: [provideRouter(routes)] }`,
    )
  })

  afterAll(async () => {
    await fs.rm(nestedDir, { recursive: true, force: true })
  })

  it('children 경로에 부모 prefix 누적 (III-A-2)', async () => {
    const { routes } = await parseAngularRoutes(nestedDir, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/admin')
    expect(paths).toContain('/admin/users')
    expect(paths).toContain('/admin/settings')
  })
})

describe('parseAngularRoutes — loadChildren lazy routes (III-A-2)', () => {
  let lazyDir: string

  beforeAll(async () => {
    lazyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-ng-lazy-'))
    await fs.mkdir(path.join(lazyDir, 'src', 'app', 'admin'), { recursive: true })
    await fs.writeFile(
      path.join(lazyDir, 'src', 'app', 'admin', 'admin.routes.ts'),
      `import { Routes } from '@angular/router'
export const adminRoutes: Routes = [
  { path: 'dashboard', component: AdminDashboardComponent },
  { path: 'users', component: UsersListComponent },
]`,
    )
    await fs.writeFile(
      path.join(lazyDir, 'src', 'app', 'app.routes.ts'),
      `import { Routes } from '@angular/router'
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'admin', loadChildren: () => import('./admin/admin.routes').then(m => m.adminRoutes) },
]`,
    )
    await fs.writeFile(
      path.join(lazyDir, 'src', 'app', 'app.config.ts'),
      `import { provideRouter } from '@angular/router'
import { routes } from './app.routes'
export const appConfig = { providers: [provideRouter(routes)] }`,
    )
  })

  afterAll(async () => {
    await fs.rm(lazyDir, { recursive: true, force: true })
  })

  it('loadChildren 대상 routes 파일의 경로를 해소한다 (III-A-2)', async () => {
    const { routes } = await parseAngularRoutes(lazyDir, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/admin')
    expect(paths).toContain('/admin/dashboard')
    expect(paths).toContain('/admin/users')
  })
})

describe('parseAngularRoutes', () => {
  it('provideRouter(routes) 배열에서 path를 추출한다', async () => {
    const { routes } = await parseAngularRoutes(tmpDir, 'test@0.1')
    expect(routes.length).toBeGreaterThanOrEqual(3)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/users')
  })

  it(':id 라우트를 dynamic으로 감지', async () => {
    const { routes } = await parseAngularRoutes(tmpDir, 'test@0.1')
    const dynamic = routes.find(r => r.path === '/users/:id')
    expect(dynamic).toBeDefined()
    expect(dynamic?.dynamicSegmentType).toBe('dynamic')
  })

  it('routeFileKind는 page', async () => {
    const { routes } = await parseAngularRoutes(tmpDir, 'test@0.1')
    for (const r of routes) expect(r.routeFileKind).toBe('page')
  })
})

describe('parseAngularRoutes — loadComponent standalone 라우팅 (N-20)', () => {
  it('loadComponent lazy 라우트를 RouteNode로 파싱한다 (N-20)', async () => {
    const tmpDirN20 = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-ng-n20-'))
    await fs.mkdir(path.join(tmpDirN20, 'src', 'app'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDirN20, 'src', 'app', 'app.routes.ts'),
      `import { Routes } from '@angular/router'
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'profile', loadComponent: () => import('./profile.component').then(m => m.ProfileComponent) },
  { path: 'settings', loadComponent: () => import('./settings.component').then(m => m.SettingsComponent) },
]`,
    )
    await fs.writeFile(
      path.join(tmpDirN20, 'src', 'app', 'app.config.ts'),
      `import { provideRouter } from '@angular/router'
import { routes } from './app.routes'
export const appConfig = { providers: [provideRouter(routes)] }`,
    )
    const { routes } = await parseAngularRoutes(tmpDirN20, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/profile')
    expect(paths).toContain('/settings')
    await fs.rm(tmpDirN20, { recursive: true, force: true })
  })
})

describe('AngularAdapter — loadComponent renders 엣지 (N-20b)', () => {
  it('loadComponent 라우트와 컴포넌트 간 renders 엣지 생성', async () => {
    const tmpDirN20b = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-ng-n20b-'))
    await fs.mkdir(path.join(tmpDirN20b, 'src', 'app'), { recursive: true })
    await fs.writeFile(
      path.join(tmpDirN20b, 'src', 'app', 'profile.component.ts'),
      `import { Component } from '@angular/core'
@Component({ selector: 'app-profile', template: '' })
export class ProfileComponent {}`,
    )
    await fs.writeFile(
      path.join(tmpDirN20b, 'src', 'app', 'app.routes.ts'),
      `import { Routes } from '@angular/router'
export const routes: Routes = [
  { path: 'profile', loadComponent: () => import('./profile.component').then(m => m.ProfileComponent) },
]`,
    )
    await fs.writeFile(
      path.join(tmpDirN20b, 'src', 'app', 'app.config.ts'),
      `import { provideRouter } from '@angular/router'
import { routes } from './app.routes'
export const appConfig = { providers: [provideRouter(routes)] }`,
    )
    const adapter = new AngularAdapter()
    const result = await adapter.analyze({
      repoRoot: tmpDirN20b,
      analyzerVersion: '0.0.0-test',
      stack: {
        framework: 'angular', adapterId: 'angular', parsingLevel: 'L2',
        hasSupabase: false, hasPrisma: false, hasDexie: false, hasDrizzle: false,
        hasTypeOrm: false, hasSQLAlchemy: false, hasDjangoORM: false,
        hasSpringDataJpa: false, isMonorepo: false, appDirs: [], llmRecommended: false,
      },
    })
    const profileRoute = result.routeNodes.find(r => r.path === '/profile')
    expect(profileRoute).toBeDefined()
    const rendersEdges = result.componentEdges.filter(e => e.kind === 'renders')
    expect(rendersEdges.length).toBeGreaterThan(0)
    const profileRendersEdge = rendersEdges.find(e => e.from === profileRoute?.id)
    expect(profileRendersEdge).toBeDefined()
    await fs.rm(tmpDirN20b, { recursive: true, force: true })
  })
})

describe('AngularAdapter — hasSupabase (Tab3)', () => {
  it('hasSupabase=true면 tableNodes 배열 반환', async () => {
    const adapter = new AngularAdapter()
    const result = await adapter.analyze({
      repoRoot: tmpDir,
      analyzerVersion: '0.0.0-test',
      stack: {
        framework: 'angular',
        adapterId: 'angular',
        parsingLevel: 'L2',
        hasSupabase: true,
        hasPrisma: false,
        hasDexie: false,
        hasDrizzle: false,
        hasTypeOrm: false,
        hasSQLAlchemy: false,
        hasDjangoORM: false,
        hasSpringDataJpa: false,
        isMonorepo: false,
        appDirs: [],
        llmRecommended: false,
      },
    })
    expect(Array.isArray(result.tableNodes)).toBe(true)
  })
})
