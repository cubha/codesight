import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseFlaskRoutes } from './route-parser.js'

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-test-'))
  await fs.writeFile(path.join(tmpDir, 'requirements.txt'), 'flask>=3.0.0\n')
  await fs.writeFile(
    path.join(tmpDir, 'app.py'),
    `from flask import Flask
app = Flask(__name__)

@app.route('/')
def index():
    return {}

@app.route('/health')
def health():
    return {}

@app.route('/users/<int:user_id>')
def get_user(user_id):
    return {}
`,
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('parseFlaskRoutes', () => {
  it('@app.route 라우트를 추출한다', async () => {
    const routes = await parseFlaskRoutes(tmpDir, 'test@0.1')
    expect(routes.length).toBeGreaterThanOrEqual(3)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/health')
  })

  it('동적 라우트를 감지한다', async () => {
    const routes = await parseFlaskRoutes(tmpDir, 'test@0.1')
    const dynamic = routes.find(r => r.path.includes(':user_id'))
    expect(dynamic).toBeDefined()
    expect(dynamic?.dynamicSegmentType).toBe('dynamic')
  })

  it('routeFileKind는 page', async () => {
    const routes = await parseFlaskRoutes(tmpDir, 'test@0.1')
    for (const r of routes) {
      expect(r.routeFileKind).toBe('page')
    }
  })

  it('파일 없으면 빈 배열 반환', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-empty-'))
    const routes = await parseFlaskRoutes(emptyDir, 'test@0.1')
    expect(routes).toHaveLength(0)
    await fs.rm(emptyDir, { recursive: true, force: true })
  })
})

describe('parseFlaskRoutes — cross-file register_blueprint (II-C-4)', () => {
  let crossDir: string

  beforeAll(async () => {
    crossDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-cross-'))
    await fs.writeFile(
      path.join(crossDir, 'users.py'),
      `from flask import Blueprint
users_bp = Blueprint('users', __name__)

@users_bp.route('/users')
def list_users():
    return []
`,
    )
    await fs.writeFile(
      path.join(crossDir, 'app.py'),
      `from flask import Flask
from users import users_bp

app = Flask(__name__)
app.register_blueprint(users_bp, url_prefix='/api')
`,
    )
  })

  afterAll(async () => {
    await fs.rm(crossDir, { recursive: true, force: true })
  })

  it('별도 파일의 register_blueprint url_prefix 적용 (II-C-4)', async () => {
    const routes = await parseFlaskRoutes(crossDir, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/api/users')
  })
})

describe('parseFlaskRoutes — application factory pattern (II-C-5)', () => {
  let factoryDir: string

  beforeAll(async () => {
    factoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-factory-'))
    await fs.writeFile(
      path.join(factoryDir, 'users.py'),
      `from flask import Blueprint
users_bp = Blueprint('users', __name__)

@users_bp.route('/users')
def list_users():
    return []
`,
    )
    await fs.writeFile(
      path.join(factoryDir, 'app.py'),
      `from flask import Flask
from users import users_bp

def create_app():
    app = Flask(__name__)
    app.register_blueprint(users_bp, url_prefix='/api')
    return app
`,
    )
  })

  afterAll(async () => {
    await fs.rm(factoryDir, { recursive: true, force: true })
  })

  it('create_app() 내부 register_blueprint url_prefix 적용 (II-C-5)', async () => {
    const routes = await parseFlaskRoutes(factoryDir, 'test@0.1')
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/api/users')
  })
})

describe('parseFlaskRoutes — methods kwarg + shorthand decorators (N-4, N-5)', () => {
  it('@app.route에 methods=[GET, POST] 지정 시 httpMethod 추출 (N-4)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-n4-'))
    await fs.writeFile(path.join(dir, 'app.py'), `
from flask import Flask
app = Flask(__name__)

@app.route('/users', methods=['GET'])
def list_users():
    return {}

@app.route('/users', methods=['POST'])
def create_user():
    return {}
`)
    const routes = await parseFlaskRoutes(dir, 'test')
    const getRoute = routes.find(r => r.path === '/users' && r.httpMethod === 'GET')
    const postRoute = routes.find(r => r.path === '/users' && r.httpMethod === 'POST')
    expect(getRoute).toBeDefined()
    expect(postRoute).toBeDefined()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('@app.get() 단축 데코레이터 → httpMethod GET + 라우트 인식 (N-5)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-n5-'))
    await fs.writeFile(path.join(dir, 'app.py'), `
from flask import Flask
app = Flask(__name__)

@app.get('/items')
def list_items():
    return {}

@app.post('/items')
def create_item():
    return {}

@app.delete('/items/<int:id>')
def delete_item(id):
    return {}
`)
    const routes = await parseFlaskRoutes(dir, 'test')
    const getRoute = routes.find(r => r.path === '/items' && r.httpMethod === 'GET')
    const postRoute = routes.find(r => r.path === '/items' && r.httpMethod === 'POST')
    const deleteRoute = routes.find(r => r.path.includes('id') && r.httpMethod === 'DELETE')
    expect(getRoute).toBeDefined()
    expect(postRoute).toBeDefined()
    expect(deleteRoute).toBeDefined()
    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('parseFlaskRoutes — application factory 중복 방지 (L-5)', () => {
  it('application factory 패턴에서 동일 라우트 중복 없음', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-factory-'))
    await fs.writeFile(
      path.join(dir, 'routes.py'),
      `from flask import Blueprint
bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/users')
def users():
    return []

@bp.route('/posts')
def posts():
    return []
`,
    )
    await fs.writeFile(
      path.join(dir, 'app.py'),
      `from flask import Flask
from routes import bp

def create_app():
    app = Flask(__name__)
    app.register_blueprint(bp)
    return app
`,
    )
    const routes = await parseFlaskRoutes(dir, 'test')
    const ids = routes.map(r => r.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
    await fs.rm(dir, { recursive: true, force: true })
  })
})
