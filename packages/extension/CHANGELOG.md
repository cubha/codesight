# Changelog

## [1.1.5] — 2026-05-10

### Added — i18n (4 languages)

- Full internationalization: **한국어 / English / 日本語 / 中文 (简体)**
- Sidebar Language selector — change language directly without editing settings.json
- New setting `codesight.language`: `auto` (follow VS Code) / `ko` / `en` / `ja` / `zh-cn`
- Locale changes apply instantly without window reload — sidebar + viewer re-render in real time

### Added — Demo GIFs in marketplace listing

- `demo-tab-switch.gif` — Tab1 → zoom-out → Tab2 flow
- `demo-db-toggle.gif` — Tab3 four-view toggle (All / FK / Page Queries / Server Actions)

### Fixed — Viewer interactions

- Wheel zoom + drag pan now work correctly on all tabs (previously selected text instead of panning)
- Row-mode (chunked diagrams) also supports wheel zoom + drag pan — same UX as single diagrams
- Index routes inside group subgraphs no longer collapse to `/` (preserves natural label width)

### Improved — Diagram density thresholds

- `DEFAULT_NODE_THRESHOLD`: 100 → 300 (typical projects render as a single SVG instead of chunked rows)
- `DEFAULT_CHUNK_THRESHOLD`: 1MB → 5MB (matches modern Mermaid render budget)
- Group prefix stripped from route labels inside section subgraphs (e.g. `/dashboard/admin` → `admin` inside `📁 /dashboard`)

### Removed

- Static `screenshot-rendering.png`, `screenshot-dbscreen.png`, `screenshot-marketplace*.png` — replaced by dynamic GIFs

## [1.1.4] — 2026-05-09

### Improved — Stack Detection

- Turbo / Lerna / Nx monorepos now correctly detected: scans `apps/`, `packages/`, `services/` sub-directories when root `package.json` has no framework deps
- Multi-service projects without a root `package.json` (e.g. `backend/` + `frontend/` at root) now auto-detected
- Flutter recognized via `pubspec.yaml` (`sdk: flutter`) — reported as Flutter · L1 · LLM recommended
- Last-resort fallback: all top-level directories are scanned for Python/Java/JS/TS frameworks
- Sidebar now shows proper display names for Django, FastAPI, Flask, Spring Boot, Angular, Vue SPA, React Router, Remix, Flutter (previously showed raw identifiers)

## [1.0.0] — 2026-05-07

### Fixed — Tab1 Route accuracy

- **Next.js** — `.js` and `.jsx` route files (`page.js`, `layout.js`, `route.js`) now detected alongside `.tsx`
- **Remix** — `$.tsx` splat catch-all now converted to `/*` wildcard route with `catch-all` segment type
- **Django** — `re_path(r'^api/(?P<id>\d+)/$')` regex URL patterns now parsed to `:id` notation
- **NestJS** — Template literal route prefixes (`` @Controller(`/api/${version}`) ``) now extracted correctly

### Fixed — Tab2 Component accuracy

- **Vue SPA** — `<ComponentTag>` template tags now produce `renders` edges (was incorrectly producing `imports` edges)
- **Angular** — `loadComponent: () => import('./x').then(m => m.X)` lazy routes now emit `renders` edges to the loaded component
- **All TS adapters** — `tsconfig.json` path aliases (`@/`, `~/`) resolved when building component import graphs

### Fixed — Tab3 DB accuracy

- **Flask SQLAlchemy** — `ForeignKey('table.id')` columns now populate FK arrows in the DB–Screen tab
- **FastAPI** — Relative model imports resolved relative to the current file directory
- **Spring Boot JPA** — `@Column(name="col_name")` mapped to actual DB column name (not Java field name)
- **Spring Boot JPA** — FK targets resolved via class-to-table map; `@Table(name="...")` overrides handled correctly
- **Spring Boot MyBatis** — `<resultMap extends="parent">` inheritance resolves parent columns; `<association>`/`<collection>` inner columns parsed

### Improved — Provenance

- Route/component/table nodes now carry accurate line numbers in provenance (was hardcoded `1`)
- Flask factory pattern (`create_app()`) no longer produces duplicate route nodes

---

## [0.9.0] — 2026-05-06

### Fixed — DB FK 관계 정확도 (Phase V)

- **SpringBoot `@OneToOne`**: `@OneToOne` 어노테이션을 `@ManyToOne`과 동일하게 처리 → FK edge 및 column 생성. `@JoinColumn(name=...)` 있으면 컬럼명 오버라이드.
- **Django `ManyToManyField`**: `RELATION_FIELDS`에 추가 → M2M 필드도 `references` 포함 edge 생성.
- **FastAPI/SQLAlchemy `ForeignKey`**: `ForeignKey('users.id')` 감지 시 `parseForeignKeyRef` 헬퍼로 `{ table: 'users', column: 'id' }` 추출 → Tab3 DB–Screen에 FK 화살표 표시.
- **TypeORM `@Column` nullable**: 항상 `false`이던 하드코딩을 `resolveColumnNullable()` 헬퍼로 교체. `{ nullable: true }` ObjectLiteral 파싱 + `T | null` / `T | undefined` TypeNode 감지.
- **TypeORM ArrowFunction 블록 바디**: `() => { return User; }` 형태의 relation 타입 함수 미감지 → ts-morph `SyntaxKind.Block` + `ReturnStatement` 분석으로 전환.

### Fixed — Tab1 Routes 정확도 (Phase VI)

- **Flask `methods=[...]`**: `@app.route('/path', methods=['GET', 'POST'])` keyword argument 파싱 → `httpMethod` 설정. 이전에는 모든 Flask 라우트의 HTTP method가 없었음.
- **Flask 2.0+ 단축 데코레이터**: `@app.get()`, `@app.post()`, `@app.put()`, `@app.delete()`, `@app.patch()` 인식 → 라우트 등록 + `httpMethod` 자동 설정.
- **SpringBoot `@RequestMapping(method=RequestMethod.POST)`**: `method` 인자에서 `RequestMethod.X` field access 파싱 → 올바른 HTTP method 반환. 이전에는 항상 `GET` 반환.
- **SpringBoot 다중 class prefix**: `@RequestMapping({"/api/v1", "/api/v2"})` 형태에서 첫 번째 prefix만 사용하던 문제 수정 → 각 prefix와 메서드 경로 조합으로 RouteNode 생성.
- **SvelteKit `renderingMode` 오감지**: `export const ssr = false` / `export const prerender = true`를 `.svelte` 파일에서 읽던 문제 수정 → `+page.server.ts` → `+page.ts` → `.svelte` 순서로 탐색.
- **Django `include()` 패키지 형태**: `include('myapp.urls')` 처리 시 `myapp/urls.py`만 탐색하던 문제 수정 → `myapp/urls/__init__.py` 패키지 형태도 탐색.

---

## [0.8.2] — 2026-05-06

### Added

**Supabase shared parser for all SPA adapters:**
- Nuxt, SvelteKit, Remix, Next.js Pages, Vue SPA, Angular, React Router now all parse auto-generated `supabase.ts` type files
- Reads `Database.public.Tables` structure → extracts Row columns + FK relationships
- Supabase-only projects (no Prisma/Drizzle/TypeORM) now correctly populate the DB–Screen tab

### Fixed

- **Tab1 orphan `REACT` node** (11 adapters): backend-only frameworks (Django, Flask, FastAPI, Spring Boot, NestJS) no longer emit a dangling `REACT` subgraph node in the Rendering Architecture diagram. `frontendRef` pattern introduced — data layer edges are only drawn when a frontend layer subgraph is actually defined.
- **Tab3 ERD parse error** (`→` in column type): Django/SQLAlchemy FK columns with types like `Integer→FK` caused Mermaid ERD to fail. `sanitizeId()` now applied to `col.type` as well as `col.name`.
- **Tab3 mapper edges missing** (Nuxt, Vue SPA, Angular, React Router): `buildMapperEdges` was hardcoded to `[]` — now properly called, linking route/component file names to ORM table names via token-boundary matching.
- **Regex false-positive edges** in `mapper-utils.ts`: table names with `.` or `+` characters were interpolated directly into `RegExp`, causing false matches. Proper escape applied (`replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`).

### Performance

- **tree-sitter Parser instance caching**: `createPythonParser()` and `createJavaParser()` now return module-level cached instances, avoiding redundant WASM initialization on repeated calls.

---


## [0.8.1] — 2026-05-05

### Added

**Spring Boot — MyBatis support:**
- Mapper XML (`*Mapper.xml`) parsing: `<resultMap>` column extraction + SQL `FROM/INTO/UPDATE` table name extraction
- Tier 1: single-table `<select resultMap="X">` → columns from resultMap linked to real table name
- Tier 1 fallback: unmatched resultMaps → class simple name as table name (with columns)
- Tier 2: multi-table JOINs and insert/update statements → table names registered (no columns)
- `@Mapper` Java interface supplement: SQL string literals scanned for additional table references
- Oracle-specific: schema-qualified `SCHEMA.TABLE` names → table part only; `DUAL`/`SYSDATE` filtered

### Fixed

- **Mermaid large diagram crash** (`maximum text size in diagram exceeded`): `maxTextSize: 1000000` and `maxEdges: 2000` added to `mermaid.initialize()` in both `viewer.html` and `webview.ts`
- **DB–Screen "Other NoTables" phantom entry**: removed `NoTables { string placeholder }` ERD fallback — empty DB tab now shows `(No data)` via existing viewer fallback

---

## [0.8.0] — 2026-05-05

### Added

**React Router — 13th static-analysis adapter:**
- `createBrowserRouter()` / `createHashRouter()` route arrays parsed statically
- `Component:` and `lazy:` properties resolved → renders edges
- 1-depth import chain tracked for sub-component edges

**Tab3 (DB–Screen) connected for all 13 adapters:**
- Next.js Pages Router, Remix, Nuxt, SvelteKit — Supabase support added (Prisma/Drizzle/TypeORM already had it)
- Vue SPA, React Router, Angular — Supabase · Prisma · Drizzle · TypeORM connected
- Flask — new SQLAlchemy ORM parser (`Base` / `db.Model` subclasses + `Column()` via tree-sitter)

**FK reference tracking:**
- TypeORM: `@ManyToOne` / `@OneToOne` decorators → `ColumnDef.references` (FK target arrows in DB–Screen)
- Django ORM: `ForeignKey('Model')` first argument → `ColumnDef.references`

**Django CBV HTTP method detection:**
- `class UserView(View): def get(self, request)` → `httpMethod: 'GET'` on route nodes
- Covers `get`, `post`, `put`, `patch`, `delete` methods

**Angular template-based component graph:**
- `@Component.template` / `templateUrl` strings scanned for `<selector-name>` tags
- Renders edges created between parent and child components

### Changed

- Framework count: 12 → 13 static-analysis adapters
- All adapter `parsingLevel` values now correctly set to `L2` (routes + components + DB when ORM present)

---

## [0.7.0] — 2026-05-04

### Added

**HTTP method labels in Rendering Architecture:**
- NestJS: `@Get` → `GET`, `@Post` → `POST`, etc. shown as prefix in route nodes
- FastAPI: `@router.get` / `@app.post` → `GET` / `POST` labels
- Spring Boot: `@GetMapping` → `GET`, `@PostMapping` → `POST`, etc.

**SvelteKit component runtime detection:**
- `+page.svelte` alone → `runtime: client`
- `+page.svelte` + `+page.server.ts` → `runtime: shared`
- `+page.server.ts` alone → `runtime: server`

**Remix nested folder route support:**
- Recursive scan of `app/routes/` subdirectories
- `users/_index.tsx` → `/users`, `users/$id.tsx` → `/users/:id`

**ORM column quality improvements:**
- Django ORM: `null=True` → `nullable: true`, `ForeignKey('User')` → type `ForeignKey→User`, `Meta.db_table` as table name
- SQLAlchemy: `nullable=True/False`, actual column type (`String`, `Integer`, …), `__tablename__` as table name
- JPA: `@Column(nullable=false/true)`, `@JoinColumn(name="col")` as FK column

**DB–Screen mapper connections:**
- SvelteKit and NestJS routes/components now linked to ORM tables in DB–Screen tab via `mapper-utils.ts`

**Config-driven parser selection:**
- All adapters now read `ctx.stack` flags (`hasPrisma`, `hasDrizzle`, `hasTypeOrm`, `hasSQLAlchemy`, `hasDjangoORM`, `hasSpringDataJpa`) to skip irrelevant parsers
- 5 new `StackInfo` flags: `hasDrizzle`, `hasTypeOrm`, `hasSQLAlchemy`, `hasDjangoORM`, `hasSpringDataJpa`

### Changed

- `ParsingLevel` labels corrected to reflect actual extraction depth:
  - Next.js App Router: `L1` → `L3` (routes + components + DB)
  - Nuxt, SvelteKit, Django: `L1` → `L2` (routes + components or DB)
  - Flask, Vue SPA, Angular: `L2` → `L1` (routes only)
  - vite-react: `L2` → `L3` (LLM-only = comprehensive)
- Backend adapter error handling: `Promise.all` `.catch(() => [])` guards on all parsers

---

## [0.6.0] — 2026-05-04

### Added

**5 new framework adapters (static analysis, no API key):**
- **FlaskAdapter** — `@app.route` + Blueprint `url_prefix` synthesis via tree-sitter. `<int:user_id>` → `:user_id`.
- **Next.js Pages Router adapter** — `pages/` directory file-based routing. `[param]` → `:param`, `[...param]` → `:param*`.
- **Vue SPA adapter** — `createRouter({ routes: [...] })` array parsed via ts-morph. Lazy `import()` paths included.
- **Remix adapter** — `app/routes/` file-based. `$id` → `:id`, `_index.tsx` → `/`.
- **Angular adapter** — `provideRouter(routes)` / `RouterModule.forRoot(routes)` parsed via ts-morph. Cross-file `Routes` variable resolution. `loadChildren` path literals included.

**DB Multi-ORM support (all TS adapters):**
- **Prisma** — `schema.prisma` model extraction via `@mrleebo/prisma-ast`. Relation fields excluded. DB tab populated for Next.js, NestJS, SvelteKit.
- **Drizzle** — `pgTable()` / `sqliteTable()` call extraction via ts-morph (object + callback form).
- **TypeORM** — `@Entity` / `@Column` decorator extraction via ts-morph. `@PrimaryGeneratedColumn` flagged as PK.

**Backend DB support (Python/Java adapters):**
- **Django ORM** — `models.Model` subclasses + `CharField` / `ForeignKey` etc. from `models.py` via tree-sitter.
- **SQLAlchemy** — `Base` subclasses + `Column()` from FastAPI projects via tree-sitter.
- **JPA** — `@Entity` + `@Column` + `@Table(name=...)` from Spring Boot projects via tree-sitter.

**Component graph expansion:**
- **Nuxt** — `.vue` SFC import graph (script block extracted via regex → ts-morph). `~/` and `@/` aliases resolved.
- **SvelteKit** — `.svelte` SFC import graph. `$lib/` aliases resolved.
- **Django** — `View` / `ViewSet` subclasses as component nodes.
- **FastAPI** — `BaseModel` subclasses as component nodes.
- **Spring Boot** — `@Service` / `@Component` / `@Repository` classes as component nodes.
- **NestJS** — already had component graph; now also produces `tableNodes` via TypeORM parser.

### Changed

- `FrameworkKind` type expanded: `flask`, `vue-spa`, `remix`, `angular` added.
- Framework count: 7 → 12 static-analysis adapters.

## [0.4.0] — 2026-05-03

### Added

- **Multi-stack adapter system** — static analysis adapters for 7 frameworks (Next.js, Nuxt, SvelteKit, NestJS, Django, FastAPI, Spring Boot). No API key needed for any of these.
- **DjangoAdapter** — parses `urls.py` with `path()` / `re_path()` calls via tree-sitter. Converts `<int:pk>` → `:pk` notation.
- **FastApiAdapter** — parses `@app.get()` / `@router.get()` decorators across all `.py` files. Converts `{user_id}` → `:user_id`.
- **SpringBootAdapter** — parses `@RestController` / `@GetMapping` / `@PostMapping` etc. across all `.java` files. Combines class-level `@RequestMapping` prefix with method paths.
- **Unified dynamic segment notation** — all route paths now use `:param` format (`:slug`, `:slug*`, `:id`) across all adapters for consistent Mermaid diagram labels.
- **tree-sitter WASM runtime** — Python and Java AST parsing via `web-tree-sitter` + bundled `tree-sitter-python.wasm` / `tree-sitter-java.wasm`. No native dependencies, pure Node.js.

### Changed

- Extension bundle includes `dist/wasm/` directory with WASM files (~1.1MB). Total vsix size: ~3.7MB.

## [0.2.0] — 2026-05-03

### Added
- Activity Bar 사이드바 패널 — Analyze, API Key 설정, LLM 토글, 분석 상태 표시
- 하단 패널 (CodeSight Analysis 탭) — 분석 로그 및 결과 요약

## [0.1.0] — 2026-05-03

Initial release.

### Features

- **Rendering Architecture tab** — route hierarchy with SSR/CSR/ISR/SSG labels
- **Screen–Component tab** — route → component dependency graph
- **DB–Screen tab** — Supabase table schema + page/server-action query relations with 4-view toggle (FK / Page queries / Server actions / All)
- **Static analysis** — works out of the box with no API key
- **LLM analysis** (BYOK) — Claude-powered deep analysis via Anthropic API
- **Persistent cache** — results cached in `.codesight/cache.json`, instant reopen
- **Re-analyze button** — force a fresh scan from the viewer header
- **Export dropdown** — save diagrams as PNG, SVG, or Markdown
- **Local Mermaid bundle** — works in air-gapped environments (no CDN required)
