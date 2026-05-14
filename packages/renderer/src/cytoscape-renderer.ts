// Cytoscape adapter (Task 1 PoC). webview에서 사용할 cy 구성 옵션 생성.
// .codesight/*.mmd 정적 출력에는 영향 없음 (mermaid-renderer.ts와 sibling).

import type { IRGraph } from '@codebase-viz/types'
import {
  buildTab1Elements,
  buildTab2Elements,
  buildTab3Elements,
  type CytoscapeElements,
} from './cytoscape-mapper.js'

// cytoscape 외부 타입을 직접 import하지 않는다 (webview-only 의존성).
// Options shape는 cytoscape@3.x 공식 API 기준 — minimal subset.
export interface CytoscapeOptions {
  elements: CytoscapeElements
  // cytoscape layout — 'elk' plugin이 webview에 로드되어 있어야 한다.
  layout: Record<string, unknown>
  style: Array<{ selector: string; style: Record<string, unknown> }>
  // expand-collapse 플러그인 옵션 (cy 초기화 후 expandCollapse() 호출 시 사용).
  expandCollapse: Record<string, unknown>
  wheelSensitivity: number
  // PoC scope: metadata for viewer 보조 표시.
  meta: {
    tab: 'tab1' | 'tab2' | 'tab3'
    nodeCount: number
    groupCount: number
    edgeCount: number
  }
}

// Day 0 spike 검증된 elk layered hierarchical 옵션.
const ELK_LAYERED: Record<string, unknown> = {
  name: 'elk',
  elk: {
    algorithm: 'layered',
    'elk.direction': 'DOWN',
    'elk.spacing.nodeNode': 18,
    'elk.layered.spacing.nodeNodeBetweenLayers': 30,
    'elk.padding': '[top=24,left=24,bottom=24,right=24]',
  },
}

const EXPAND_COLLAPSE_OPTS: Record<string, unknown> = {
  layoutBy: ELK_LAYERED,
  fisheye: false,
  animate: false,
  undoable: false,
}

// Day 0 spike에서 검증된 다크 테마 (viewer.html 기존 톤과 통일 — #060810 / #0c1a30).
const TAB1_STYLE = [
  {
    selector: 'node[kind = "route"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#16a34a',
      'border-width': 1,
      'border-color': '#0f5132',
      'label': 'data(label)',
      'color': '#e7ecf3',
      'font-size': 10,
      'text-valign': 'center',
      'text-halign': 'center',
      'width': 'label',
      'height': 24,
      'padding': '6px',
      'text-overflow-wrap': 'ellipsis',
    },
  },
  // renderingMode 별 보조 색상 (mermaid classDef ssr/csr/ssg/isr/ppr/unk 동등).
  { selector: 'node[renderingMode = "CSR"]', style: { 'background-color': '#c2410c', 'border-color': '#7c2d12' } },
  { selector: 'node[renderingMode = "SSG"]', style: { 'background-color': '#7c3aed', 'border-color': '#5b21b6' } },
  { selector: 'node[renderingMode = "ISR"]', style: { 'background-color': '#ca8a04', 'border-color': '#854d0e' } },
  { selector: 'node[renderingMode = "PPR"]', style: { 'background-color': '#2563eb', 'border-color': '#1e3a8a' } },
  { selector: 'node[renderingMode = "unknown"]', style: { 'background-color': '#374151', 'border-color': '#1f2937' } },
  {
    selector: 'node[kind = "group"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#1f2940',
      'background-opacity': 0.6,
      'border-width': 1,
      'border-color': '#3a4b7a',
      'border-style': 'dashed',
      'label': 'data(label)',
      'color': '#7dd3fc',
      'font-size': 11,
      'font-weight': 'bold',
      'text-valign': 'top',
      'text-halign': 'center',
      'padding': '12px',
    },
  },
  // infra compound (Vercel / Browser / Mobile + Runtime + Framework + Engine).
  {
    selector: 'node[kind = "infra"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#0b1424',
      'background-opacity': 0.5,
      'border-width': 1,
      'border-color': '#1e3a8a',
      'border-style': 'solid',
      'label': 'data(label)',
      'color': '#93c5fd',
      'font-size': 12,
      'font-weight': 'bold',
      'text-valign': 'top',
      'text-halign': 'center',
      'padding': '20px',
    },
  },
  // backend service compound (⚙ NestJS / Spring 등).
  {
    selector: 'node[kind = "backend"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#1a0d1a',
      'background-opacity': 0.6,
      'border-width': 1,
      'border-color': '#7c3aed',
      'border-style': 'solid',
      'label': 'data(label)',
      'color': '#c4b5fd',
      'font-size': 12,
      'font-weight': 'bold',
      'text-valign': 'top',
      'text-halign': 'center',
      'padding': '18px',
    },
  },
  // db node (PostgreSQL / MySQL / Mongo).
  {
    selector: 'node[kind = "db"]',
    style: {
      'shape': 'cylinder',
      'background-color': '#0d1a0d',
      'border-width': 2,
      'border-color': '#16a34a',
      'label': 'data(label)',
      'color': '#86efac',
      'font-size': 11,
      'font-weight': 'bold',
      'text-valign': 'center',
      'text-halign': 'center',
      'width': 90,
      'height': 60,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'width': 1,
      'line-color': '#5a6a8a',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#5a6a8a',
    },
  },
  // inferred edge는 점선.
  {
    selector: 'edge[confidence = "inferred"]',
    style: { 'line-style': 'dashed', 'line-color': '#94a3b8' },
  },
  // FE↔BE REST edge — 굵은 점선 + 보라.
  {
    selector: 'edge[edgeKind = "fe-be-call"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#c4b5fd',
      'target-arrow-color': '#c4b5fd',
      'width': 2,
      'label': 'REST',
      'color': '#c4b5fd',
      'font-size': 9,
      'text-background-color': '#0c1a30',
      'text-background-opacity': 0.8,
      'text-background-padding': 2,
    },
  },
  // FK edge — 주황 점선.
  {
    selector: 'edge[edgeKind = "fk"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#fb923c',
      'target-arrow-color': '#fb923c',
      'width': 1.5,
    },
  },
  // expand-collapse cue 노드 스타일.
  {
    selector: '.cy-expand-collapse-collapsed-node',
    style: { 'background-color': '#7c3aed', 'border-color': '#5b21b6' },
  },
]

// Tab2 — component tree. route는 호스트 prefix 표시용, component가 본체.
const TAB2_STYLE = [
  ...TAB1_STYLE,
  {
    selector: 'node[kind = "component"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#2563eb',
      'border-color': '#1e3a8a',
      'label': 'data(label)',
      'color': '#e7ecf3',
      'font-size': 10,
      'text-valign': 'center',
      'text-halign': 'center',
      'width': 'label',
      'height': 24,
      'padding': '6px',
    },
  },
  {
    selector: 'node[runtime = "client"]',
    style: {
      'background-color': '#c2410c',
      'border-color': '#7c2d12',
    },
  },
  {
    selector: 'edge[edgeKind = "renders"]',
    style: { 'line-color': '#16a34a', 'target-arrow-color': '#16a34a' },
  },
  {
    selector: 'edge[edgeKind = "imports"]',
    style: { 'line-color': '#7dd3fc', 'target-arrow-color': '#7dd3fc' },
  },
]

const TAB3_STYLE = [
  ...TAB1_STYLE,
  {
    selector: 'node[kind = "table"]',
    style: {
      'shape': 'round-rectangle',
      'background-color': '#7c3aed',
      'border-color': '#5b21b6',
      'label': 'data(label)',
      'color': '#e7ecf3',
      'font-size': 11,
      'text-valign': 'center',
      'text-halign': 'center',
      'width': 'label',
      'height': 28,
      'padding': '8px',
    },
  },
  {
    selector: 'edge[edgeKind = "queries"]',
    style: { 'line-color': '#fb923c', 'target-arrow-color': '#fb923c' },
  },
]

function makeMeta(els: CytoscapeElements, tab: 'tab1' | 'tab2' | 'tab3'): CytoscapeOptions['meta'] {
  const groups = els.nodes.filter(n => n.data.kind === 'group').length
  return {
    tab,
    nodeCount: els.nodes.length - groups,
    groupCount: groups,
    edgeCount: els.edges.length,
  }
}

export function buildTab1CytoscapeOptions(graph: IRGraph, maxDepth?: number): CytoscapeOptions {
  const elements = buildTab1Elements(graph, maxDepth)
  return {
    elements,
    layout: ELK_LAYERED,
    style: TAB1_STYLE,
    expandCollapse: EXPAND_COLLAPSE_OPTS,
    wheelSensitivity: 1.0,
    meta: makeMeta(elements, 'tab1'),
  }
}

export function buildTab2CytoscapeOptions(graph: IRGraph, maxDepth?: number): CytoscapeOptions {
  const elements = buildTab2Elements(graph, maxDepth)
  return {
    elements,
    layout: ELK_LAYERED,
    style: TAB2_STYLE,
    expandCollapse: EXPAND_COLLAPSE_OPTS,
    wheelSensitivity: 1.0,
    meta: makeMeta(elements, 'tab2'),
  }
}

export function buildTab3CytoscapeOptions(graph: IRGraph): CytoscapeOptions {
  const elements = buildTab3Elements(graph)
  return {
    elements,
    layout: ELK_LAYERED,
    style: TAB3_STYLE,
    expandCollapse: EXPAND_COLLAPSE_OPTS,
    wheelSensitivity: 1.0,
    meta: makeMeta(elements, 'tab3'),
  }
}
