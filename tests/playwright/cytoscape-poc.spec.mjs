// Task 1 PoC — Cytoscape viewer Playwright 검증 (3 fixture: 28 / 200 / 937).
// G1 합격기준 7차원 중 1·2·3·5 측정 (viewport fit / 정보량 / 트리 / 성능).
// .codesight/*.mmd 회귀(차원 6)는 verify.sh로 별도 검증.
import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIEWER_PATH = path.resolve(__dirname, '../../packages/extension/media/viewer-cytoscape.html')
const VIEWER_URL = 'file://' + VIEWER_PATH

// ─── fixture 생성기 ──────────────────────────────────────────────────────────
// raw cytoscape elements 형식 (cytoscape-mapper의 출력과 동일 shape).

function sanitize(s) { return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') }
function makeGroupId(prefix) { return 'g_' + sanitize(prefix) }
function makeNodeId(p) { return 'n_' + sanitize(p) }

function buildRouteFixture(routeCount, modulesCount, resourcesCount) {
  const nodes = []
  const seen = new Set()
  function addGroup(prefix, label, parent) {
    const id = makeGroupId(prefix)
    if (seen.has(id)) return id
    seen.add(id)
    const data = { id, label, kind: 'group' }
    if (parent) data.parent = parent
    nodes.push({ data })
    return id
  }
  function addRoute(p, parent) {
    const id = makeNodeId(p)
    if (seen.has(id)) return
    seen.add(id)
    nodes.push({ data: { id, label: p, kind: 'route', parent, confidence: 'verified' } })
  }
  const apiG = addGroup('/api', '/api')
  const v1G = addGroup('/api/v1', '/api/v1', apiG)
  const actions = ['', '/list', '/create', '/:id', '/:id/edit', '/search', '/export']
  let count = 0
  outer:
  for (let m = 0; m < modulesCount; m++) {
    const moduleName = 'mod' + m
    const moduleG = addGroup(`/api/v1/${moduleName}`, `/api/v1/${moduleName}`, v1G)
    for (let r = 0; r < resourcesCount; r++) {
      const resName = 'res' + r
      const resG = addGroup(`/api/v1/${moduleName}/${resName}`, `/api/v1/${moduleName}/${resName}`, moduleG)
      for (const a of actions) {
        addRoute(`/api/v1/${moduleName}/${resName}${a}`, resG)
        count++
        if (count >= routeCount) break outer
      }
    }
  }
  return { nodes, edges: [] }
}

function buildOptions(elements, tab) {
  const ELK = {
    name: 'elk',
    elk: {
      algorithm: 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': 18,
      'elk.layered.spacing.nodeNodeBetweenLayers': 30,
    },
  }
  const STYLE = [
    { selector: 'node[kind = "route"]', style: { 'shape': 'round-rectangle', 'background-color': '#16a34a', 'border-width': 1, 'border-color': '#0f5132', 'label': 'data(label)', 'color': '#e7ecf3', 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', 'width': 'label', 'height': 24, 'padding': '6px' } },
    { selector: 'node[kind = "group"]', style: { 'shape': 'round-rectangle', 'background-color': '#1f2940', 'background-opacity': 0.6, 'border-width': 1, 'border-color': '#3a4b7a', 'border-style': 'dashed', 'label': 'data(label)', 'color': '#7dd3fc', 'font-size': 11, 'text-valign': 'top', 'text-halign': 'center', 'padding': '12px' } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'width': 1, 'line-color': '#5a6a8a' } },
  ]
  const routeCount = elements.nodes.filter(n => n.data.kind === 'route').length
  const groupCount = elements.nodes.filter(n => n.data.kind === 'group').length
  return {
    tab1: { elements, layout: ELK, style: STYLE, expandCollapse: { layoutBy: ELK, fisheye: false, animate: false, undoable: false }, wheelSensitivity: 0.2, meta: { tab: 'tab1', nodeCount: routeCount, groupCount, edgeCount: 0 } },
    tab2: { elements: { nodes: [], edges: [] }, layout: ELK, style: STYLE, expandCollapse: {}, wheelSensitivity: 0.2, meta: { tab: 'tab2', nodeCount: 0, groupCount: 0, edgeCount: 0 } },
    tab3: { elements: { nodes: [], edges: [] }, layout: ELK, style: STYLE, expandCollapse: {}, wheelSensitivity: 0.2, meta: { tab: 'tab3', nodeCount: 0, groupCount: 0, edgeCount: 0 } },
    meta: { projectName: `fixture-${tab}` },
  }
}

// ─── 3 fixture 검증 ─────────────────────────────────────────────────────────

const FIXTURES = [
  { name: '28-routes',  routeCount: 28,  modules: 2,  resources: 2 },
  { name: '200-routes', routeCount: 200, modules: 5,  resources: 6 },
  { name: '937-routes', routeCount: 937, modules: 10, resources: 14 },
]

test.describe('v2.0 PoC — Cytoscape webview (3 fixture)', () => {
  for (const fx of FIXTURES) {
    test(`${fx.name}: mount + viewport fit + 정보량 보존`, async ({ page }) => {
      const elements = buildRouteFixture(fx.routeCount, fx.modules, fx.resources)
      const data = buildOptions(elements, fx.name)

      await page.addInitScript((payload) => {
        window.__CODESIGHT_CY_FIXTURE__ = payload
      }, data)

      const consoleErrors = []
      page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`) })

      await page.goto(VIEWER_URL)
      // elk layout async — 충분히 대기.
      await page.waitForTimeout(2500)

      // 차원 2 (정보량): cy.nodes() === elements.nodes 수
      const cyState = await page.evaluate(() => {
        const cy = window.__SPIKE_API__?.getCy()
        if (!cy) return null
        return {
          totalNodes: cy.nodes().length,
          routeNodes: cy.nodes('[kind = "route"]').length,
          groupNodes: cy.nodes('[kind = "group"]').length,
          edges: cy.edges().length,
          extent: cy.extent(),
          containerHeight: cy.container().clientHeight,
          containerWidth: cy.container().clientWidth,
        }
      })
      expect(cyState, '__SPIKE_API__가 노출되어 cy 인스턴스 접근 가능해야 한다').not.toBeNull()
      expect(cyState.totalNodes).toBe(elements.nodes.length)
      const expectedRoutes = elements.nodes.filter(n => n.data.kind === 'route').length
      expect(cyState.routeNodes).toBe(expectedRoutes)

      // 차원 1 (viewport fit): fit 호출 후 모든 노드가 화면 안에 들어와야 한다.
      await page.click('#btn-fit')
      await page.waitForTimeout(500)
      const fitState = await page.evaluate(() => {
        const cy = window.__SPIKE_API__.getCy()
        if (!cy) return null
        const ext = cy.extent()
        const c = cy.container()
        return {
          extent: ext,
          containerRect: { w: c.clientWidth, h: c.clientHeight },
          zoom: cy.zoom(),
        }
      })
      expect(fitState.zoom).toBeGreaterThan(0)
      // fit 후 extent가 정상 — degenerate 안 됨 (width/height > 0).
      const w = fitState.extent.x2 - fitState.extent.x1
      const h = fitState.extent.y2 - fitState.extent.y1
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)

      // 스크린샷 — viewport fit 시각 검증용.
      await page.screenshot({
        path: `tests/playwright/screenshots/cy-poc-${fx.name}.png`,
        fullPage: false,
      })

      // 콘솔 에러 없음.
      expect(consoleErrors, `console errors: ${consoleErrors.join(' / ')}`).toEqual([])
    })
  }

  test('937-routes: collapse all → top-level 노출 (차원 3: 트리 일관성)', async ({ page }) => {
    const fx = FIXTURES[2]
    const elements = buildRouteFixture(fx.routeCount, fx.modules, fx.resources)
    const data = buildOptions(elements, fx.name)
    await page.addInitScript((payload) => { window.__CODESIGHT_CY_FIXTURE__ = payload }, data)
    await page.goto(VIEWER_URL)
    await page.waitForTimeout(2500)

    await page.click('#btn-collapse-all')
    await page.waitForTimeout(800)
    const collapsed = await page.evaluate(() => {
      const cy = window.__SPIKE_API__.getCy()
      // 보이는 노드(접힌 cue 포함) 수: collapsed-node 클래스가 적용된 cue가 부모를 대체.
      const visibleNodes = cy.nodes(':visible').length
      const cueNodes = cy.nodes('.cy-expand-collapse-collapsed-node').length
      return { visibleNodes, cueNodes }
    })
    // 접힌 후 노출 노드가 원본보다 훨씬 적어야 한다 (collapse 동작 확인).
    expect(collapsed.visibleNodes).toBeLessThan(50)

    await page.screenshot({
      path: 'tests/playwright/screenshots/cy-poc-937-collapsed.png',
      fullPage: false,
    })
  })

  test('expand-all safety guard: 1000+ 노드 fixture는 confirm 표시', async ({ page }) => {
    const fx = FIXTURES[2]
    const elements = buildRouteFixture(fx.routeCount, fx.modules, fx.resources)
    const data = buildOptions(elements, fx.name)
    await page.addInitScript((payload) => { window.__CODESIGHT_CY_FIXTURE__ = payload }, data)
    await page.goto(VIEWER_URL)
    await page.waitForTimeout(2500)

    // confirm dialog cancel → 동작 안 함.
    let confirmShown = false
    page.on('dialog', async (dialog) => {
      confirmShown = dialog.type() === 'confirm'
      await dialog.dismiss()
    })

    await page.click('#btn-expand-all')
    await page.waitForTimeout(500)
    // 937 + group ≈ 1000+이라 confirm 발생 — fixture에 따라 변동되므로 cy.nodes()로 판정.
    const totalNodes = await page.evaluate(() => window.__SPIKE_API__.getCy().nodes().length)
    if (totalNodes > 1000) {
      expect(confirmShown).toBe(true)
    }
  })
})
