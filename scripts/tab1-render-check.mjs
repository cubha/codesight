// ST1 render-check (advisor 요구): 실제 buildNestedFolderOverviewLines emitter 출력을
// WINA 규모(16 top-level domain · ~516 page route, depth 2~5)로 실제 mermaid.min.js + playwright에
// 통과시켜 레이아웃(bare placement)·dagre 시간·freeze·노드수를 실측하고 스크린샷을 남긴다.
// 합성 라우트를 실제 파이프라인(buildDiagrams)에 태워 hand-written emitter 아닌 production 코드를 검증.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { buildDiagrams } from '@codebase-viz/renderer'
import { createIRGraph, createRouteNode, makeNodeId } from '@codebase-viz/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MERMAID_LOCAL = path.join(ROOT, 'packages/extension/media/mermaid.min.js')

// 사용자 제공 WINA 라우터 근사 (도메인·route수·대표 깊이)
const DOMAINS = [
  { name: 'login', total: 1, depth: 1, fan: 1 },
  { name: 'sso-login', total: 1, depth: 1, fan: 1 },
  { name: 'sso-result', total: 1, depth: 1, fan: 1 },
  { name: 'home', total: 1, depth: 1, fan: 1 },
  { name: 'system', total: 33, depth: 3, fan: 8 },
  { name: 'sample', total: 28, depth: 3, fan: 6 },
  { name: 'publish', total: 8, depth: 2, fan: 8 },
  { name: 'model', total: 22, depth: 3, fan: 3 },
  { name: 'profile', total: 13, depth: 3, fan: 2 },
  { name: 'referenceInfo', total: 18, depth: 3, fan: 3 },
  { name: 'price', total: 40, depth: 3, fan: 3 },
  { name: 'headOffice', total: 30, depth: 5, fan: 5 },
  { name: 'agency', total: 22, depth: 4, fan: 5 },
  { name: 'partner', total: 32, depth: 4, fan: 4 },
  { name: 'mobile', total: 33, depth: 3, fan: 9 },
  { name: 'template', total: 8, depth: 2, fan: 8 },
]

const PROV = { file: 'src/router.tsx', line: 1, adapter: 'reactrouter', analyzerVersion: '0.1' }
const paths = []
// 각 도메인을 depth/fan으로 펼쳐 total개의 고유 경로 생성
function gen(prefix, total, depth, fan) {
  if (total <= 1 || depth <= 1) { for (let i = 0; i < total; i++) paths.push(`${prefix}/r${i}`); return }
  const groups = Math.min(fan, total)
  const per = Math.ceil(total / groups)
  let left = total
  for (let g = 0; g < groups && left > 0; g++) {
    const t = Math.min(per, left); left -= t
    gen(`${prefix}/g${g}`, t, depth - 1, fan)
  }
}
for (const d of DOMAINS) gen(`/${d.name}`, d.total, d.depth, d.fan)

const routes = paths.map(p => createRouteNode({
  id: makeNodeId('route', 'src/router.tsx', p), path: p, filePath: 'src/router.tsx',
  routeFileKind: 'page', dynamicSegmentType: 'static', isGroupRoute: false,
  renderingMode: 'CSR', provenance: PROV, confidence: 'verified',
}))
const graph = createIRGraph({
  analyzerVersion: 'codebase-viz@0.1.0', repoRoot: '/tmp/wina', projectName: 'wina',
  metadata: { framework: 'react-router', hasSupabase: false, hasPrisma: false, hasDexie: false, hasFirebase: false, adapterCategory: 'FE' },
  nodes: routes, edges: [],
})
const { rendering } = buildDiagrams(graph)
console.log('synthetic page routes:', routes.length)
console.log('Tab1 diagram lines:', rendering.split('\n').length, ' chars:', rendering.length)
console.log('CHUNK present:', rendering.includes('%%--CHUNK--%%') || rendering.includes('%% chunk:'))
// top-level 도메인 누락 체크
for (const d of DOMAINS) {
  if (!rendering.includes(`📁 /${d.name} ·`)) console.log('!!! MISSING domain:', d.name)
}

const HARNESS = path.join('/tmp', 'tab1-rc')
fs.mkdirSync(HARNESS, { recursive: true })
fs.copyFileSync(MERMAID_LOCAL, path.join(HARNESS, 'mermaid.min.js'))
fs.writeFileSync(path.join(HARNESS, 'index.html'),
  `<!doctype html><html><body><div id="o"></div><script src="./mermaid.min.js"></script><script>window.__ready=true</script></body></html>`)
const http = await import('node:http')
const server = http.createServer((req, res) => {
  const f = path.join(HARNESS, req.url === '/' ? '/index.html' : req.url)
  if (!fs.existsSync(f)) { res.statusCode = 404; res.end(); return }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(f))
})
await new Promise(r => server.listen(0, r))
const port = server.address().port
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(`http://localhost:${port}/`)
await page.waitForFunction(() => window.mermaid && window.__ready, { timeout: 15000 })
await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', maxEdges: 5000, maxTextSize: 5000000 }))
const r = await page.evaluate(async (text) => {
  const t0 = performance.now()
  try {
    const { svg } = await window.mermaid.render('g_rc', text)
    const nodes = (svg.match(/class="[^"]*node[^"]*"/g) || []).length
    const clusters = (svg.match(/class="[^"]*cluster[^"]*"/g) || []).length
    const wm = svg.match(/width="([\d.]+)"/); const hm = svg.match(/height="([\d.]+)"/)
    document.getElementById('o').innerHTML = svg
    return { ok: true, ms: Math.round(performance.now() - t0), svgNodes: nodes, svgClusters: clusters, svgKB: Math.round(svg.length / 1024), w: wm && Math.round(+wm[1]), h: hm && Math.round(+hm[1]) }
  } catch (e) { return { ok: false, ms: Math.round(performance.now() - t0), err: String(e).slice(0, 200) } }
}, rendering)
console.log('RENDER:', JSON.stringify(r))
if (r.ok) {
  console.log('aspect (w/h):', (r.w / r.h).toFixed(2))
  await page.screenshot({ path: path.join(ROOT, 'scripts/tab1-render-check.png'), fullPage: true })
  console.log('screenshot → scripts/tab1-render-check.png')
}
if (errors.length) console.log('PAGE_ERRORS', errors.slice(0, 5))
await browser.close(); server.close()
