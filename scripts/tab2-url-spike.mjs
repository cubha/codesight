// ST3 (advisor blocker 1): Tab2 leaf 전체 URL 병기(ST2)가 라벨 폭/텍스트 길이를 키워
// mermaid 렌더에 미치는 영향을 WINA 규모로 실측한다. 검증:
//  (1) 청크별 텍스트 길이 < viewer maxTextSize(1,000,000) — 조용한 truncation 방지
//  (2) 렌더된 SVG 노드 수 = 기대 leaf 수 — truncation 0 (mermaid는 cap 초과 시 조용히 중단)
//  (3) overlap heuristic — 노드 bbox 겹침 0 (라벨 폭 증가가 레이아웃 깨지 않음)
//  (4) URL 병기 전/후 텍스트 길이 delta
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { buildDiagrams } from '@codebase-viz/renderer'
import { createIRGraph, createRouteNode, createComponentNode, createEdge, makeNodeId, makeEdgeId } from '@codebase-viz/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const MERMAID_LOCAL = path.join(ROOT, 'packages/extension/media/mermaid.min.js')
const SEP = '%%--CHUNK--%%'

// WINA 도메인 레이어드 구조: src/pages/<domain>/<mid>/<leaf>/Page.tsx + URL divergent.
const DOMAINS = [
  ['system', 33, 3], ['sample', 28, 3], ['model', 22, 3], ['profile', 13, 3],
  ['referenceInfo', 18, 3], ['price', 40, 3], ['headOffice', 30, 4], ['agency', 22, 4],
  ['partner', 32, 4], ['mobile', 33, 3], ['publish', 8, 2], ['template', 8, 2],
  ['order-plan', 20, 3], ['material', 25, 3], ['perf', 15, 3], ['head-office', 28, 4],
]
const PROV = { file: 'src/router.tsx', line: 1, adapter: 'reactrouter', analyzerVersion: '0.1' }
const routes = []
const comps = []
const edges = []
let n = 0
for (const [dom, total, depth] of DOMAINS) {
  for (let i = 0; i < total; i++) {
    const mid = `mid${i % 5}`
    const leaf = `leaf${i}`
    const segs = depth >= 4 ? [dom, mid, `sub${i % 3}`, leaf] : [dom, mid, leaf]
    const url = '/' + segs.join('/')
    const filePath = `src/pages/${segs.join('/')}/${leaf[0].toUpperCase() + leaf.slice(1)}Page.tsx`
    const rid = makeNodeId('route', 'src/router.tsx', url)
    const cid = makeNodeId('component', filePath, 'default')
    routes.push(createRouteNode({ id: rid, path: url, filePath: 'src/router.tsx', routeFileKind: 'page', dynamicSegmentType: 'static', isGroupRoute: false, renderingMode: 'CSR', provenance: PROV, confidence: 'verified' }))
    comps.push(createComponentNode({ id: cid, name: `${leaf}Page`, filePath, runtime: 'client', provenance: { ...PROV, file: filePath }, confidence: 'verified' }))
    edges.push(createEdge({ id: makeEdgeId('renders', rid, cid), from: rid, to: cid, kind: 'renders', provenance: PROV, confidence: 'verified' }))
    n++
  }
}
const graph = createIRGraph({
  analyzerVersion: 'codebase-viz@0.1.0', repoRoot: '/tmp/wina', projectName: 'wina',
  metadata: { framework: 'react-router', hasSupabase: false, hasPrisma: false, hasDexie: false, hasFirebase: false, adapterCategory: 'FE' },
  nodes: [...routes, ...comps], edges,
})
const { screenComponent } = buildDiagrams(graph)
const chunks = screenComponent.split(`\n${SEP}\n`)
const expectedLeaves = n
console.log('routes:', n, ' Tab2 chunks:', chunks.length, ' total chars:', screenComponent.length)
const urlLines = (screenComponent.match(/🔗 \//g) || []).length
console.log('🔗 URL 병기 leaf 수:', urlLines, '(기대 ≈', expectedLeaves, ')')
const maxChunk = Math.max(...chunks.map(c => c.length))
console.log('max chunk chars:', maxChunk, ' < 1,000,000(viewer cap):', maxChunk < 1000000)

const HARNESS = path.join('/tmp', 'tab2-spike')
fs.mkdirSync(HARNESS, { recursive: true })
fs.copyFileSync(MERMAID_LOCAL, path.join(HARNESS, 'mermaid.min.js'))
fs.writeFileSync(path.join(HARNESS, 'index.html'), `<!doctype html><html><body><div id="o"></div><script src="./mermaid.min.js"></script><script>window.__ready=true</script></body></html>`)
const http = await import('node:http')
const server = http.createServer((req, res) => { const f = path.join(HARNESS, req.url === '/' ? '/index.html' : req.url); if (!fs.existsSync(f)) { res.statusCode = 404; res.end(); return } res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(f)) })
await new Promise(r => server.listen(0, r))
const port = server.address().port
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto(`http://localhost:${port}/`)
await page.waitForFunction(() => window.mermaid && window.__ready, { timeout: 15000 })
// viewer.html과 동일 설정 (maxTextSize 1M)
await page.evaluate(() => window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', maxTextSize: 1000000, maxEdges: 2000 }))

let totalRendered = 0, anyOverlap = false, anyFail = false
for (let i = 0; i < chunks.length; i++) {
  const r = await page.evaluate(async (text) => {
    try {
      const { svg } = await window.mermaid.render('g_' + Math.floor(performance.now()), text)
      const div = document.createElement('div'); div.innerHTML = svg; document.body.appendChild(div)
      const nodes = div.querySelectorAll('.node')
      // overlap heuristic: leaf 노드 bbox 쌍 겹침 검사(같은 cluster 내 인접만 샘플)
      const boxes = Array.from(nodes).map(el => { const b = el.getBBox?.() ?? null; return b }).filter(Boolean)
      let overlap = 0
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
        const x = boxes[a], y = boxes[b]
        if (x.x < y.x + y.width && x.x + x.width > y.x && x.y < y.y + y.height && x.y + x.height > y.y) overlap++
      }
      const count = (svg.match(/class="[^"]*node[^"]*"/g) || []).length
      div.remove()
      return { ok: true, nodes: count, overlap }
    } catch (e) { return { ok: false, err: String(e).slice(0, 140) } }
  }, chunks[i])
  if (!r.ok) { anyFail = true; console.log(`chunk ${i}: FAIL ${r.err}`) }
  else { totalRendered += r.nodes; if (r.overlap > 0) { anyOverlap = true } }
}
console.log('rendered SVG nodes(all chunks):', totalRendered, ' overlap detected:', anyOverlap, ' render fail:', anyFail)
console.log('truncation:', totalRendered >= expectedLeaves ? 'NONE (rendered >= leaves)' : `SUSPECT (rendered ${totalRendered} < ${expectedLeaves})`)
if (errors.length) console.log('PAGE_ERRORS', errors.slice(0, 3))
await browser.close(); server.close()
