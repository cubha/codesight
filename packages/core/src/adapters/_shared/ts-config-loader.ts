import * as path from 'node:path'
import * as fs from 'node:fs/promises'

// aliasPrefix → absolute resolved dir  (e.g. "@/" → "/repo/src")
export type PathsMap = Map<string, string>

export async function loadTsConfigPaths(repoRoot: string): Promise<PathsMap> {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    try {
      const raw = await fs.readFile(path.join(repoRoot, name), 'utf-8')
      const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, string[]> } }
      const tsPathsRecord = parsed.compilerOptions?.paths
      if (tsPathsRecord == null) continue
      const map: PathsMap = new Map()
      for (const [alias, targets] of Object.entries(tsPathsRecord)) {
        const firstTarget = targets[0]
        if (firstTarget === undefined) continue
        const aliasPrefix = alias.endsWith('/*') ? alias.slice(0, -2) : alias
        const targetDir = firstTarget.endsWith('/*') ? firstTarget.slice(0, -2) : firstTarget
        map.set(aliasPrefix, path.resolve(repoRoot, targetDir))
      }
      return map
    } catch {
      // not found or unparseable — try next
    }
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
