# FE Diagram Standard (v1.0)

작성: 2026-05-20 · v1.2.44 진입 직전 표준 amendment 포함

## 0. 배경

v1.2.42에서 React Router Tab1/2/3 전면 재설계 + file-based FE 6종 Tab2 일반화(`buildFeFileTreeScreenDiagram`) → v1.2.43에서 config-based FE 어댑터(Vue SPA·Angular)도 Tab1 wrapper 표준 적용. v1.2.44에서 다음을 마무리:

1. React Router map 패턴 라우트 회귀 해소 (F-Route-1·2·3)
2. Vue SPA·Angular Tab2도 file-tree 표준 진입 (component 참조 추적으로 route.filePath 치환)
3. Tab2 1-depth import 추가 (page → child component leaf)
4. **Tab3 라벨 'DB-Screen' → 'Data Flow' 격상** (표준 amendment)
5. FE-DIAGRAM-STANDARD 단일진실 문서 수립 (본 문서)

본 문서는 FE Tab1/2/3 시각화의 단일 진실 소스로, `BE-DIAGRAM-STANDARD.md`와 쌍을 이룬다.

## 1. 절대원칙 — 사용자 표준 2개

### 표준 1 — 디렉터리 구조 트리 X/Y축 배치

- 동일 Depth = X축으로 나란히
- 최종 Depth 이후 leaf 내부 contents = Y축으로 아래

이는 BE 표준 R-T1.4·R-T1.5와 동일 사상이며, FE에서도 Tab1 인프라 wrapper와 Tab2 file-tree 모두 적용.

### 표준 2 — 각 Tab의 목적 부합 (v1.2.44 amendment)

| Tab | 목적 | v1.2.43 까지 | v1.2.44 amendment |
|---|---|---|---|
| Tab1 | Rendering Architecture | 어떤 인프라/엔진이 어떤 라우트를 렌더하는가 | (동일) |
| Tab2 | Screen–Component | 각 화면이 어떤 컴포넌트들로 구성되는가 | (동일) + 1-depth import child 표시 |
| **Tab3** | **Data Flow** | "DB-Screen" — 어떤 화면이 어떤 DB 테이블에 접근하는가 | **"Data Flow" — 어떤 화면이 어떤 데이터 소스(DB 테이블 ∪ 외부 API endpoint)에 접근하는가** |

**왜 Tab3 격상**: BE/DB 연동이 없는 순수 FE 프로젝트(예: React Router SPA + 외부 API)에서 Tab3는 v1.2.42부터 `buildFeApiCallDiagram`(Screen ↔ API endpoint)을 렌더. 이는 "DB-Screen" 라벨과 부합하지 않았다. 본 amendment는 라벨·구현·표준을 일치시킨다. BE/DB 어댑터는 기존 ER 다이어그램이 그대로 'Data Flow'의 한 케이스로 포함된다.

## 2. Tab1 — Rendering Architecture (FE)

### 2.1 구조 (개념)

```
🌐 Browser
  └─ Hosting Platform (e.g., Vercel)
       └─ Runtime (e.g., Node.js)
            └─ Framework (e.g., Next.js App Router)
                 └─ Rendering Engine (e.g., React)
                      └─ Route Tree (디렉토리 X/Y축, R-T1.4)
                           └─ External (API Gateway / DB / Auth)
```

### 2.2 규칙

| 규칙 | 정의 |
|---|---|
| **R-T1.1 인프라 wrapper** | BROWSER → PLATFORM(또는 ROUTER) → RUNTIME → FRAMEWORK → ENGINE 다층 subgraph. 어댑터별 wrapper 라벨은 metadata 기반(`buildNestedSubgraphLines`). |
| **R-T1.2 라우트 트리** | 최내부 ENGINE wrapper 안에 라우트 nested subgraph. 동일 directory depth = X축, 자식 directory = Y축 (표준 1). |
| **R-T1.3 동적 segment** | `[id]` / `:id` 등 dynamic segment는 별도 `dyn_<name>` subgraph로 묶어 시각 구분. |
| **R-T1.4 group route (Next App Router)** | `(marketing)` 등 group route도 별도 subgraph. URL에는 노출 안 되지만 디렉토리 구조 보존. |
| **R-T1.5 외부 분기** | 별도 subgraph로 `🗄 DB Tables` · `🌐 External API` · `🔥 Firebase` · `📦 Dexie` 등 분기. 우선순위: backends > Supabase > Prisma > Firebase > Dexie > hasExternalAPI > apiCallEdges (LLM enabled 시 backends 우선). |
| **R-T1.6 renderingMode 클래스** | `:::ssr` (서버) / `:::csr` (클라이언트) / `:::ssg` / `:::isr` / `:::ppr` / `:::unk` (미상). |
| **R-T1.7 chunking** | top-level branching group이 임계값 초과 시 chunk 분할 (`SINGLE_DIAGRAM_ROUTE_THRESHOLD=100`). |

## 3. Tab2 — Screen–Component (FE)

### 3.1 구조

화이트리스트 어댑터(R-T2.1)에 대해 `buildFeFileTreeScreenDiagram` 적용:

```
subgraph products[📁 /products]
  subgraph dyn_id[[id]]
    route_products_id["[id] · SSR"]              ← 라우트 노드
    file_page["📂 app/products/[id]<br/>📄 page.tsx"]  ← 페이지 파일 leaf
    route_products_id --> file_page                  ← Y축 edge (R-T2.2)
    file_page --> comp_detail                        ← 1-depth import (R-T2.4)
    file_page --> comp_related
    file_page --> comp_addcart
  end
end

%% Shared component: 단일 노드 + fan-in (R-T2.5 Sub-1)
file_page_other --> comp_button
file_page --> comp_button
```

### 3.2 규칙

| 규칙 | 정의 |
|---|---|
| **R-T2.1 화이트리스트** | `isFileTreeTab2Eligible`: nextjs-app-router · nextjs-pages · nuxt · sveltekit · remix · react-router · **vue-spa**(v1.2.44+) · **angular**(v1.2.44+). LLM-only(vite-react·expo)는 legacy `renderScreenSection` fallback. |
| **R-T2.2 라우트 → 파일 leaf** | 각 라우트 노드 옆/아래에 `📂 dir<br/>📄 filename` 형태의 파일 leaf 노드 + `route → file` Y축 edge. |
| **R-T2.3 디렉토리 그룹 subgraph** | URL prefix 공유 라우트들은 directory subgraph로 묶음 (표준 1 X축 배치). |
| **R-T2.4 1-depth import child (v1.2.44+)** | page 컴포넌트의 직접 import(importDepth=1)된 internal component 파일을 `file_page --> child_file` Y축 edge로 표시. routeFileKind === 'page' 가드(layout/loading import 차단). |
| **R-T2.5 Sub-1 shared component** | 동일 component가 N page에서 import되면 노드 1회만 emit + 각 page → component edge N개 (fan-in). `fileNodeRendered: Set<string>` 가드 활용. |
| **R-T2.6 Sub-2 page → page import** | drill-down 라우트 간 page → page import도 동일하게 1-depth import edge 표시. routeFileKind 필터 제거(page만이 from). |
| **R-T2.7 외부 lib 자동 필터** | IR `componentNodes`에 등록되지 않은 import target(외부 lib)은 `compById.get(...) === undefined` → 자동 누락. |
| **R-T2.8 chunk 게이트** | `branchingGroups.length > TAB2_GROUPS_PER_ROW && pageRoutes.length > SINGLE_DIAGRAM_ROUTE_THRESHOLD` 시 group별 chunk 분할 (chunked 경로는 v1.2.43 시점 react-router 분기 미적용, v1.2.44에서도 변경 없음). |
| **R-T2.9 LLM-only 어댑터 가드** | vite-react·expo는 importsEdges 0건 → child 생략, file leaf만 표시 (현행 보존). |

### 3.3 Vue SPA · Angular 컴포넌트 추적 (v1.2.44 A1-1·A1-2)

| 어댑터 | 추적 패턴 | filePath 치환 |
|---|---|---|
| vue-spa | `component: () => import('./Foo.vue')` (dynamic) · `component: FooComp` (sync) | 모듈 spec resolve → `.vue`·`.ts`·`.tsx`·`.js`·`.jsx` 확장자 fallback, abs path → `path.relative(repoRoot, ...)` |
| angular | `component: FooComponent` (Identifier sync) · `loadComponent: () => import('./foo').then(m => m.Foo)` (dynamic) | 동일. `loadChildren`은 자체 모듈이라 fallback 유지. |

resolve 실패 시 fallback: routes 정의 파일의 relPath (회귀 가드, 표시는 가능).

## 4. Tab3 — Data Flow (FE)

### 4.1 케이스 분기

| 조건 | 렌더링 |
|---|---|
| `metadata.adapterCategory === 'BE' \|\| tableCount > 0` | **DB ER 다이어그램** + `Queries` edge (Repository·Route → Table). |
| 위 미해당 + `hasReactRouter`(또는 다른 FE) + `tableCount === 0` | **Screen ↔ API endpoint 다이어그램** (`buildFeApiCallDiagram` — v1.2.42부터 도입). |

### 4.2 규칙

| 규칙 | 정의 |
|---|---|
| **R-T3.1 라벨 'Data Flow' (v1.2.44+)** | 격상 라벨. UI 탭(`webview.ts`), export MD 헤더(`db-screen.md`의 첫 줄 "# Data Flow (Screen ↔ Data Source)"), i18n key `tab.dbScreen` 모두 일관. **기존 'DB-Screen'은 한 케이스의 부속 표현으로 흡수**. |
| **R-T3.2 DB 케이스 ER** | MySQL Workbench 스타일 ER + `queries` edge. 컬럼 헤더 + PK/FK 표시. v1.2.2부터 표준. |
| **R-T3.3 API 케이스 endpoint** | 라우트별 endpoint 노드 + `method path` 라벨 + 라이브러리(axios/fetch/react-query) 표시. confidence='inferred'면 dashed edge(`-.->`). v1.2.42 React Router에 처음 도입. |
| **R-T3.4 empty 분기** | 두 케이스 모두 해당 안 되면 empty state ("no data flow detected"). |

## 5. 어댑터별 적용표

| 어댑터 | 라우트 식별 | Tab2 file-tree (R-T2.1) | Tab2 imports child (R-T2.4) | Tab3 케이스 |
|---|---|---|---|---|
| nextjs-app-router | 디렉토리 = URL | ✅ | ✅ | DB 또는 API |
| nextjs-pages | `pages/*.tsx` | ✅ | ✅ | DB 또는 API |
| nuxt | `pages/*.vue` | ✅ | ✅ | DB 또는 API |
| sveltekit | `routes/+page.svelte` | ✅ | ✅ | DB 또는 API |
| remix | `app/routes/*` | ✅ | (imports 미수집) | DB 또는 API |
| react-router | `createBrowserRouter` 또는 `<Routes>` JSX | ✅ | (imports 미수집) | DB 또는 API |
| **vue-spa** (v1.2.44) | `createRouter({ routes: [...] })` + component import 추적 | ✅ | ✅ | DB 또는 API |
| **angular** (v1.2.44) | `provideRouter(routes)` + Identifier/loadComponent 추적 | ✅ | ✅ | DB 또는 API |
| vite-react (LLM-only) | LLM | ⚠ legacy fallback | — | API (LLM 추정) |
| expo (LLM-only) | LLM | ⚠ legacy fallback | — | (해당 없음) |

## 6. 검증 fixture

| 어댑터 | fixture | 검증 포인트 |
|---|---|---|
| react-router | mini-react-router-app · jsx-app · jsx-expr · map-prefix · overload · **map-import-app**(v1.2.44 신규, F-Route-1·2·3) | 라우트 N건 + elementComponent 매핑 + inferenceChain |
| vue-spa | mini-vue-spa-app | filePath 치환 + Tab2 file-tree |
| angular | mini-angular-app | filePath 치환 + forRoot/forChild + loadChildren fallback |
| file-based 6 | mini-next-app · mini-nextpages-app · mini-nuxt-app · mini-sveltekit-app · mini-remix-app · (react-router 위) | snapshot 회귀 0건 |

## 7. 변경 이력

- **v1.0** (2026-05-20, v1.2.44 진입 직전): 초안 작성. BE-DIAGRAM-STANDARD.md와 쌍. Tab3 라벨 'Data Flow' 격상 표준 amendment.

## 부록 — 참조 메모리·코드

- 절대원칙 메모리: [project_v144_fe_improvement](../../memory-export/project_v144_fe_improvement.md) (활성)
- BE 짝: [BE-DIAGRAM-STANDARD.md](./BE-DIAGRAM-STANDARD.md)
- 핵심 코드: `packages/renderer/src/mermaid-renderer.ts` (isFileTreeTab2Eligible · buildFeFileTreeScreenDiagram · emitRouteAndFileLeaf · buildDbScreenDiagram · buildFeApiCallDiagram) · `packages/core/src/adapters/{vue-spa,angular,reactrouter}/parsers/route-parser.ts`
- Phase Lifecycle: [feedback_phase_lifecycle_workflow](../../memory-export/feedback_phase_lifecycle_workflow.md)
