# Node ID Conventions

`makeNodeId(kind, repoRelativePath, symbol)` → deterministic NodeId.
이 문서는 어댑터별 `symbol` 인자 컨벤션을 정리한다. v1.2.47 /refactoring 사이클에서 통합 시도 결과 — 각 어댑터의 파싱 전략 차이에서 필연적 → **컨벤션 통일은 부적합**. 본 표는 신규 어댑터 추가 시 참조용.

## 어댑터별 symbol 컨벤션

### Route Node

| 어댑터 | symbol 패턴 | 예시 | 호출 위치 |
|---|---|---|---|
| nextjs | `RouteFileKind` 또는 `${kind}:${method}` | `'page'` / `'route-handler:GET'` | route-parser.ts:159, 175, 190 |
| sveltekit | `RouteFileKind` | `'page'` / `'layout'` | route-parser.ts |
| nuxt | 파일명 (basename) | `'[id].vue'` | route-parser.ts:128 |
| reactrouter | URL path | `'/users/:id'` | route-parser.ts:697 |
| vue-spa | URL path | `'/home'` | route-parser.ts:246 |
| angular | URL path | `'/dashboard'` | route-parser.ts:337 |
| django | URL path | `'/api/users/'` | urls-parser.ts:336 |
| flask | URL path | `'/api/items/<int:id>'` | route-parser.ts:284 |
| fastapi | `${urlPath}:${httpMethod}` | `'/users/:id:GET'` | decorator-parser.ts:270 |
| springboot | `${urlPath}:${annotationName}` | `'/api/users:GetMapping'` | annotation-parser.ts:221 |
| nestjs | `${className}.${methodName}` | `'UserController.getUser'` | decorator-parser.ts:142 |

### Component Node

| 어댑터 | symbol 패턴 | 예시 |
|---|---|---|
| nextjs-pages | export named 함수명 | `'HomePage'` |
| django | className 또는 funcName | `'UserView'` / `'user_list'` |
| nestjs | className | `'UserService'` |
| fastapi | className | `'UserRepository'` |
| FE 일반 | 컴포넌트명 | `'Header'` |

### Endpoint / 가상 NodeId

| 출처 | symbol 패턴 | 예시 | 비고 |
|---|---|---|---|
| reactrouter api-call-parser | `${method}:${url}` | `'GET:/api/users'` | repoRelativePath = `'virtual'` |
| _shared/cross-graph-matcher | `feCall.url` 자체 | `'http://api/users'` | FE-BE 매칭 critical path |

## 분류

1. **파일 컨벤션 기반** (file-based): nextjs / nextjs-pages / sveltekit / nuxt / remix — `RouteFileKind` 또는 파일명
2. **URL path 기반** (config-based): reactrouter / vue-spa / angular / django / flask
3. **URL + HTTP method 복합**: fastapi
4. **annotation 기반**: springboot
5. **AST class.method**: nestjs

## 변경 시 회귀 위험

NodeId는 `${kind}:${repoRelativePath}:${symbol}` 직렬화. snapshot/엣지의 `from`/`to`/`cross-graph-matcher` 매칭이 직접 참조.

**symbol 컨벤션 변경 시 영향**:
- 해당 어댑터의 모든 IR snapshot `.snap` 파일 변경
- 엣지의 `from`/`to` 필드 동시 변경
- `_shared/cross-graph-matcher`의 FE-BE 매칭 로직: FE의 `feCall.url`을 symbol로 사용 → BE route ID와 매칭 시도. symbol 포맷 일관성이 깨지면 cross-call 엣지 누락 가능

## 권장 사항

- 신규 어댑터 추가 시 위 분류 5종 중 하나를 따른다 (혼합 금지)
- BE 어댑터는 동일 파일 내 다중 라우트 구분 위해 HTTP method 또는 `className.methodName` 권장
- FE config-based 어댑터는 URL path 권장 (라우트 파일 ≠ 컴포넌트 파일이라 파일명 식별력 약함)
- `path.basename(absFilePath)` 패턴(nuxt) 사용은 비추천 — `urlPath` 또는 `routeFileKind` 기반 정규화 검토 (별도 사이클)

## 관련

- `packages/types/src/ir.ts:254` — `makeNodeId` 시그니처
- `packages/types/src/ir.ts:58-62` — `DynamicSegmentType` 4-variant
- `packages/core/src/adapters/_shared/cross-graph-matcher.ts:57, 131` — symbol을 매칭 키로 사용하는 critical path
