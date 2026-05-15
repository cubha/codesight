import { build } from 'esbuild'
import * as fs from 'node:fs'
import * as path from 'node:path'

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  minify: false,
})

// ELK layout 폐기 (graph LR column 분리·노드 비율 부작용). dagre 사용. 번들 제거.
try { fs.unlinkSync('media/mermaid-layout-elk.js') } catch { /* already gone */ }

// Copy WASM files to dist/wasm/ for tree-sitter adapters.
const coreWasmDir = path.resolve('..', 'core', 'wasm')
const outWasmDir = path.resolve('dist', 'wasm')
fs.mkdirSync(outWasmDir, { recursive: true })
for (const f of fs.readdirSync(coreWasmDir)) {
  if (f.endsWith('.wasm')) {
    fs.copyFileSync(path.join(coreWasmDir, f), path.join(outWasmDir, f))
  }
}
