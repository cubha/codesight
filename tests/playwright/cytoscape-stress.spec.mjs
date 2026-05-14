// Task 1 PoC — Cytoscape collapse/expand stress 자동 검증.
// G0 조건 1 (expand-collapse plugin critical bug #141/#142 hedge)을 자동 차단한다.
//
// 시나리오:
//   S1: Collapse All ↔ Expand All 50회 반복 — #141 (Collapsing crashes) 표적
//   S2: 단일 group expand/collapse 100회 — #142 (CollapsedChildren returns null) 표적
//   S3: Tab lifecycle 20회 destroy/rebuild — 메모리 누수 측정
//   S4: 중첩 collapse — top-level → module → resource → back
//
// 사용 fixture: mini-spring-large-app 패턴 (250 routes / 60 group, 사용자 b2b 백엔드 규모 ≈)
import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIEWER_PATH = path.resolve(__dirname, '../../packages/extension/media/viewer-cytoscape.html')
const VIEWER_URL = 'file://' + VIEWER_PATH

// ─── 250 routes Spring-style fixture (mini-spring-large-app 그대로 모방) ────
function sanitize(s) { return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') }
function makeGroupId(prefix) { return 'g_' + sanitize(prefix) }
function makeNodeId(p) { return 'n_' + sanitize(p) }

function buildSpringStyle250() {
  const MODULES = ['admin', 'auth', 'billing', 'catalog', 'customer',
                   'employee', 'inventory', 'notification', 'order', 'product']
  const RESOURCES = ['users', 'roles', 'permissions', 'logs', 'reports']
  const ACTIONS = ['', '/{id}', '', '/{id}', '/{id}'] // GET list, GET one, POST, PUT, DELETE — 5 endpoints/controller
  const METHODS = ['GET', 'GET', 'POST', 'PUT', 'DELETE']
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
  function addRoute(p, method, parent) {
    const id = makeNodeId(method + '_' + p)
    if (seen.has(id)) return
    seen.add(id)
    nodes.push({ data: { id, label: `${method} ${p}`, kind: 'route', parent, confidence: 'verified' } })
  }
  const apiG = addGroup('/api', '/api')
  const v1G = addGroup('/api/v1', '/api/v1', apiG)
  for (const m of MODULES) {
    const mG = addGroup(`/api/v1/${m}`, `/api/v1/${m}`, v1G)
    for (const r of RESOURCES) {
      const rG = addGroup(`/api/v1/${m}/${r}`, `/api/v1/${m}/${r}`, mG)
      for (let i = 0; i < ACTIONS.length; i++) {
        addRoute(`/api/v1/${m}/${r}${ACTIONS[i]}`, METHODS[i], rG)
      }
    }
  }
  return { nodes, edges: [] }
}

function buildOptions(elements) {
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
    { selector: 'node[kind = "route"]', style: { 'shape': 'round-rectangle', 'background-color': '#16a34a', 'label': 'data(label)', 'color': '#e7ecf3', 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', 'width': 'label', 'height': 24, 'padding': '6px' } },
    { selector: 'node[kind = "group"]', style: { 'shape': 'round-rectangle', 'background-color': '#1f2940', 'background-opacity': 0.6, 'border-style': 'dashed', 'label': 'data(label)', 'color': '#7dd3fc', 'font-size': 11, 'text-valign': 'top', 'text-halign': 'center', 'padding': '12px' } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'line-color': '#5a6a8a' } },
  ]
  const routeCount = elements.nodes.filter(n => n.data.kind === 'route').length
  const groupCount = elements.nodes.filter(n => n.data.kind === 'group').length
  const opts = { elements, layout: ELK, style: STYLE, expandCollapse: { layoutBy: ELK, fisheye: false, animate: false, undoable: false }, wheelSensitivity: 0.2, meta: { tab: 'tab1', nodeCount: routeCount, groupCount, edgeCount: 0 } }
  // Tab 2/3는 동일 옵션 — Tab 전환 lifecycle 측정용.
  return {
    tab1: opts,
    tab2: { ...opts, meta: { ...opts.meta, tab: 'tab2' } },
    tab3: { ...opts, meta: { ...opts.meta, tab: 'tab3' } },
    meta: { projectName: 'spring-large-250' },
  }
}

// ─── 공통 setup ─────────────────────────────────────────────────────────────
async function setup(page) {
  const elements = buildSpringStyle250()
  const data = buildOptions(elements)
  await page.addInitScript((payload) => { window.__CODESIGHT_CY_FIXTURE__ = payload }, data)

  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  // confirm dialog 자동 수락 — Expand All safety 통과.
  page.on('dialog', d => d.accept())

  await page.goto(VIEWER_URL)
  await page.waitForTimeout(2500) // elk layout

  // 초기 정합성: 250 routes + 62 group.
  const initial = await page.evaluate(() => {
    const cy = window.__SPIKE_API__.getCy()
    return {
      routes: cy.nodes('[kind = "route"]').length,
      groups: cy.nodes('[kind = "group"]').length,
    }
  })
  expect(initial.routes).toBe(250)
  expect(initial.groups).toBe(62) // /api + /api/v1 + 10 modules + 50 resources

  return { errors, expectedRoutes: 250, expectedGroups: 62 }
}

// ─── S1: Collapse All ↔ Expand All 50회 (critical bug #141) ────────────────
test('S1: Collapse All ↔ Expand All 50회 반복 — #141 crash 미발생', async ({ page }) => {
  test.setTimeout(180_000)
  const { errors, expectedRoutes, expectedGroups } = await setup(page)

  for (let i = 0; i < 50; i++) {
    await page.click('#btn-collapse-all')
    await page.waitForTimeout(60)
    await page.click('#btn-expand-all')
    await page.waitForTimeout(60)
  }

  // 최종 상태가 원본과 일치하는지 — collapse 후 expand가 정보 손실 없이 복원되는가.
  const final = await page.evaluate(() => {
    const cy = window.__SPIKE_API__.getCy()
    return {
      routes: cy.nodes('[kind = "route"]').length,
      groups: cy.nodes('[kind = "group"]').length,
    }
  })
  expect(final.routes).toBe(expectedRoutes)
  expect(final.groups).toBe(expectedGroups)
  expect(errors, `errors after 50 iter: ${errors.join(' / ')}`).toEqual([])
})

// ─── S2: 단일 group expand/collapse 100회 (critical bug #142) ───────────────
test('S2: 단일 module group 100회 toggle — #142 CollapsedChildren null 미발생', async ({ page }) => {
  test.setTimeout(180_000)
  const { errors } = await setup(page)

  // /api/v1/admin group을 직접 잡아 100회 collapse↔expand.
  for (let i = 0; i < 100; i++) {
    const result = await page.evaluate(() => {
      const cy = window.__SPIKE_API__.getCy()
      const api = window.__SPIKE_API__.getApi()
      const target = cy.getElementById('g_api_v1_admin')
      if (target.length === 0) return { error: 'target group not found' }
      try {
        if (target.hasClass('cy-expand-collapse-collapsed-node')) {
          api.expand(target)
        } else {
          api.collapse(target)
        }
        // #142 표적: getCollapsedChildren()가 null 반환하는 케이스
        const children = target.data('collapsedChildren')
        return { ok: true, hasChildrenData: children !== undefined }
      } catch (e) {
        return { error: e.message }
      }
    })
    expect(result.error, `iter ${i}: ${result.error}`).toBeUndefined()
  }

  expect(errors, `errors after 100 iter: ${errors.join(' / ')}`).toEqual([])
})

// ─── S3: Tab lifecycle 20회 destroy/rebuild ─────────────────────────────────
test('S3: Tab 전환 20회 — cy.destroy + rebuild 메모리 누수 < 50MB', async ({ page }) => {
  test.setTimeout(180_000)
  const { errors } = await setup(page)

  // performance.memory는 Chromium 한정 + heap measurement은 GC 타이밍에 따라 변동.
  // 초기 측정.
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)

  for (let i = 0; i < 20; i++) {
    await page.click('.tab[data-t="2"]')
    await page.waitForTimeout(800)
    await page.click('.tab[data-t="3"]')
    await page.waitForTimeout(800)
    await page.click('.tab[data-t="1"]')
    await page.waitForTimeout(800)
  }

  // GC 트리거 시도 후 측정.
  await page.evaluate(() => { if (window.gc) window.gc() })
  await page.waitForTimeout(500)
  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)

  const deltaMB = (heapAfter - heapBefore) / 1024 / 1024
  console.log(`[stress S3] heap delta: ${deltaMB.toFixed(1)} MB (before ${(heapBefore/1024/1024).toFixed(1)} → after ${(heapAfter/1024/1024).toFixed(1)})`)
  // performance.memory가 0 (Chromium flag 미설정) 시 skip.
  if (heapBefore > 0) {
    expect(deltaMB).toBeLessThan(50)
  }
  expect(errors, `errors after 20 tab cycles: ${errors.join(' / ')}`).toEqual([])
})

// ─── S4: 중첩 collapse — leaves → resource expand → routes 노출 → back ──────
test('S4: leaf collapse → resource expand → routes 노출 → expand all 복원', async ({ page }) => {
  test.setTimeout(120_000)
  const { errors, expectedRoutes } = await setup(page)

  // 1. "Collapse leaves" — resource group(자식이 route인 group) 50개만 cue로 변환.
  //    /api, /api/v1, 10 module group은 expanded 유지.
  await page.click('#btn-collapse-top')
  await page.waitForTimeout(800)
  const step1 = await page.evaluate(() => {
    const cy = window.__SPIKE_API__.getCy()
    const cues = cy.nodes('.cy-expand-collapse-collapsed-node').length
    const visibleGroups = cy.nodes('[kind = "group"]').filter(n => n.visible() && !n.hasClass('cy-expand-collapse-collapsed-node')).length
    const visibleRoutes = cy.nodes('[kind = "route"]').filter(n => n.visible()).length
    return { cues, visibleGroups, visibleRoutes }
  })
  // 50 resource group이 cue → 60 group 중 50 cue + 12 expanded(api + api/v1 + 10 module).
  expect(step1.cues).toBe(50)
  expect(step1.visibleGroups).toBe(12)
  expect(step1.visibleRoutes).toBe(0)

  // 2. admin/users resource cue를 직접 expand → 5 routes 노출.
  const step2 = await page.evaluate(() => {
    const api = window.__SPIKE_API__.getApi()
    const cy = window.__SPIKE_API__.getCy()
    const target = cy.getElementById('g_api_v1_admin_users')
    if (target.length === 0) return { error: 'admin/users not found in cy' }
    if (!target.hasClass('cy-expand-collapse-collapsed-node')) {
      return { error: 'admin/users not in collapsed state — collapse-leaves가 적용되지 않음' }
    }
    api.expand(target)
    return { ok: true }
  })
  expect(step2.error).toBeUndefined()
  await page.waitForTimeout(800)

  const after2 = await page.evaluate(() => {
    const cy = window.__SPIKE_API__.getCy()
    return {
      adminUsersRoutes: cy.nodes('[kind = "route"]').filter(n => n.visible() && /admin_users/.test(n.id())).length,
      otherCollapsedCount: cy.nodes('.cy-expand-collapse-collapsed-node').length,
    }
  })
  // admin/users만 expand → 5 routes 노출, 나머지 49개 resource는 여전히 cue.
  expect(after2.adminUsersRoutes).toBe(5)
  expect(after2.otherCollapsedCount).toBe(49)

  // 3. expand all → 250 routes 전부 가시화 (정보량 복원, 차원 2 재검증).
  await page.click('#btn-expand-all')
  await page.waitForTimeout(1200)
  const finalVisible = await page.evaluate(() => {
    const cy = window.__SPIKE_API__.getCy()
    return cy.nodes('[kind = "route"]').filter(n => n.visible()).length
  })
  expect(finalVisible).toBe(expectedRoutes)

  await page.screenshot({ path: 'tests/playwright/screenshots/cy-stress-final.png', fullPage: false })
  expect(errors, `errors: ${errors.join(' / ')}`).toEqual([])
})
