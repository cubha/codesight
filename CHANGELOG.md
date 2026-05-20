# Changelog

## [1.2.43] — 2026-05-20

### Changed — config-based FE 어댑터(Vue SPA · Angular) Tab1 wrapper 표준 적용

v1.2.42에서 file-based FE 어댑터 6종에 도입된 `Browser → Router → Engine` 3단 wrapper 표준을 config-based 화면 프레임워크 2종(Vue SPA · Angular)에 균등 적용. FE 어댑터 8종 Tab1 헤더 표현 통일 완성.

- **Tab1 (Rendering Architecture)** — `framework='vue-spa'` 어댑터에 `BROWSER → 🧭 Vue Router · SPA → 💚 Vue · CSR Engine` 3단 wrapper 신규(`InfraInfo.hasVueSpa`, `frontendRef='VUE'`). `framework='angular'` 어댑터에 `BROWSER → 🧭 Angular Router · SPA → 🅰 Angular · CSR Engine` 3단 wrapper 신규(`InfraInfo.hasAngular`, `frontendRef='ANGULAR'`). 도메인별 라우트 nested 트리는 유지. **외부 REST API Gateway 데이터 레이어 분기는 frontendRef 정의로 자동 발동** — Vue SPA·Angular도 axios/fetch 호출 시 `DATALAYER → 🔌 External REST API → API_GATEWAY` 노출(v1.2.42 통합 동작 흡수, 별도 코드 작업 불필요).
- **Tab2 (Screen–Component Mapping)** — config-based 어댑터(`vue-spa`·`angular`)는 `route.filePath`가 라우터 정의 파일(`src/router/index.ts`·`src/app/app.routes.ts` 등)로 통일되어 있어 파일경로 노드 적용 시 모든 라우트가 같은 파일을 가리키게 됨 → 시각 가치 부족. 어댑터에서 컴포넌트 파일을 추적해 route.filePath를 컴포넌트로 매핑하는 보강 작업이 선행 필요. **v1.2.43 SKIP**, v1.2.44+ 어댑터 보강 patch로 분리.
- **Tab3 (DB–Screen Mapping)** — 현행 ER 다이어그램 유지(회귀 0). Vue SPA·Angular는 tables>0 케이스에서 표준 ER 분기 적용.

### Fixed — Expo adapterId 죽은 참조 + over-defensive 분기 정리

v1.2.43 진입 전 화면 프레임워크 vs 플랫폼/빌드 도구 분류 정합성 정리. Expo·Vite는 화면 프레임워크가 아닌 RN 모바일 플랫폼/빌드 도구이므로 별도 어댑터 분기 신설 부적합 — Tab1 메타 표현만 유지.

- `stack-detector.ts:31` — `'expo': { adapterId: 'expo', ... }` 죽은 참조 제거 (registry에 `expo` 어댑터 미등록). `expo`·`vite-react`를 LLM-only 그룹으로 명시 ("화면 프레임워크가 아닌 플랫폼/빌드 도구" 주석).
- `mermaid-renderer.ts:208-209` — `fw.includes('vite')`, `fw.includes('expo')` redundant fallback 제거 (`FrameworkKind` union이 닫혀 있어 unreachable). 명시 `fw === 'vite-react'`, `fw === 'expo'`만 유지. `deployTarget === 'mobile'` LLM fallback은 보존.
- `mermaid-renderer.ts:761-773` — `hasVite`·`hasExpo` wrapper 분기에 의도 주석 보강. "빌드/플랫폼 메타 표현용, 별도 화면 프레임워크 아님. LLM-only 경로에서만 routes 채워짐" 명시.

### Internal

- snapshot: `mini-vue-spa-app` · `mini-angular-app` Tab1 rendering diagram 갱신 (2건).
- verify.sh: 687 PASS · 1 skipped · 회귀 0.
- 폐기 결정(부활 금지): Expo·Vite 별도 화면 프레임워크 어댑터 신설. 두 케이스는 Tab1 메타(빌드/플랫폼)로 충분. 실제 화면은 RN/React/Vue 등이 담당.

## [1.2.42] — 2026-05-20

### Changed — React (react-router) 분석 결과 전면 재설계 + file-based FE 어댑터 6종 Tab2 표준화 + Tab1 외부 API Gateway 분기

React Router SPA 프로젝트 분석에서 Tab1/2/3 콘텐츠가 본질적으로 잘못된 방향이었던 점(단순 라우트 나열·Screen-Component 노드 그래프·React SPA에서 빈 ER 다이어그램)을 해소.

- **Tab1 (Rendering Architecture)** — `framework='react-router'` 어댑터에 한해 `BROWSER → 🧭 React Router · SPA → ⚛ React · CSR Engine` 프레임워크 헤더 wrapper 추가. 도메인별 라우트 nested 트리는 유지. (`InfraInfo.hasReactRouter` 신규). **추가: 외부 REST API Gateway 데이터 레이어 노드** — `apiCallEdges.length > 0` && backends/Supabase/Prisma/Firebase/Dexie/hasExternalAPI 모두 미설정 시 `subgraph DATALAYER → 🔌 External REST API → API_GATEWAY` 신규 분기 발동, library별 라벨 자동 합성(`axios · fetch` 등). 분기 우선순위 = **backends > Supabase > Prisma > Firebase > Dexie > hasExternalAPI > apiCallEdges(신규)** — LLM enabled에서 `metadata.backends` 항상 우선 (회귀 0).
- **Tab2 (Screen–Component Mapping)** — 도메인 nested 트리 + 각 라우트 leaf 옆에 **파일경로 노드(디렉터리 + 파일명)** 노출. Mermaid `<br/>` HTML 라벨로 두 줄 표시. 기존 컴포넌트 이름만 보여주던 방식 폐기. **file-based FE 어댑터 6종 표준화** — `framework='react-router'` 단독에서 **file-based 어댑터 화이트리스트**(`nextjs-app-router` · `nextjs-pages` · `nuxt` · `sveltekit` · `remix` · `react-router`)로 확장. `buildReactRouterScreenDiagram` → **`buildFeFileTreeScreenDiagram`** 개명 + `isFileTreeTab2Eligible(meta)` 헬퍼. **그룹 라우트 `app/(marketing)/about/page.tsx`** · **동적 라우트 `app/blog/[slug]/page.tsx`** 처럼 URL≠파일경로 케이스에서 디렉터리 정보 시각 노출. config-based(`vue-spa`·`angular`)는 v1.2.43+ 평가.
- **Tab3 (DB–Screen Mapping)** — **분기 표준 도입**. `adapterCategory==='BE'` → 현행 ER + Repository 합성 / `framework==='react-router' && tableNodes.length===0` → 신규 **FE API 호출 다이어그램** (axios/fetch/react-query) / 그 외(Next.js+Supabase·Prisma·Vite 등 FE+tables>0) → 현행 ER 그대로 (회귀 0). 사용자 결정: "supabase 등 분석에 대한 내용은 재사용 및 분석 분기 명확하게 구분".

### Added — FE API 호출 정적 분석

- `IREdge.kind`에 `'api-call'` 신규 추가 + `ApiCallInfo { method, path, library }` 메타 필드. 기존 `'calls'`(Spring DI)와 의미 분리.
- `makeNodeId`에 `'endpoint'` 가상 kind 추가 — graph.nodes에는 등록하지 않고 edge target 식별자로만 사용 (method+path 동일 호출 자동 dedupe).
- 신규 `packages/core/src/adapters/reactrouter/parsers/api-call-parser.ts` — `_shared/fe-call-extractor`를 재사용하여 axios.{get,post,put,delete,patch}·fetch·useSWR 호출 추출. `useQuery({queryFn:...})`·`useMutation({mutationFn:...})` 콜백 안의 axios 호출은 ts-morph `forEachDescendant`로 자동 캡처.
- `FeCall`에 `library: 'axios' | 'fetch' | 'react-query'` 필드 신규. Tab3 다이어그램에서 library별 클래스(`apiAxios`/`apiFetch`/`apiQuery`)로 색상 차등.
- template literal 인터폴레이션(`` `/api/x/${id}` ``)은 `confidence='inferred'` + `inferenceChain` 보존 (점선 화살표 표시).

### Fixed — Fixture 보강

- `fixtures/mini-react-partner-mock-app` 7개 Page에 현실적 API 호출 패턴 분산 주입 (axios.{get,post,put,delete} / fetch(POST) / useQuery / useMutation / template literal). package.json에 `axios`·`@tanstack/react-query` 추가.

### Verified — LLM enabled 정적 파서 무손상

`analyzer.ts` mergeGraphs 경로에서 정적 routeNodes·componentNodes·tableNodes·edges는 보존만 되고 변형되지 않음을 회귀 테스트 2건으로 명시:
- LLM `backendServices` 반환 시 `BACKEND_0` 분기 우선, 신규 External API Gateway 분기 미발동
- LLM `backendServices` 없을 때 정적 `api-call` edges 보존되어 External API Gateway 분기 정상 발동

### Verification

- verify.sh **687 PASS**, 1 skipped (회귀 0, 신규 5 케이스 — api-call 파서 3 + LLM 무손상 2)
- snapshot 갱신: mini-react-router-app·mini-react-partner-mock-app Tab1·Tab2·Tab3 + IRGraph summary / file-based 어댑터 5종 Tab2 (mini-next-app·mini-nextpages-app·mini-nuxt-app·mini-sveltekit-app·mini-remix-app)
- 회귀 무영향 검증: mini-spring-*(BE) / mini-vue-spa-app·mini-angular-app(config-based SPA) / Supabase·Prisma·Firebase·Dexie 데이터 레이어 분기

### Scope

본 버전은 **file-based FE 어댑터 6종 + React Router**의 Tab1/2 표준화. **config-based 어댑터(Vue SPA·Angular)와 Expo·Vite 등 다른 FE 스택의 표준 구현은 v1.2.43에서 진행** (project_v143_fe_standard.md). 향후 useQuery/useMutation 자체 hook detection (caller 추적), Next.js Client Component의 react-query 분석 등은 v1.2.44+에서 별도 평가.

## [1.2.41] — 2026-05-19

### Fixed — BE Tab1/Tab2 cluster 영역 어긋남 (v1.2.40 ELK mrtree 결함)

v1.2.40에서 도입된 BE Tab1/Tab2 트리 다이어그램이 ELK mrtree 활성 환경(실제 사용자 webview)에서 cluster wrapper와 자식 트리의 좌표가 어긋남. 패키지 라벨이 박스 좌상단 모서리에 박히고 top-level pkg 노드가 박스 외곽으로 비어져 나오는 시각 결함.

- 근본 원인: `elk.mrtree` 알고리즘이 cluster(subgraph) 내부의 top-level pkg 노드를 floating root로 인식하여 cluster 외곽과 별개 좌표계로 배치. mermaid `~~~` invisible link 폴백 시도도 mrtree에 의해 무력화됨(실측 확인).
- 해결: BE 어댑터의 `buildBeRenderingDiagram`·`buildBeArchitectureDiagram` emitChunk에서 `ELK_MRTREE_PRAGMA` 미emit. dagre layout이 cluster wrapper와 자식 트리를 올바르게 정렬. **v1.2.40 ST4(elk mrtree opt-in)의 BE 적용은 폐기**, FE 다이어그램 영향 없음.
- `HDR_PKG` 헤더는 일반 노드 → `subgraph` wrapper로 전환 + `clusterRoot` edge skip(외곽선은 wrapper가 담당) 패턴 유지.

### Fixed — Tab1 endpoints 가로배치 + Tab2 DI 체인 간격 과대 (ST-FIX-2)

- **Tab1 endpoints subgraph 가로배치**: mermaid v11에서 외부 edge가 들어오는 subgraph는 immediate `direction TB`가 무시되고 outer graph direction을 상속 → dagre가 endpoint route 노드들을 같은 rank(가로)로 정렬하던 결함. `endpoints` 내부 route 노드 사이에 line chain(`---`)을 추가하여 dagre rank 강제 수직 정렬.
- **Tab2 DI 체인 노드 간격 과대**: dagre 기본 rankSpacing=50이 DI subgraph 안의 `Controller → ServiceImpl → Repository` vertical chain을 stretched하고 outer chain 간격까지 키우던 결함. **`BE_RENDERING_INIT`** 신규 정의 — `flowchart.nodeSpacing=25, rankSpacing=8, padding=4` 명시. BE Tab1/Tab2 emitChunk에서 사용, FE 다이어그램 init은 유지(회귀 0).
- **Tab2 DI 간격은 1/3 축소 성공 ✅** / **Tab1 endpoints 내부 Y간격은 통제 불가 ⚠️**: mermaid v11의 nested subgraph가 외부 edge incoming + 내부 chain edge 조합에서 init directive·`mermaid.initialize` 전역 flowchart spacing 옵션 둘 다 무시(실측 확정 — `rankSpacing` 50→8→1 어느 값에도 endpoints 내부 노드 간격 불변). endpoints subgraph 제거(leaf→route vertical chain) 안은 v1.2.41 사용자 검증에서 시각 의미 저하 판단으로 폐기. **endpoints 내부 gap 축소는 v1.3.x BE Phase 2에서 별도 탐색** (mermaid 소스 추적·SVG 후처리·대체 layout 등). 토글 상수 `ENDPOINTS_AS_SUBGRAPH` (mermaid-renderer.ts:38)로 향후 실험 진입 경로 보존.

### Improved — Spring 부수 보강

- DI 파서가 interface 타입 주입(`Controller → Service interface → ServiceImpl`)을 못 잡던 결함에 `${toTypeName}Impl` convention fallback 추가. Spring 표준 패턴(Service interface + Impl) 완전 인식.
- `@Mapper` 어노테이션을 `COMPONENT_ANNOTATIONS`에 추가 — MyBatis Mapper interface가 ComponentNode로 등록.
- `analyzer.ts`가 `metadata.adapterCategory`를 전달하여 BE 렌더러 분기 신뢰성 강화.

### Tests

- 회귀 fixture 2종 신규: `fixtures/mini-spring-partner-mock-app/` (7도메인 21라우트 + MyBatis XML 7개) / `fixtures/mini-react-partner-mock-app/`.
- snapshot 13건 갱신 (mrtree pragma 제거 반영). `verify.sh` 682 PASS, 회귀 0.
- Playwright 시각검증: cluster 영역 어긋남 완전 해소 확인.

## [1.2.40] — 2026-05-19

### Added — BE Tab1/Tab2 트리 다이어그램 표준화 (`docs/design/BE-DIAGRAM-STANDARD.md`)

대규모 BE 프로젝트(985 routes / 422 tables) Tab1/Tab2의 X축 폭발·nested subgraph 가독성 한계를 트리 다이어그램으로 전환. `graph TD` 패키지 트리(패키지=노드, 부모-자식=엣지) + Controller leaf 옆 endpoints subgraph + Tab2 leaf에 Controller→Service→Repository 수직 DI 체인 + top-level 패키지 단위 chunking + **ELK mrtree opt-in**(R-T1.9). FE 회귀 0.

## [1.2.31] — 2026-05-19

### Fixed — LLM 빈 model 문자열 fallback (Gemini "Not Found" 근본 원인)

- **`codesight.model` 설정 default가 빈 문자열(`""`)**이라 VS Code config가 항상 빈 값을 반환 → `analyzWithLLM`에 빈 model이 전달 → Google AI SDK가 empty model path로 호출 → API가 `AI_APICallError: Not Found` (404) 응답. v1.2.3 진단 로깅으로 `model=` 빈 값이 드러나 근본 원인 확정.
- 수정 두 곳: (1) `extension.ts`에서 빈 문자열·공백을 `undefined`로 변환하여 전달, (2) `llm/client.ts`의 `createModel`도 trimmed falsy 가드 추가 → 두 단계 모두 provider별 `DEFAULT_MODELS`로 fallback.
- Provider 미지정 + key 없는 사용자 모두에게 영향이 있었으나 진단 surface 부족으로 Gemini 사례에서만 표면화됨. 본 hotfix로 anthropic/google/openai 모두 동일 보호.

## [1.2.3] — 2026-05-19

### Fixed — v1.2.2 후속 BE 결함 3건

대용량 실제 Spring Boot 프로젝트(985 routes / 422 tables)에서 노출된 결함 일괄 수정.

- **Tab2 "(no BE components found)" × N chunks**: `buildWithChunkFallback`이 라우트 기준으로 graph를 chunk 분할하면서 컴포넌트가 누락된 각 chunk마다 `buildBeArchitectureDiagram`을 호출 → 빈 결과 N회 반복. BE 어댑터인 경우 Tab2의 chunking을 우회하도록 가드 추가.
- **Spring Data JPA `interface Repository` 누락**: `parseSpringComponents`가 `class_declaration`만 처리해 `public interface XxxRepository extends JpaRepository<...>` 패턴(어노테이션 없는 표준)을 인식 못 함 → DI `calls` 엣지의 `to` 매핑 실패. `interface_declaration` 추가 처리 + 이름 패턴(`*Repository|Dao|Mapper`) fallback. 사전 필터에 `JpaRepository`/`CrudRepository`/`PagingAndSortingRepository`/`MongoRepository`/`ReactiveCrudRepository` 키워드 추가.
- **Gemini "Not Found" 에러 표면화 부족**: `analyzWithLLM` 호출부에 try-catch 보강 — provider/model 컨텍스트 + raw 에러 메시지를 사용자에게 surface (`LLM 호출 실패 [provider=… model=…]: …`). 모델 ID 변경/키 권한/엔드포인트 문제를 즉시 식별 가능.

### Improved — Tab1 BE 패키지 경로 기반 nested grouping

기존 File-First 단일 subgraph → 패키지 경로 트리 nested subgraph로 개선. 깊은 패키지 구조(`com.wina.partner.matMgmt.decoSheet.controller.DecoSheetController`)의 도메인 계층이 시각적으로 드러남.

- `src/main/{java,kotlin}/` 자동 감지 후 패키지 segments 추출.
- 모든 Controller가 공유하는 공통 prefix(예: `com.wina`) 자동 strip.
- 마지막 segment가 모두 `controller(s)`이면 strip (Spring 패키지 컨벤션).
- 트리 leaf = Controller 파일 단위 subgraph + URL prefix LCP 자동 추출 유지.

### Added — fixture: `mini-spring-deep-pkg-app`

깊은 패키지(4단계) + interface Repository + 다중 도메인(admin / partner.order / partner.matMgmt.decoSheet) 검증용 픽스처. Tab1 nested grouping + 컴포넌트 파서 interface 처리 회귀 방지.

## [1.2.2] — 2026-05-18

### Added — Spring Boot DI 분석기 + BE 전용 렌더러 3종

기존 어댑터에 BE 카테고리 분기를 도입. FE 렌더러 동작은 변경 없음(회귀 0).

- **`AdapterCategory` 도입 (`FE` | `BE` | `Fullstack`)**: `IAdapter.category` + `IRGraphMetadata.adapterCategory` 추가. 13개 어댑터(Next.js / Next.js Pages / Remix / React Router / Nuxt / SvelteKit / Vue SPA / Angular / NestJS / Spring Boot / Django / FastAPI / Flask)에 카테고리 부여.
- **Spring Boot DI 파서**: tree-sitter Java AST 기반. 필드 주입(`@Autowired private X x`), 생성자 주입(단일 ctor 자동 + `@Autowired` ctor), setter 주입(`@Autowired setX()`) 3종을 감지하여 `calls` 엣지 생성. `confidence:'inferred'` + `inferenceChain` 기록, 중복 엣지 제거.
- **Tab1 BE 렌더러 (File-First grouping)**: Controller 파일 단위로 subgraph를 생성하고 경로 LCP(longest-common-prefix)를 추출해 subgraph 제목에 prefix를 표기, 노드 라벨에는 suffix만 표시 (`📄 UserController [/api/users]` → `GET /:id`).
- **Tab2 BE 렌더러 (3-tier DI architecture)**: Controllers / Services / Repositories / Components 4-tier subgraph + DI `calls` 엣지 렌더링. 이름 휴리스틱(`*Controller` / `*Service(Impl)?` / `*Repository|Dao|Mapper`)으로 자동 분류.
- **Tab3 BE 확장 (Repository cross-ref)**: Repository / Dao / Mapper 컴포넌트를 queries 엣지가 없어도 ER 다이어그램에 표시해 Tab2와 cross-tab 추적이 가능.

### Improved — Tab3 ER 테이블 디자인 (MySQL Workbench 스타일)

- **헤더 / 필드 콘트라스트 강화**: 헤더는 어두운 청회색(`#2a4055`) + 밝은 폰트(`#f8fafc`), 필드(td)는 밝은 배경(`#ffffff` / `#f1f5f9`) + 어두운 폰트(`#1e293b`).
- **`textColor` themeVariable 추가**: 외부 mermaid 렌더러(viewer CSS 인젝션이 없는 환경)에서도 동일한 td 텍스트 색상 보장.

### Fixed

- **CLI에서 `adapterCategory` 누락**: `packages/cli/src/index.ts`가 `IRGraph.metadata`에 `adapterCategory`를 주입하지 않아 CLI 경로에서 BE 분기가 무시되고 FE URL grouping으로 fall-through 되던 결함 수정. `packages/extension/src/analyzer.ts`와 동일 패턴으로 정렬.
- **URL grouper 무한 재귀 가드**: `groupRoutesRecursive`의 `shouldRecurse` 조건을 `routes.length > minGroupSize`에서 `distinctPaths > 1`로 변경. 동일 경로 N개 라우트(예: Spring `@RequestMapping` 동일 경로 여러 HTTP 메서드)에서 더 이상 분기하지 않음.

## [1.2.1] — 2026-05-18

### Fixed

- **Sidebar API key guide for all providers**: Previously only Google (Gemini) showed a key-generation link. Now Anthropic (`console.anthropic.com`) and OpenAI (`platform.openai.com/api-keys`) also display a provider-specific guide link when selected.
- **React Router `.map()` path prefix extraction**: Routes declared as `appRoutes.map(r => <Route path={'/' + r.path} />)` or template-literal form `` path={`/${r.path}`} `` now correctly extract the prefix and produce `/dashboard`, `/settings`, etc. instead of bare `dashboard`.
- **Row-mode initial zoom fixed at 1.0**: Large BE projects (e.g. 975 routes / 33 chunks) were auto-scaled to an unreadable size. Each chunk SVG now starts at 1:1 scale; use scroll-wheel zoom and drag-pan to navigate.

## [1.2.0] — 2026-05-17

### Added — Multi-provider LLM (BYOK 확장)

Anthropic 단일 의존에서 3-provider 지원으로 확장. `@anthropic-ai/sdk` 제거 → Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/google` + `@ai-sdk/openai`).

- **Google Gemini 무료 키 지원**: `gemini-2.5-flash` 기본 모델. Free Tier 1,500 RPD · 1M TPM — 비용 없이 LLM 분석 가능.
- **OpenAI 지원**: `gpt-4o` 기본 모델.
- **Zod 스키마 검증 + 1회 retry**: LLM 응답 파싱 실패 시 자동 재시도.
- **사이드바 AI Provider 드롭다운**: Anthropic / Google (Gemini 무료) / OpenAI 선택. Google 선택 시 aistudio.google.com 발급 안내 링크 표시.
- **기존 Anthropic 키 자동 무중단 마이그레이션**: 첫 실행 시 `codesight.anthropicKey` → `codesight.llm.apiKey.anthropic` 슬롯으로 자동 이전.
- **`codesight.llm.provider` 설정 키 추가**: VS Code Settings에서 provider 전환 가능 (default: `anthropic`).
- **i18n 4로케일 provider 키 추가**: 한국어 · 영어 · 일본어 · 중국어 간체.
- **README LLM Analysis 섹션 추가**: provider 비교 표 · Gemini 3단계 발급 가이드 · Free Tier 한계 명시.

## [1.1.6] — 2026-05-15

### Improved — React Router 분석기 (T1)

`<Routes>` 안의 JSX expression child(`{appRouteElements}`, `{MobileRoutes}` 등)를 1-hop으로 추적해 누락된 라우트를 회수한다.

- **named import 추적**: 기존엔 default import만 importMap에 등록 → named export 라우트 fragment 미발견. 이제 `import { MobileRoutes } from './...'` 패턴도 수집.
- **`{identifier}` 분기**: `extractJsxRouteChildren`에 `JsxExpression` 분기 추가. same-file const, `.map()` 결과, 외부 모듈 export 등 1-hop 케이스 처리.
- **`ParenthesizedExpression` unwrap**: `export const X = ( <>...</> )` 처럼 괄호로 감싼 fragment도 정상 추출.
- **`.map()` 결과는 `inferred`**: 정적 평가 추론임을 명시.
- **미해결 식별자는 stderr 진단**으로 표면화 (RouteNode 미생성 — Less is More).

### Improved — Viewer chunk별 독립 조작 + 그리드 레이아웃 (T3)

`row-mode`의 시각 흐름을 개편: 수직 단일 컬럼 → 화면 폭 기반 자동 wrap 그리드(`repeat(auto-fit, minmax(560px, 1fr))`).

- **chunk별 독립 zoom/pan**: 각 `.row-diagram`이 자체 `ST` 상태(`fitS` × 사용자 `s`)를 가지며, hover된 chunk에만 wheel/drag 적용. `+/-/⌂` 버튼은 모든 chunk에 동일 비율 적용.
- **노드 폰트 floor**: `themeVariables.fontSize='14'` (Tab1/2/3) — 다운스케일된 chunk에서도 텍스트 가독성 확보.
- **fit 모델 변경**: 초기 cell 폭에 맞춰 SVG 다운스케일만, 이후 사용자 조작은 chunk-local. 큰 chunk가 작은 chunk를 가리는 비율 폭발 제거.

### Improved — 트리 X/Y 축 정렬 (T4)

`buildNestedSubgraphLines` / `buildScreenSubgraphLines`에서 자식 subgraph가 `GROUPS_PER_ROW(5)` 초과 시 5개씩 invisible row 래퍼 + `direction LR`로 묶어 "부모 안에서 자식 가로 정렬, depth 변화 시 Y 줄넘김"을 구현.

- mermaid v11 공식 문서 확인: 외부 edge는 **immediate parent subgraph**의 direction만 무시 → ROW wrapper(ancestor) `direction LR`은 유효. Tab2 (route→comp edge 존재)에서도 작동.
- `NestedGroup` tree 구조 보존 — `feedback_render_chunked_path_nested.md` 원칙 준수.

### Fixed — Spring Boot 테스트 디렉토리 노이즈 (T2)

`JAVA_EXCLUDE_DIRS`에 `test` 추가 → `src/test/**`의 `@WebMvcTest` mock controller, integration test stub이 라우트 카운트에 합산되던 결함 해소.

### Removed — Cytoscape PoC

`feature/v2.0-cytoscape-poc` 브랜치의 PoC 자산(`cytoscape-mapper`, `cytoscape-renderer`, `CytoscapePocPanel`, `media/cy/*`, 관련 deps) 일괄 제거. 보류 결정에 따라 mermaid 측 개선(T3/T4)으로 본질 동기 흡수.

---

## [1.1.4] — 2026-05-09

### Improved — Stack Detection

**모노레포 / 멀티서비스 프레임워크 자동 감지**

- **Turbo/Lerna/Nx 모노레포**: 루트 `package.json`에 빌드툴(`turbo`, `concurrently`)만 있는 경우 `apps/`, `packages/`, `services/` 하위 디렉터리를 자동 스캔. 발견된 프레임워크 중 파싱 레벨(L3 > L2 > L1)과 static adapter 보유 여부 기준으로 최적 프레임워크를 선택.
- **루트 package.json 없는 멀티서비스 구조**: `backend/`, `frontend/`, `client/`, `web/`, `server/`, `api/`, `mobile/`, `app/` 등 직접 서비스 디렉터리에서 package.json, requirements.txt, pom.xml을 탐색.
- **전체 최상위 디렉터리 fallback**: 위 두 방법으로도 감지 실패 시 모든 최상위 디렉터리를 순회하여 JS/TS·Python·Java·Flutter 프레임워크 탐색.
- **Flutter 감지 추가**: 루트 또는 하위 디렉터리의 `pubspec.yaml`에 `sdk: flutter` 포함 시 Flutter(L1, LLM recommended)로 감지.

**사이드바 프레임워크 표시명 보완**

- Django · FastAPI · Flask · Spring Boot · Angular · Vue SPA · React Router · Remix · Flutter의 표시명이 원시 식별자 대신 정식 명칭으로 표시됨.

---

## [1.1.3] — 2026-05-09

### Bug Fixes

**Viewer — Tab1/Tab2 줌 & 드래그 수정**

- **Fix #16 — drag 구현 교체**: 패널별 클로저 + `window.mousemove` × 3 방식을 단일 `drag` 객체 + `document.addEventListener` 방식으로 교체. 탭 전환 중 드래그 상태 간섭 제거.
- **Fix #17 — fitToView 수식**: `getBoundingClientRect()` (transform 후 크기 반환) → `svg.getAttribute('width')` (SVG 자연 크기 기준)으로 교체. 뷰포트 리사이즈 후 재호출 시 오차 제거.
- **Fix #18 — ⌂ 리셋 동작**: `ST[id]={s:1,x:0,y:0}` (scale 1.0 고정 리셋) → `fitToView(id)` 호출로 교체. 대형 다이어그램에서 리셋 시 fit-to-view 동작.

**Viewer — Tab3 DB ERD 토글 추가**

- **Fix #19 — DB 토글 바**: Tab3 진입 시 `전체(All)` · `FK 관계` · `페이지 쿼리` · `서버 액션` 4개 뷰 토글 추가. 기본값 `전체`.
- **Fix #20 — FK 관계 뷰**: 테이블 스키마 + FK 관계만 표시하는 전용 erDiagram 뷰.
- **Fix #21 — 페이지 쿼리 뷰**: 라우트 → 테이블 도메인 그룹 flow graph 뷰.

### Other Changes

- `README.md`: DB-Screen 4-toggle view 설명 추가
- `ANALYZER_VERSION` 상수를 `'codebase-viz@1.1.3'`으로 업데이트

---

## [1.1.2] — 2026-05-08

### Bug Fixes

**Tab1 Rendering Architecture — X축 폭발 근본 수정**

- **Fix #9 — 행 다이어그램 평탄 렌더링**: `buildRouteRowDiagram()` 내부 재귀 중첩 `subgraph` 대신 각 그룹의 모든 라우트를 1줄씩 평탄하게 나열. graph TD에서 에지 없는 노드는 줄 단위 배치 시 세로 정렬이 보장되므로 X폭발 없이 7,407px→1,380px로 개선됩니다.

**Tab2 Screen-Component — X축 폭발 근본 수정**

- **Fix #10 — Section-내 Component Subgraph 중첩**: `renderScreenSection()`에서 컴포넌트를 free node로 내보내던 방식을 route section subgraph 내부에 중첩된 component subgraph로 전환. graph TB에서 sibling subgraph 간 수평 배치 문제를 해소하며 32,035px→1,381px로 개선됩니다.
- **Fix #11 — TAB2_GROUPS_PER_ROW=2**: Tab2 행당 섹션 수를 5→2로 조정. nested comp subgraph 방식에서 섹션 1개≈580px이므로 2개 기준 약 1,200px의 안전한 폭을 유지합니다.

**Tab3 DB-Screen — renderer 버그 수정**

- **Fix #12 — dbScreen chunk 폭발**: `buildDiagrams()`에서 Tab3에 `routeCount`를 임계값으로 사용하던 버그 수정. `buildDbScreenWithFallback()`로 분리하여 `tableCount` 기준 적용 — 120개 라우트 + 8개 테이블 구성에서 125개 빈 chunk 폭발 현상이 해소됩니다.

**Tab3 viewer — Routes/Actions/ALL 뷰 Y축 개선**

- **Fix #13 — source 노드 그룹화**: `buildSingleDbGraph()`에서 route/action source를 free node 대신 `⬡ Pages` / `⚡ Actions` subgraph로 묶어 표시. 조직화된 시각 구조를 제공합니다.

**Tab3 ERD 디자인 — th/td 시각 분리**

- **Fix #14 — ERD 컬럼 행 배경색**: Mermaid 11 `row-rect-even/odd` 후처리로 테이블명 헤더(TH)는 어두운 배경/밝은 텍스트를 유지하고, 컬럼 행(TD)은 흰색(`#ffffff`) / 연회색(`#f1f5f9`) zebra 배경 + 어두운 텍스트(`#1e293b`)로 분리합니다.

**Tab3 viewer — ALL 뷰 기본값 변경**

- **Fix #15 — 전체 뷰 Default 활성화**: Tab3 진입 시 기본 토글을 `FK 관계`→`전체(FK+Routes+Actions)`로 변경. 전체 토글을 토글 바 맨 앞(구분선 왼쪽)으로 이동합니다.

### Other Changes

- `ANALYZER_VERSION` 상수를 `'codebase-viz@1.1.2'`로 업데이트 — v1.1.1 캐시가 있는 프로젝트에서 자동 무효화 후 재분석이 트리거됩니다.

---

## [1.1.1] — 2026-05-08

### Bug Fixes

**A group — WINA-APP-FE 분석 가능화 (차단 해제)**

- **Fix #3 — stack-detector 우선순위**: `vite+react` 감지가 `react-router-dom` 감지를 가로채던 문제 수정. `vite+react+react-router-dom` 조합이 이제 react-router 어댑터로 올바르게 분류됩니다.
- **Fix #5 — vite-react phantom adapterId**: 라우터 라이브러리가 없는 순수 SPA에 한해 `adapterId: undefined`로 정확히 처리. LLM OFF 상태에서 분석 시 silent empty 대신 명시적 에러 메시지를 출력합니다.
- **Fix #4 — JSX `<Routes>` 파서**: react-router v6의 JSX 패턴(`<BrowserRouter>` + `<Routes>` + `<Route>`) 정적 파서 추가. 평면/nested/index/catch-all Route 4가지 패턴을 모두 지원합니다.

**B group — 대규모 라우트 가독성 (품질 개선)**

- **Fix #1 — Multi-level 재귀 그룹핑**: `groupRoutesByUrl()` 재귀 nested 트리(`NestedGroup`) 구조로 전환. 934 라우트 규모 프로젝트에서 `/api → /v1 → /partner → ...` 형태로 깊이 중첩된 Mermaid `subgraph`가 생성됩니다. `maxDepth: 8`, `minGroupSize: 3` stop 조건으로 무한 재귀를 방지합니다.
- **Fix #2 — 노드 수 기반 chunk 트리거**: `shouldChunk()` 에 `nodeCount` / `nodeThreshold`(기본 100) 조건 추가. 1M자 미만이더라도 라우트가 100개를 초과하면 chunk 분할이 발생합니다.

**C group — 대규모 다이어그램 가독성 (UX 개선)**

- **Fix #6 — 행 기반 그리드 레이아웃**: LCP(최장공통접두사) 이후 최초 분기 지점을 자동 탐지하고 하위 그룹을 5개 단위로 행 배치합니다. `/api/v1` 하나로 수렴하는 934-라우트 규모 BE 프로젝트에서도 가로 폭 폭발 없이 다이어그램이 표시됩니다. Tab1·Tab2·Tab3 모두 적용.
- **Fix #7 — 전체 컬럼 ERD 표시**: DB 스키마 컬럼의 묵시적 8개 절단(slice)을 제거. ERD 다이어그램과 사이드바에서 테이블의 모든 컬럼이 표시됩니다.
- **Fix #8 — 멀티행 뷰어**: 다중 행 다이어그램을 동시에 표시하는 스택 뷰로 전환. 각 행 SVG를 컨테이너 너비에 맞게 자동 스케일하며 수직 스크롤로 탐색합니다.

### Other Changes

- `ANALYZER_VERSION` 상수를 `'codebase-viz@1.1.1'`로 업데이트 — v1.1.0 이전 캐시(`.codesight/cache.json`)가 있는 프로젝트에서 자동 무효화 후 재분석이 트리거됩니다.

> **캐시 주의**: LLM 분석 결과가 캐시된 프로젝트는 v1.1.1 최초 실행 시 재분석이 발생합니다. LLM API Key 설정이 되어 있으면 LLM 비용이 재발생할 수 있습니다.

---

## [1.1.0] — 2025-04-15

### New Features

- **13번째 프레임워크 지원**: Next.js Pages Router (`pages/` 디렉터리) 어댑터 추가
- **FE↔BE 멀티프로젝트 URL 매칭**: `fetch()` / `axios.*` 호출 URL을 BE 라우트와 정적 매칭, 결합 다이어그램에 점선 cross-edge 표시
- **Tab1 URL 계층 그룹핑**: `groupRoutesByUrl()` 도입으로 동일 prefix 라우트를 Mermaid `subgraph`로 묶어 표시
- **Flyway DDL 파서**: Spring Boot 프로젝트의 Flyway 마이그레이션 파일에서 테이블 스키마 추출

---

## [1.0.0] — 2025-03-01

### Initial Release

- 12개 프레임워크 정적 분석 (Next.js App Router, Nuxt, SvelteKit, NestJS, Django, FastAPI, Flask, Spring Boot, Vue SPA, Angular, Remix, React Router)
- 3-tab Mermaid 다이어그램 (Rendering Architecture / Screen–Component / DB–Screen)
- Supabase, Prisma, Drizzle, TypeORM, SQLAlchemy, JPA ORM 파서
- LLM 선택적 보강 (Claude claude-sonnet-4-6)
