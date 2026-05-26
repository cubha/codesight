import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const PY_EXCLUDE_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'venv', '.venv', 'env'])
export const JAVA_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'target', 'build', '.gradle', 'test'])
export const TS_EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', '.svelte-kit',
  'out', 'coverage', '__pycache__',
])
export const XML_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'target', 'build', '.gradle'])

export async function findFiles(
  dir: string,
  extension: string,
  excludeDirs: Set<string>,
): Promise<string[]> {
  const results: string[] = []
  async function recurse(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name)) await recurse(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        results.push(fullPath)
      }
    }
  }
  await recurse(dir)
  return results
}

export async function findPyFiles(repoRoot: string): Promise<string[]> {
  return findFiles(repoRoot, '.py', PY_EXCLUDE_DIRS)
}

export async function findJavaFiles(repoRoot: string): Promise<string[]> {
  return findFiles(repoRoot, '.java', JAVA_EXCLUDE_DIRS)
}

// .ts / .tsx 확장자를 단일 traverse로 탐색. drizzle/typeorm 등 TS 어댑터 공통.
// options.includeTsx (default true), excludeDeclarations (.d.ts 제외), excludeTests (.test.ts 제외).
export interface FindTsFilesOptions {
  excludeDirs?: Set<string>
  includeTsx?: boolean
  excludeDeclarations?: boolean
  excludeTests?: boolean
}

export async function findTsFiles(repoRoot: string, options: FindTsFilesOptions = {}): Promise<string[]> {
  const {
    excludeDirs = TS_EXCLUDE_DIRS,
    includeTsx = true,
    excludeDeclarations = false,
    excludeTests = false,
  } = options
  const results: string[] = []
  async function recurse(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name)) await recurse(fullPath)
      } else if (entry.isFile()) {
        const name = entry.name
        const isTs = name.endsWith('.ts')
        const isTsx = name.endsWith('.tsx')
        if (!isTs && !isTsx) continue
        if (isTsx && !includeTsx) continue
        if (excludeDeclarations && name.endsWith('.d.ts')) continue
        if (excludeTests && name.endsWith('.test.ts')) continue
        results.push(fullPath)
      }
    }
  }
  await recurse(repoRoot)
  return results
}

export async function findXmlFiles(repoRoot: string): Promise<string[]> {
  return findFiles(repoRoot, '.xml', XML_EXCLUDE_DIRS)
}

// 파일/디렉토리 존재 여부. fs.access는 ENOENT 외 권한 오류도 false로 처리하므로
// 명확한 read 시도가 필요하면 readFile + catch를 직접 호출하는 것이 더 정확.
export async function pathExists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false)
}
