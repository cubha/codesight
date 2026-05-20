import * as path from 'node:path'
import { Project, SyntaxKind, type SourceFile, type Node } from 'ts-morph'

export type FeCallLibrary = 'axios' | 'fetch' | 'react-query'

export interface FeCall {
  method: string
  url: string
  filePath: string   // repo-relative path (relative to repoRoot)
  line: number       // 1-based
  confidence: 'verified' | 'inferred'
  inferenceChain?: string[]
  library: FeCallLibrary
}

const AXIOS_HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options'])
const SWR_HOOKS = new Set(['useSWR', 'useSWRInfinite'])

function extractSameFileStringConsts(sf: SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const vd of sf.getVariableDeclarations()) {
    const init = vd.getInitializer()
    if (init === undefined) continue
    const k = init.getKind()
    if (k === SyntaxKind.StringLiteral || k === SyntaxKind.NoSubstitutionTemplateLiteral) {
      map.set(vd.getName(), init.getText().slice(1, -1))
    }
  }
  return map
}

function resolveUrl(
  raw: string,
  consts: Map<string, string>,
): { url: string; confidence: 'verified' | 'inferred'; inferenceChain?: string[] } {
  if (!raw.includes('${')) return { url: raw, confidence: 'verified' }

  let resolved = raw
  const chain: string[] = []
  for (const [name, val] of consts) {
    const ph = '${' + name + '}'
    if (resolved.includes(ph)) {
      resolved = resolved.split(ph).join(val)
      chain.push(`template-literal: ${name}=${val}`)
    }
  }
  if (resolved.includes('${')) {
    resolved = resolved.replace(/\$\{[^}]+\}/g, '${…}')
    chain.push('dynamic-template')
  }
  return { url: resolved, confidence: 'inferred', inferenceChain: chain.length > 0 ? chain : ['template-literal'] }
}

function extractUrlFromNode(
  node: Node,
  consts: Map<string, string>,
): { url: string; confidence: 'verified' | 'inferred'; inferenceChain?: string[] } | null {
  const k = node.getKind()
  if (k === SyntaxKind.StringLiteral || k === SyntaxKind.NoSubstitutionTemplateLiteral) {
    const raw = node.getText().slice(1, -1)
    return { url: raw, confidence: 'verified' }
  }
  if (k === SyntaxKind.TemplateExpression) {
    // Reassemble template: head + spans
    const tmpl = node.asKindOrThrow(SyntaxKind.TemplateExpression)
    let raw = tmpl.getHead().getLiteralText()
    for (const span of tmpl.getTemplateSpans()) {
      const expr = span.getExpression()
      if (expr.getKind() === SyntaxKind.Identifier) {
        raw += '${' + expr.getText() + '}'
      } else {
        raw += '${…}'
      }
      raw += span.getLiteral().getLiteralText()
    }
    return resolveUrl(raw, consts)
  }
  return null
}

function buildFeCall(
  method: string,
  resolved: { url: string; confidence: 'verified' | 'inferred'; inferenceChain?: string[] },
  filePath: string,
  line: number,
  library: FeCallLibrary,
): FeCall {
  if (resolved.inferenceChain !== undefined) {
    return { method, url: resolved.url, filePath, line, confidence: resolved.confidence, inferenceChain: resolved.inferenceChain, library }
  }
  return { method, url: resolved.url, filePath, line, confidence: resolved.confidence, library }
}

function extractMethodFromFetchOptions(args: Node[]): string {
  if (args.length < 2) return 'GET'
  const opts = args[1]
  if (!opts) return 'GET'
  if (opts.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const obj = opts.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    for (const prop of obj.getProperties()) {
      if (prop.getKind() === SyntaxKind.PropertyAssignment) {
        const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment)
        if (pa.getName() === 'method') {
          const val = pa.getInitializer()
          if (val && (val.getKind() === SyntaxKind.StringLiteral || val.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral)) {
            return val.getText().slice(1, -1).toUpperCase()
          }
        }
      }
    }
  }
  return 'GET'
}

function processSourceFile(sf: SourceFile, filePath: string, calls: FeCall[]): void {
  const consts = extractSameFileStringConsts(sf)

  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return
    const call = node.asKindOrThrow(SyntaxKind.CallExpression)
    const expr = call.getExpression()
    const args = call.getArguments()
    const firstArg = args[0]

    // fetch('url') or fetch('url', { method: 'POST' })
    if (expr.getKind() === SyntaxKind.Identifier && expr.getText() === 'fetch') {
      if (!firstArg) return
      const resolved = extractUrlFromNode(firstArg, consts)
      if (!resolved) return
      const method = extractMethodFromFetchOptions(args)
      calls.push(buildFeCall(method, resolved, filePath, call.getStartLineNumber(), 'fetch'))
      return
    }

    // axios.get('/url') / axios.post('/url') / etc.
    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const pae = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
      const methodName = pae.getName().toLowerCase()
      if (AXIOS_HTTP_METHODS.has(methodName)) {
        if (!firstArg) return
        const resolved = extractUrlFromNode(firstArg, consts)
        if (!resolved) return
        calls.push(buildFeCall(methodName.toUpperCase(), resolved, filePath, call.getStartLineNumber(), 'axios'))
        return
      }

      // useSWR('url', fetcher) — first arg is the cache key (URL)
      const calleeName = pae.getName()
      if (SWR_HOOKS.has(calleeName) || (expr.getKind() === SyntaxKind.Identifier && SWR_HOOKS.has(expr.getText()))) {
        if (!firstArg) return
        const resolved = extractUrlFromNode(firstArg, consts)
        if (!resolved) return
        calls.push(buildFeCall('GET', resolved, filePath, call.getStartLineNumber(), 'react-query'))
        return
      }
    }

    // useSWR('url', fetcher) at top-level identifier call
    if (expr.getKind() === SyntaxKind.Identifier && SWR_HOOKS.has(expr.getText())) {
      if (!firstArg) return
      const resolved = extractUrlFromNode(firstArg, consts)
      if (!resolved) return
      calls.push(buildFeCall('GET', resolved, filePath, call.getStartLineNumber(), 'react-query'))
    }
  })
}

export async function extractFeCalls(
  filePaths: string[],
  repoRoot: string,
  _analyzerVersion: string,
): Promise<FeCall[]> {
  if (filePaths.length === 0) return []

  const normalizedRoot = path.resolve(repoRoot)
  const project = new Project({
    compilerOptions: { target: 99, allowJs: true, strict: false },
    skipAddingFilesFromTsConfig: true,
  })

  for (const fp of filePaths) {
    project.addSourceFileAtPath(fp)
  }

  const calls: FeCall[] = []
  for (const sf of project.getSourceFiles()) {
    const absPath = sf.getFilePath()
    const repoRelativePath = path.relative(normalizedRoot, absPath).replace(/\\/g, '/')
    processSourceFile(sf, repoRelativePath, calls)
  }
  return calls
}

export function extractFeCallsFromText(
  sourceText: string,
  virtualPath: string,
): FeCall[] {
  const project = new Project({
    compilerOptions: { target: 99, allowJs: true, strict: false },
    useInMemoryFileSystem: true,
  })
  const sf = project.createSourceFile(virtualPath, sourceText)
  const calls: FeCall[] = []
  processSourceFile(sf, virtualPath, calls)
  return calls
}
