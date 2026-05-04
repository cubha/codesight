# codebase-viz

**VS Code extension that visualizes codebase architecture as interactive Mermaid diagrams.**

Routes, components, and DB relationships — extracted statically from **13 frameworks**, optionally enriched by LLM, rendered as three live diagram tabs inside VS Code.

> Marketplace: [`cubha.codebase-arch-viz`](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz) · Current release: **v0.8.0**

---

## What it does

Open a project in VS Code → click **Analyze**. CodeSight produces:

| Tab | Content |
|---|---|
| **Rendering Architecture** | Route hierarchy with SSR / CSR / ISR / SSG labels per route, HTTP method badges |
| **Screen–Component** | Route → component import graph, runtime tags (client / shared / server) |
| **DB–Screen** | Table schema (Supabase, Prisma, Drizzle, TypeORM, Django ORM, SQLAlchemy, JPA) + which pages query each table |

Results are cached in `.codesight/cache.json`. Re-analyze on demand.

---

## Supported Frameworks (static analysis, no API key)

### Frontend / Full-stack

| Framework | Parsing | Detection signal | What's extracted |
|---|---|---|---|
| Next.js App Router | **L3** | `package.json` → `next` + `app/` dir | Routes, components (`.tsx`), DB (Supabase · Prisma · Drizzle · TypeORM) |
| Next.js Pages Router | **L2** | `package.json` → `next` (no `app/` dir) | `pages/` file-based routes · component graph · DB (Supabase · Prisma · Drizzle · TypeORM) |
| Nuxt | **L2** | `package.json` → `nuxt` | Pages + `.vue` SFC import graph · DB (Supabase · Prisma · Drizzle · TypeORM) |
| SvelteKit | **L2** | `package.json` → `@sveltejs/kit` | `+page`/`+layout`/`+server` routes · SFC import graph (client/shared/server runtime) · DB (Supabase · Prisma · Drizzle · TypeORM) |
| Vue SPA | **L2** | `package.json` → `vue` (no nuxt) | `createRouter()` routes · component graph · DB (Supabase · Prisma · Drizzle · TypeORM) |
| Remix | **L2** | `package.json` → `@remix-run/react` | `app/routes/` recursive scan · component graph · DB (Supabase · Prisma · Drizzle · TypeORM) |
| React Router | **L2** | `package.json` → `react-router-dom` | `createBrowserRouter()` routes · component import chain · DB (Supabase · Prisma · Drizzle · TypeORM) |
| Angular | **L2** | `package.json` → `@angular/core` | `provideRouter()` / `RouterModule.forRoot()` routes · template-based component graph · DB (Supabase · Prisma · Drizzle · TypeORM) |

### Backend

| Framework | Parsing | Detection signal | What's extracted |
|---|---|---|---|
| NestJS | **L2** | `package.json` → `@nestjs/core` | Controllers (GET/POST labels) · services · modules · TypeORM entities + FK relations |
| Django | **L2** | `requirements.txt` → `django` or `manage.py` | URL patterns · CBV/FBV method detection (GET/POST) · Django ORM models (nullable/FK/db_table) |
| FastAPI | **L2** | `requirements.txt` → `fastapi` | Routes (GET/POST labels) · Pydantic schemas · SQLAlchemy models (nullable/type/__tablename__) |
| Flask | **L2** | `requirements.txt` → `flask` | `@app.route` + Blueprint routes · view classes · SQLAlchemy models (Base/db.Model) |
| Spring Boot | **L2** | `pom.xml` / `build.gradle` | Controllers (GET/POST labels) · `@Service`/`@Repository` · JPA `@Entity` (@JoinColumn/nullable) |

**L1** = routes only · **L2** = routes + components + DB (ORM-conditional) · **L3** = all 3 tabs always

Frameworks not in this list (Express, Hono, Rails, Go, etc.) fall back to **L3 — LLM primary** mode when an Anthropic API key is provided.

---

## DB Coverage

| ORM / DB | Adapters | What's extracted |
|---|---|---|
| Supabase | All TS adapters (Next.js App Router, Pages, Nuxt, SvelteKit, Remix, React Router, Vue SPA, Angular, NestJS) | `.from('TABLE')` method-chain · table names · FK targets |
| Prisma | All TS adapters | `schema.prisma` model extraction via `@mrleebo/prisma-ast` · column types · nullable |
| Drizzle | All TS adapters | `pgTable()` / `sqliteTable()` calls via ts-morph |
| TypeORM | NestJS, Next.js, SvelteKit, Angular, Vue SPA, Remix, Pages | `@Entity` / `@Column` · `@ManyToOne` / `@OneToOne` → FK references |
| Django ORM | Django | `models.Model` subclasses · `null=True` → nullable · `ForeignKey('Model')` → FK reference |
| SQLAlchemy | FastAPI, Flask | `Base` / `db.Model` subclasses · `Column()` · `relationship()` targets |
| JPA | Spring Boot | `@Entity` / `@Column` · `@JoinColumn` · `nullable=false` |

---

## Analysis pipeline

```
detectStack(repoRoot)
  → AdapterRegistry.get(adapterId).analyze()   # static, no API key
  → IRGraph (RouteNode / ComponentNode / TableNode / IREdge)
  → [optional] LLM enrichment (analyzer.ts:60–90)  # BYOK, additive only
  → buildDiagrams() → 3-tab Mermaid viewer
  → .codesight/cache.json
```

All nodes carry `provenance` (file + line) and `confidence` (`verified` | `inferred`). The LLM enrichment block is additive — static results are never discarded.

---

## Monorepo structure

```
packages/
  types/      @codebase-viz/types     IR type definitions (RouteNode, ComponentNode, IRGraph, …)
  core/       @codebase-viz/core      Adapter registry + 13 framework adapters + WASM runtime
  llm/        @codebase-viz/llm       Stack detector + LLM enrichment pipeline
  renderer/   @codebase-viz/renderer  Mermaid / Markdown output (buildDiagrams)
  cli/        @codebase-viz/cli       CLI entry point (analyze command)
  extension/  codebase-arch-viz       VS Code Extension (publisher: cubha)

fixtures/
  mini-next-app/          Next.js App Router sandbox
  mini-nextpages-app/     Next.js Pages Router sandbox
  mini-nuxt-app/          Nuxt sandbox
  mini-sveltekit-app/     SvelteKit sandbox
  mini-vue-spa-app/       Vue SPA sandbox
  mini-remix-app/         Remix sandbox
  mini-react-router-app/  React Router sandbox
  mini-nest-app/          NestJS sandbox (TypeORM entity + FK relations)
  mini-django-app/        Django sandbox (CBV/FBV views + models)
  mini-fastapi-app/       FastAPI sandbox (schemas + SQLAlchemy models)
  mini-flask-app/         Flask sandbox (blueprints + SQLAlchemy)
  mini-spring-app/        Spring Boot sandbox (services + JPA entities)
  mini-angular-app/       Angular sandbox
  mini-vanilla/           Unknown framework (L3 fallback test)
```

---

## Development

**Prerequisites**: Node.js 20+, pnpm 9+

```bash
# Install dependencies
pnpm install

# Type-check all packages
pnpm typecheck

# Run all tests (371 tests)
pnpm test

# Or use the project verify script (tsc + vitest)
bash verify.sh
```

**Build the extension**

```bash
cd packages/extension
node esbuild.mjs            # bundles extension.js + copies WASM to dist/wasm/
npx vsce package --no-dependencies   # produces .vsix
```

**Run a single adapter test**

```bash
npx vitest run packages/core/src/adapters/django/
```

---

## Adding a new framework adapter

1. Create `packages/core/src/adapters/<framework>/{adapter,index}.ts` implementing `IAdapter`
2. Add a parser in `parsers/` using the appropriate strategy:
   - File-system traversal (L1) — see `nextjs/parsers/route-parser.ts`
   - ts-morph AST (L2 TypeScript) — see `nestjs/parsers/decorator-parser.ts`
   - tree-sitter WASM (L2 Python/Java) — see `django/parsers/urls-parser.ts` or `springboot/parsers/annotation-parser.ts`
3. Register in `packages/core/src/adapters/registry.ts` → `createDefaultRegistry()`
4. Export from `packages/core/src/adapters/index.ts`
5. Add `FrameworkKind` entry in `packages/types/src/stack.ts`
6. Add detection logic in `packages/llm/src/stack-detector.ts` → `FRAMEWORK_PROFILES` + `detectStack()`
7. Add fixture in `fixtures/mini-<framework>-app/`
8. Add integration test case in `packages/cli/src/stack-routing.integration.test.ts`

All nodes must include `provenance` + `confidence`. Use `astToProvenance()` from `@codebase-viz/types` for tree-sitter adapters.

---

## Key constraints

- **Node-only runtime**: no Python, Java, or shell subprocesses. Python/Java AST = tree-sitter WASM (`packages/core/wasm/`)
- **IRGraph shape is fixed**: adapters return `AdapterResult` — do not modify `RouteNode` / `ComponentNode` / `IREdge` types
- **LLM enrichment block is immutable**: `packages/extension/src/analyzer.ts:60–90` — adapter additions must not touch this block
- **Evidence-first**: every node/edge requires `provenance` + `confidence`. `inferred` requires `inferenceChain`
- **vsix size target**: ≤ 7 MB (current: ~3.8 MB)

---

## Release

Marketplace: `cubha.codebase-arch-viz` · Publisher: `cubha`

```bash
git push origin master
cd packages/extension
npx vsce publish --no-dependencies -p <PAT>
```

| Version | Contents |
|---|---|
| v0.1.0 | Initial release — Next.js + Supabase static analysis + LLM mode |
| v0.2.x | Sidebar panel, bottom panel, persistent cache, export dropdown |
| v0.4.0 | Multi-stack adapters (Nuxt, SvelteKit, NestJS, Django, FastAPI, Spring Boot) + WASM runtime |
| v0.6.0 | 5 new frameworks (Flask, Next.js Pages, Vue SPA, Remix, Angular) + DB Multi-ORM (Prisma/Drizzle/TypeORM/Django ORM/SQLAlchemy/JPA) + SFC/backend component graphs |
| v0.7.0 | HTTP method labels (NestJS/FastAPI/Spring Boot) · SvelteKit runtime detection · ORM column quality · DB–Screen mapper connections |
| v0.8.0 | React Router adapter (13th) · Tab3 DB connected for all 13 adapters · TypeORM/Django FK references · Django CBV method detection · Flask SQLAlchemy ORM parser |

---

## License

MIT — [github.com/cubha/codesight](https://github.com/cubha/codesight)
