import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseDjangoComponents } from './component-parser.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-viz-django-comp-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function writeFile(relPath: string, content: string): Promise<void> {
  const absPath = path.join(tmpDir, relPath)
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf-8')
}

describe('parseDjangoComponents', () => {
  it('views 파일 없으면 빈 배열 반환', async () => {
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toEqual([])
  })

  it('View 서브클래스 추출', async () => {
    await writeFile('api/views.py', `
from django.views import View

class UserView(View):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('UserView')
    expect(nodes[0]?.runtime).toBe('server')
    expect(nodes[0]?.confidence).toBe('inferred')
  })

  it('ModelViewSet 서브클래스 추출', async () => {
    await writeFile('api/views.py', `
from rest_framework.viewsets import ModelViewSet

class UserViewSet(ModelViewSet):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('UserViewSet')
  })

  it('복수 View 클래스 모두 추출', async () => {
    await writeFile('api/views.py', `
class UserListView(ListView):
    pass

class UserDetailView(DetailView):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(2)
    const names = nodes.map(n => n.name)
    expect(names).toContain('UserListView')
    expect(names).toContain('UserDetailView')
  })

  it('View 서브클래스 아닌 일반 클래스는 추출 안 됨', async () => {
    await writeFile('api/views.py', `
class Helper:
    pass

class Config:
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toEqual([])
  })

  it('FBV: request 첫 인자 함수 추출', async () => {
    await writeFile('api/views.py', `
def user_list(request):
    return []
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('user_list')
    expect(nodes[0]?.runtime).toBe('server')
  })

  it('FBV: URL 파라미터 있는 함수도 추출', async () => {
    await writeFile('api/views.py', `
def user_detail(request, pk):
    return {}

def post_detail(request, slug):
    return {}
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(2)
    const names = nodes.map(n => n.name)
    expect(names).toContain('user_detail')
    expect(names).toContain('post_detail')
  })

  it('FBV + CBV 혼합 파일에서 모두 추출', async () => {
    await writeFile('api/views.py', `
from django.views import View

class UserListView(View):
    pass

def simple_view(request):
    return {}
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(2)
    const names = nodes.map(n => n.name)
    expect(names).toContain('UserListView')
    expect(names).toContain('simple_view')
  })

  it('request 첫 인자 아닌 일반 함수는 추출 안 됨', async () => {
    await writeFile('api/views.py', `
def helper(data):
    return data

def util(x, y):
    return x + y
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toEqual([])
  })

  it('NodeId가 결정론적으로 생성됨', async () => {
    await writeFile('api/views.py', `
class UserView(View):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes[0]?.id).toBe('component:api/views.py:UserView')
  })

  it('파일명에 views 포함된 파일도 스캔', async () => {
    await writeFile('api/user_views.py', `
class ProfileView(View):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('ProfileView')
  })

  it('overview.py 같은 이름은 view 파일로 인식하지 않는다 (N-18)', async () => {
    await writeFile('src/overview.py', `
class SomeClass:
    pass
`)
    await writeFile('api/views.py', `
class UserView(View):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('UserView')
  })

  it('views/ 디렉토리 내 파일은 view 파일로 인식한다 (N-18)', async () => {
    await writeFile('myapp/views/users.py', `
class UserView(View):
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.name).toBe('UserView')
  })

  it('reviews/ 디렉토리 내 models.py는 view 파일로 인식하지 않는다 (N-18)', async () => {
    await writeFile('reviews/models.py', `
class ReviewModel:
    pass
`)
    const nodes = await parseDjangoComponents(tmpDir, 'test')
    expect(nodes).toEqual([])
  })
})
