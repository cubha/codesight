// T1 nested-tree feasibility spike. WINA 규모(≈516 leaf, 16 top-level domain, 깊이 2~5)의
// 단일 래퍼 중첩 다이어그램을 실제 mermaid.min.js로 렌더해 dagre 레이아웃 시간/freeze를 실측한다.
// 변형: leaf(전체 URL) / folder3(depth3 폴더+count, leaf 없음) / flat(현재 16박스 baseline).
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const MERMAID_LOCAL = path.join(ROOT, 'packages/extension/media/mermaid.min.js')

// WINA 실제 도메인별 라우트 수·대표 깊이 (paste 기반 근사)
const DOMAINS = [
  { name: 'home', total: 1, depth: 1, fan: 1 },
  { name: 'system', total: 33, depth: 3, fan: 8 },
  { name: 'sample', total: 28, depth: 3, fan: 6 },
  { name: 'publish', total: 8, depth: 2, fan: 8 },
  { name: 'model', total: 22, depth: 3, fan: 3 },
  { name: 'profile', total: 13, depth: 3, fan: 2 },
  { name: 'reference-info', total: 18, depth: 3, fan: 3 },
  { name: 'price', total: 40, depth: 3, fan: 3 },
  { name: 'headOffice', total: 30, depth: 5, fan: 5 },
  { name: 'agency', total: 22, depth: 4, fan: 5 },
  { name: 'partner', total: 32, depth: 4, fan: 4 },
  { name: 'mobile', total: 33, depth: 3, fan: 9 },
  { name: 'template', total: 8, depth: 2, fan: 8 },
  { name: 'login', total: 1, depth: 1, fan: 1 },
  { name: 'sso-login', total: 1, depth: 1, fan: 1 },
  { name: 'sso-result', total: 1, depth: 1, fan: 1 },
]

const SCALE = parseFloat(process.argv[2] ?? '1')
let nid = 0
const id = () => 'n' + nid++

// 한 도메인을 깊이 depth, 분기 fan으로 total leaf 채우는 중첩 subgraph 생성.
function emitDomainNested(lines, ind, name, total, depth, fan, leafMode) {
  const sgId = id()
  lines.push(`${ind}subgraph ${sgId}["📁 ${name}"]`)
  if (depth <= 1 || total <= 1) {
    if (leafMode) for (let i = 0; i < total; i++) lines.push(`${ind}  ${id()}["/${name}/route${i}"]`)
    else lines.push(`${ind}  ${id()}["📁 ${name} · ${total} routes"]`)
  } else {
    const groups = Math.min(fan, total)
    const per = Math.ceil(total / groups)
    let left = total
    for (let g = 0; g < groups && left > 0; g++) {
      const t = Math.min(per, left); left -= t
      if (!leafMode && depth <= 2) {
        lines.push(`${ind}  ${id()}["📁 sub${g} · ${t} routes"]`)
      } else {
        emitDomainNested(lines, ind + '  ', `${name}-sub${g}`, t, depth - 1, fan, leafMode)
      }
    }
  }
  lines.push(`${ind}end`)
}

function buildVariant(mode) {
  nid = 0
  const lines = [`%%{init:{'theme':'base'}}%%`, 'graph LR', '  subgraph BROWSER["🌐 Browser"]', '    subgraph ROUTER["🧭 React Router · SPA"]', '      subgraph REACT["⚛ React · CSR Engine"]']
  let leafCount = 0
  for (const d0 of DOMAINS) {
    const d = { ...d0, total: Math.max(1, Math.round(d0.total * SCALE)) }
    leafCount += d.total
    if (mode === 'flat') {
      lines.push(`        ${id()}["📁 ${d.name} · ${d.total} routes"]`)
    } else if (mode === 'folder3') {
      emitDomainNested(lines, '        ', d.name, d.total, Math.min(d.depth, 3), d.fan, false)
    } else { // leaf
      emitDomainNested(lines, '        ', d.name, d.total, d.depth, d.fan, true)
    }
  }
  lines.push('      end', '    end', '  end')
  return { text: lines.join('\n'), leafCount, nodeLines: lines.length }
}

const HARNESS = path.join('/tmp', 'tab1-spike')
fs.mkdirSync(HARNESS, { recursive: true })
fs.copyFileSync(MERMAID_LOCAL, path.join(HARNESS, 'mermaid.min.js'))
fs.writeFileSync(path.join(HARNESS, 'index.html'),
  `<!doctype html><html><body><div id="o"></div><script src="./mermaid.min.js"></script>
   <script>window.__ready=true</script></body></html>`)

const http = await import('node:http')
const server = http.createServer((req, res) => {
  const f = path.join(HARNESS, req.url === '/' ? '/index.html' : req.url)
  if (!fs.existsSync(f)) { res.statusCode = 404; res.end(); return }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html')
  res.end(fs.readFileSync(f))
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

for (const mode of ['flat', 'folder3', 'leaf']) {
  const v = buildVariant(mode)
  const r = await page.evaluate(async ({ text, mode }) => {
    const t0 = performance.now()
    try {
      const { svg } = await window.mermaid.render('g_' + mode, text)
      const nodes = (svg.match(/class="[^"]*node[^"]*"/g) || []).length
      const clusters = (svg.match(/class="[^"]*cluster[^"]*"/g) || []).length
      return { ok: true, ms: Math.round(performance.now() - t0), svgNodes: nodes, svgClusters: clusters, svgKB: Math.round(svg.length / 1024) }
    } catch (e) { return { ok: false, ms: Math.round(performance.now() - t0), err: String(e).slice(0, 160) } }
  }, { text: v.text, mode })
  console.log(JSON.stringify({ mode, leafCount: v.leafCount, diagramLines: v.nodeLines, ...r }))
}

await browser.close(); server.close()
if (errors.length) console.log('PAGE_ERRORS', errors.slice(0, 5))
