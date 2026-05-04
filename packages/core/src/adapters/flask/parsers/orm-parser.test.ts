import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseFlaskSqlAlchemyModels } from './orm-parser.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

let tmpDir: string
beforeEach(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-flask-orm-')) })
afterEach(async () => { await fs.rm(tmpDir, { recursive: true, force: true }) })

async function writeFile(relPath: string, content: string): Promise<void> {
  const absPath = path.join(tmpDir, relPath)
  await fs.mkdir(path.dirname(absPath), { recursive: true })
  await fs.writeFile(absPath, content, 'utf-8')
}

describe('parseFlaskSqlAlchemyModels', () => {
  it('db.Model 서브클래스 → TableNode 생성', async () => {
    await writeFile('models.py', `
from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
`)
    const tables = await parseFlaskSqlAlchemyModels(tmpDir, 'test')
    expect(tables.length).toBeGreaterThanOrEqual(1)
    const userTable = tables.find(t => t.name === 'User')
    expect(userTable).toBeDefined()
  })

  it('컬럼 타입 및 nullable 파싱', async () => {
    await writeFile('models.py', `
from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()

class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=True)
`)
    const tables = await parseFlaskSqlAlchemyModels(tmpDir, 'test')
    const postTable = tables.find(t => t.name === 'Post')
    expect(postTable?.columns.length).toBeGreaterThanOrEqual(2)
  })

  it('SQLAlchemy 없는 파일은 스킵', async () => {
    await writeFile('views.py', `
def index():
    return 'Hello'
`)
    const tables = await parseFlaskSqlAlchemyModels(tmpDir, 'test')
    expect(tables).toEqual([])
  })

  it('primary_key 컬럼은 nullable=false', async () => {
    await writeFile('models.py', `
from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(50), nullable=False)
`)
    const tables = await parseFlaskSqlAlchemyModels(tmpDir, 'test')
    const itemTable = tables.find(t => t.name === 'Item')
    const idCol = itemTable?.columns.find(c => c.name === 'id')
    expect(idCol?.nullable).toBe(false)
    expect(idCol?.isPrimaryKey).toBe(true)
  })

  it('__tablename__ 재정의 반영', async () => {
    await writeFile('models.py', `
from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()

class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
`)
    const tables = await parseFlaskSqlAlchemyModels(tmpDir, 'test')
    const cat = tables.find(t => t.name === 'categories')
    expect(cat).toBeDefined()
  })

  it('provenance adapter 값 확인', async () => {
    await writeFile('models.py', `
from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()

class Tag(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
`)
    const tables = await parseFlaskSqlAlchemyModels(tmpDir, 'test')
    const tag = tables.find(t => t.name === 'Tag')
    expect(tag?.provenance.adapter).toBe('flask-orm-parser@0.1')
  })
})
