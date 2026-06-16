import * as path from 'node:path'
import * as fs from 'node:fs/promises'

// aliasPrefix → absolute resolved dir  (e.g. "@/" → "/repo/src")
export type PathsMap = Map<string, string>

// tsconfig는 JSONC(주석·trailing comma 허용)라 JSON.parse가 throw할 수 있다.
// 문자열 리터럴 내부는 보존하면서 //·/* */ 주석과 trailing comma만 제거.
function stripJsonComments(input: string): string {
  let out = ''
  let inStr = false
  let strQuote = ''
  let inLine = false
  let inBlock = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    const next = input[i + 1]
    if (inLine) {
      if (c === '\n') { inLine = false; out += c }
      continue
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i++ }
      continue
    }
    if (inStr) {
      out += c
      if (c === '\\') { out += next ?? ''; i++; continue }
      if (c === strQuote) inStr = false
      continue
    }
    if (c === '"' || c === "'") { inStr = true; strQuote = c; out += c; continue }
    if (c === '/' && next === '/') { inLine = true; i++; continue }
    if (c === '/' && next === '*') { inBlock = true; i++; continue }
    out += c
  }
  // trailing comma 제거: ,}  ,]
  return out.replace(/,(\s*[}\]])/g, '$1')
}

interface TsConfigShape {
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
  extends?: string
  references?: { path?: string }[]
}

function buildPathsMap(
  tsPathsRecord: Record<string, string[]>,
  baseDir: string,
): PathsMap {
  const map: PathsMap = new Map()
  for (const [alias, targets] of Object.entries(tsPathsRecord)) {
    const firstTarget = targets[0]
    if (firstTarget === undefined) continue
    const aliasPrefix = alias.endsWith('/*') ? alias.slice(0, -2) : alias
    // "src/*" → "src", "*" → "" (baseUrl 루트), "src" → "src"
    const targetSuffix = firstTarget.endsWith('/*')
      ? firstTarget.slice(0, -2)
      : firstTarget === '*' ? '' : firstTarget
    map.set(aliasPrefix, path.resolve(baseDir, targetSuffix))
  }
  return map
}

// 단일 tsconfig 파일에서 paths를 추출. 없으면 extends → references 순으로 1-hop씩 추적.
// Vite 스플릿(tsconfig.json이 references로 tsconfig.app.json 분리) + base 상속 케이스 커버.
async function loadPathsFromConfig(
  configPath: string,
  depth: number,
): Promise<PathsMap | undefined> {
  if (depth > 5) return undefined
  let parsed: TsConfigShape
  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    parsed = JSON.parse(stripJsonComments(raw)) as TsConfigShape
  } catch {
    return undefined
  }
  const configDir = path.dirname(configPath)
  const tsPathsRecord = parsed.compilerOptions?.paths
  if (tsPathsRecord != null) {
    // paths 타겟은 baseUrl 기준. baseUrl 미지정 시 이 config 위치 기준.
    const baseDir = path.resolve(configDir, parsed.compilerOptions?.baseUrl ?? '.')
    return buildPathsMap(tsPathsRecord, baseDir)
  }
  // extends 추적 (상대경로만; 패키지 extends는 해석 불가하므로 skip)
  if (typeof parsed.extends === 'string' && parsed.extends.startsWith('.')) {
    const ext = parsed.extends.endsWith('.json') ? parsed.extends : `${parsed.extends}.json`
    const r = await loadPathsFromConfig(path.resolve(configDir, ext), depth + 1)
    if (r !== undefined) return r
  }
  // references 추적 (tsconfig.app.json 등)
  for (const ref of parsed.references ?? []) {
    if (typeof ref.path !== 'string') continue
    const refResolved = path.resolve(configDir, ref.path)
    const refFile = ref.path.endsWith('.json') ? refResolved : path.join(refResolved, 'tsconfig.json')
    const r = await loadPathsFromConfig(refFile, depth + 1)
    if (r !== undefined) return r
  }
  return undefined
}

export async function loadTsConfigPaths(repoRoot: string): Promise<PathsMap> {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const r = await loadPathsFromConfig(path.join(repoRoot, name), 0)
    if (r !== undefined) return r
  }
  return new Map()
}

// moduleSpecifier(e.g. '@/pages/home-page' or './foo')를 절대경로(확장자 미포함)로 변환.
// relative('.', '..')는 fromFileDir 기준 resolve, alias prefix(`@/`, `~/`, etc.)는 PathsMap 기준 resolve.
// 매칭 실패(외부 모듈 등) 시 undefined.
export function resolveModuleSpecWithPaths(
  moduleSpecifier: string,
  fromFileDir: string,
  paths: PathsMap,
): string | undefined {
  if (moduleSpecifier.startsWith('.')) {
    return path.resolve(fromFileDir, moduleSpecifier)
  }
  for (const [aliasPrefix, targetDir] of paths) {
    if (moduleSpecifier === aliasPrefix || moduleSpecifier.startsWith(aliasPrefix + '/')) {
      const rest = moduleSpecifier.slice(aliasPrefix.length)
      return path.join(targetDir, rest)
    }
  }
  return undefined
}
