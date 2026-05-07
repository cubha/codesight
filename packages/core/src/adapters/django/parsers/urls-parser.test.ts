import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseUrls } from './urls-parser.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-viz-django-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

async function writeFile(relPath: string, content: string): Promise<void> {
  const absPath = path.join(tmpDir, relPath)
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf-8')
}

describe('parseUrls (Django)', () => {
  it('urls.py 없으면 빈 배열 반환', async () => {
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toEqual([])
  })

  it('정적 경로: path("users/", ...) → /users', async () => {
    await writeFile('api/urls.py', `
from django.urls import path
from . import views
urlpatterns = [
    path('users/', views.UserListView.as_view(), name='user-list'),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.path).toBe('/users')
    expect(nodes[0]!.dynamicSegmentType).toBe('static')
    expect(nodes[0]!.confidence).toBe('verified')
  })

  it('동적 경로: path("users/<int:pk>/", ...) → /users/:pk', async () => {
    await writeFile('api/urls.py', `
from django.urls import path
from . import views
urlpatterns = [
    path('users/<int:pk>/', views.UserDetailView.as_view()),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.path).toBe('/users/:pk')
    expect(nodes[0]!.dynamicSegmentType).toBe('dynamic')
  })

  it('slug 변환: path("posts/<slug:slug>/") → /posts/:slug', async () => {
    await writeFile('api/urls.py', `
from django.urls import path
from . import views
urlpatterns = [
    path('posts/<slug:slug>/', views.PostDetailView.as_view()),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.path).toBe('/posts/:slug')
  })

  it('include() 호출은 경로로 등록하지 않음', async () => {
    await writeFile('config/urls.py', `
from django.urls import path, include
urlpatterns = [
    path('api/', include('api.urls')),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(0)
  })

  it('여러 urls.py: 모두 수집', async () => {
    await writeFile('api/urls.py', `
from django.urls import path
from . import views
urlpatterns = [
    path('users/', views.UserListView.as_view()),
    path('users/<int:pk>/', views.UserDetailView.as_view()),
]
`)
    await writeFile('blog/urls.py', `
from django.urls import path
from . import views
urlpatterns = [
    path('posts/', views.PostListView.as_view()),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(3)
    const paths = nodes.map(n => n.path).sort()
    expect(paths).toEqual(['/posts', '/users', '/users/:pk'].sort())
  })

  it('provenance에 adapter="django@0.1" 포함', async () => {
    await writeFile('api/urls.py', `
from django.urls import path
from . import views
urlpatterns = [path('users/', views.UserListView.as_view())]
`)
    const nodes = await parseUrls(tmpDir, 'codebase-viz@0.1.0')
    expect(nodes[0]!.provenance.adapter).toBe('django@0.1')
    expect(nodes[0]!.provenance.analyzerVersion).toBe('codebase-viz@0.1.0')
  })

  it('include() prefix 합성 2-pass → /api/users (inferred)', async () => {
    await writeFile('config/urls.py', `
from django.urls import path, include
urlpatterns = [
    path('api/', include('api.urls')),
]
`)
    await writeFile('api/urls.py', `
from django.urls import path
from . import views
urlpatterns = [
    path('users/', views.UserListView.as_view()),
    path('users/<int:pk>/', views.UserDetailView.as_view()),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(2)
    const paths = nodes.map(n => n.path).sort()
    expect(paths).toEqual(['/api/users', '/api/users/:pk'].sort())
    nodes.forEach(n => {
      expect(n.confidence).toBe('inferred')
      if (n.confidence === 'inferred') {
        expect(n.inferenceChain).toBeDefined()
        expect(n.inferenceChain![0]).toContain('include()')
      }
    })
  })

  it('include() 대상 파일 없으면 결과 없음', async () => {
    await writeFile('config/urls.py', `
from django.urls import path, include
urlpatterns = [path('api/', include('missing.urls'))]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(0)
  })

  it('DRF DefaultRouter.register() → list/detail routes (II-C-3)', async () => {
    await writeFile('api/urls.py', `
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('users', views.UserViewSet)
urlpatterns = router.urls
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    const paths = nodes.map(n => n.path)
    expect(paths).toContain('/users')
    expect(paths).toContain('/users/:pk')
    const listRoute = nodes.find(n => n.path === '/users')
    expect(listRoute?.confidence).toBe('inferred')
  })

  it('@api_view 데코레이터 → httpMethod 설정 (IV-2)', async () => {
    await writeFile('api/views.py', `
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET', 'POST'])
def user_list(request):
    return Response([])

@api_view(['GET'])
def user_detail(request, pk):
    return Response({})
`)
    await writeFile('api/urls.py', `
from django.urls import path
from . import views

urlpatterns = [
    path('users/', views.user_list),
    path('users/<int:pk>/', views.user_detail),
]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes.length).toBeGreaterThanOrEqual(2)
    const listRoute = nodes.find(n => n.path === '/users')
    const detailRoute = nodes.find(n => n.path === '/users/:pk')
    expect(listRoute?.httpMethod).toBe('GET,POST')
    expect(detailRoute?.httpMethod).toBe('GET')
  })

  it('CBV def get/post 메서드 → httpMethod 설정 (IV-7)', async () => {
    await writeFile('api/views.py', `
from django.views import View

class UserListView(View):
    def get(self, request):
        return []
    def post(self, request):
        return {}
`)
    await writeFile('api/urls.py', `
from django.urls import path
from . import views

urlpatterns = [
    path('users/', views.UserListView.as_view()),
]
`)
    const nodes = await parseUrls(tmpDir)
    const userRoute = nodes.find(n => n.path === '/users')
    expect(userRoute?.httpMethod).toBe('GET,POST')
  })

  it('@api_view 없는 일반 view → httpMethod undefined', async () => {
    await writeFile('api/views.py', `
from django.views import View

class UserView(View):
    pass
`)
    await writeFile('api/urls.py', `
from django.urls import path
from . import views

urlpatterns = [path('users/', views.UserView.as_view())]
`)
    const nodes = await parseUrls(tmpDir)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.httpMethod).toBeUndefined()
  })

  it('두 앱에 동명 @api_view 함수가 있어도 httpMethod가 덮어쓰이지 않는다 (N-16)', async () => {
    await writeFile('app1/views.py', `
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def user_list(request):
    return Response([])
`)
    await writeFile('app2/views.py', `
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['POST'])
def user_list(request):
    return Response([])
`)
    await writeFile('app1/urls.py', `
from django.urls import path
from . import views

urlpatterns = [
    path('app1/users/', views.user_list),
]
`)
    await writeFile('app2/urls.py', `
from django.urls import path
from . import views

urlpatterns = [
    path('app2/users/', views.user_list),
]
`)
    const nodes = await parseUrls(tmpDir)
    const app1Route = nodes.find(n => n.path === '/app1/users')
    const app2Route = nodes.find(n => n.path === '/app2/users')
    expect(app1Route?.httpMethod).toBe('GET')
    expect(app2Route?.httpMethod).toBe('POST')
  })

  it('include("myapp.urls") → myapp/urls/__init__.py 패키지 형태도 인식 (N-15)', async () => {
    await writeFile('myproject/urls.py', `
from django.urls import path, include

urlpatterns = [
    path('api/', include('myapp.urls')),
]
`)
    await writeFile('myapp/urls/__init__.py', `
from django.urls import path
from . import views

urlpatterns = [
    path('users/', views.user_list, name='user-list'),
    path('users/<int:pk>/', views.user_detail, name='user-detail'),
]
`)
    await writeFile('myapp/views.py', `
def user_list(request): pass
def user_detail(request, pk): pass
`)

    const nodes = await parseUrls(tmpDir)
    const paths = nodes.map(n => n.path)
    expect(paths.some(p => p.includes('users'))).toBe(true)
  })
})

describe('parseUrls — re_path 정규식 패턴 (L-1)', () => {
  it('re_path named group (?P<id>\\d+) → :id 동적 세그먼트 변환', async () => {
    await writeFile('urls.py', `
from django.urls import re_path
from . import views

urlpatterns = [
    re_path(r'^api/users/$', views.user_list),
    re_path(r'^api/users/(?P<id>\\d+)/$', views.user_detail),
    re_path(r'^api/posts/(?P<pk>[0-9]+)/comments/$', views.post_comments),
]
`)
    await writeFile('views.py', `
def user_list(request): pass
def user_detail(request, id): pass
def post_comments(request, pk): pass
`)
    const routes = await parseUrls(tmpDir)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/api/users')
    expect(paths.some(p => p === '/api/users/:id')).toBe(true)
    const dynamic = routes.find(r => r.path === '/api/users/:id')
    expect(dynamic?.dynamicSegmentType).toBe('dynamic')
    expect(paths.some(p => p.includes(':pk'))).toBe(true)
  })
})
