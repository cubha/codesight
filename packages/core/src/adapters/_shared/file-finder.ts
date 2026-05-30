import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export const PY_EXCLUDE_DIRS = new Set(['__pycache__', '.git', 'node_modules', 'venv', '.venv', 'env'])
export const JAVA_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'target', 'build', '.gradle', 'test'])
export const TS_EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', '.svelte-kit',
  'out', 'coverage', '__pycache__',
])
export const XML_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'target', 'build', '.gradle'])

// 어댑터별 EXCLUDE_DIRS — 빌드 캐시·번들러 산출물 제외.
export const NEXTJS_EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build'])
export const NUXT_EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.nuxt', 'dist', '.output'])
export const ANGULAR_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.angular'])
export const VITE_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.vite', 'build'])
export const REMIX_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'build', '.cache'])
export const REACTROUTER_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.vite'])
export const NESTJS_EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next'])
export const VUE_SPA_EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', '.nuxt', '.vite', 'build'])
export const SVELTEKIT_EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.svelte-kit', 'dist', 'build'])

// 범용 디렉토리 traverse. extensions·excludeDirs·nameFilter로 어댑터별 분기 흡수.
export interface WalkDirOptions {
  extensions?: Set<string>  // 지정 시 해당 확장자만 통과
  excludeDirs?: Set<string>  // default: 없음 (모든 디렉토리 진입)
  nameFilter?: (name: string) => boolean  // 복합 조건 필터 (예: !endsWith('.spec.ts'))
}

export async function walkDir(dir: string, options: WalkDirOptions = {}): Promise<string[]> {
  const { extensions, excludeDirs, nameFilter } = options
  const results: string[] = []
  async function recurse(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null)
    if (entries === null) return
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (excludeDirs === undefined || !excludeDirs.has(entry.name)) await recurse(fullPath)
      } else if (entry.isFile()) {
        if (extensions !== undefined) {
          const ext = path.extname(entry.name)
          if (!extensions.has(ext)) continue
        }
        if (nameFilter !== undefined && !nameFilter(entry.name)) continue
        results.push(fullPath)
      }
    }
  }
  await recurse(dir)
  return results
}

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
