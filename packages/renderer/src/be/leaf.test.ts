import { describe, it, expect } from 'vitest'
import { createRouteNode, makeNodeId } from '@codebase-viz/types'
import { emitControllerFileLeaf } from './leaf.js'

function makeRoute(filePath: string, urlPath: string, httpMethod: string) {
  return createRouteNode({
    id: makeNodeId('route', filePath, `${urlPath}:${httpMethod}`),
    path: urlPath,
    filePath,
    routeFileKind: 'page',
    dynamicSegmentType: 'static',
    isGroupRoute: false,
    renderingMode: 'SSR',
    httpMethod,
    provenance: { file: filePath, line: 1, adapter: 'test', analyzerVersion: '0.1' },
    confidence: 'verified',
  })
}

const FILE = 'src/main/java/com/example/deco/controller/DecoSheetController.java'

describe('emitControllerFileLeaf — endpoint collapse (개선 C: 메서드 bold + 1행)', () => {
  it('endpoints subgraph를 폐기하고 leaf 노드 안 markdown multiline으로 흡수', () => {
    const routes = [
      makeRoute(FILE, '/api/deco', 'GET'),
      makeRoute(FILE, '/api/deco/list', 'GET'),
      makeRoute(FILE, '/api/deco', 'POST'),
    ]
    const { leafId, lines } = emitControllerFileLeaf('  ', FILE, routes)
    const out = lines.join('\n')

    // 구 구조 폐기
    expect(out).not.toMatch(/subgraph endpoints_/)
    expect(out).not.toMatch(/ --- /) // route 간 체인 폐기
    expect(out).not.toMatch(/--> endpoints_/) // leaf→subgraph 엣지 폐기

    // 신규: 단일 leaf 노드 + mermaid markdown 문자열(htmlLabels:false 호환)
    expect(out).toContain(`${leafId}["\``)
    expect(out.trimEnd()).toMatch(/`"\]:::ssr$/)

    // 메서드 bold + suffix (prefix /api/deco strip 후 /, /list)
    expect(out).toContain('**GET** /')
    expect(out).toContain('**GET** /list')
    expect(out).toContain('**POST** /')

    // 컨트롤러 헤더 보존 (개선 C: 이름 bold)
    expect(out).toContain('📄 **DecoSheetController**')
  })

  it('markdown 메타문자(_ * `)를 이스케이프해 italic/bold 오해석 방지', () => {
    const routes = [makeRoute(FILE, '/api/user_profile/detail_view', 'GET')]
    const { lines } = emitControllerFileLeaf('  ', FILE, routes)
    const out = lines.join('\n')
    expect(out).toContain('\\_') // _ 이스케이프
    expect(out).not.toMatch(/[^\\]_[a-z]/) // 비이스케이프 _ 없음
  })

  it('route 0개면 endpoint 라인 없이 단일 leaf 노드만', () => {
    const { leafId, lines } = emitControllerFileLeaf('  ', FILE, [])
    const out = lines.join('\n')
    expect(out).toContain('📄 DecoSheetController')
    expect(out).not.toMatch(/subgraph/)
    expect(out).not.toContain('**')
    expect(lines.length).toBeGreaterThan(0)
    expect(leafId).toBe('leaf_DecoSheetController')
  })
})
