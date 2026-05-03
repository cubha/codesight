# codebase-viz

**VS Code extension that visualizes codebase architecture as interactive Mermaid diagrams.**

Routes, components, and DB relationships — extracted statically from 7 frameworks, optionally enriched by LLM, rendered as three live diagram tabs inside VS Code.

> Marketplace: [`cubha.codebase-arch-viz`](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz) · Current release: **v0.4.0**

---

## What it does

Open a project in VS Code → click **Analyze**. CodeSight produces:

| Tab | Content |
|---|---|
| **Rendering Architecture** | Route hierarchy with SSR / CSR / ISR / SSG labels per route |
| **Screen–Component** | Route → component import graph |
| **DB–Screen** | Supabase table schema + which pages/actions query each table |

Results are cached in `.codesight/cache.json`. Re-analyze on demand.

---

## Supported Frameworks (static analysis, no API key)

| Framework | Parsing | Detection signal | What's extracted |
|---|---|---|---|
| Next.js App Router | L1 | `package.json` → `next` + `app/` dir | Routes (page/layout/route-handler), components, DB queries |
| Nuxt | L1 | `package.json` → `nuxt` | Pages from `pages/`, dynamic `:param` paths |
| SvelteKit | L1 | `package.json` → `@sveltejs/kit` | `+page`/`+layout`/`+server` from `src/routes/` |
| NestJS | L2 | `package.json` → `@nestjs/core` | `@Controller` / HTTP method decorators via ts-morph AST |
| Django | L1 | `requirements.txt` → `django` or `manage.py` | `path()` / `re_path()` from `urls.py` via tree-sitter |
| FastAPI | L2 | `requirements.txt` → `fastapi` | `@app.get` / `@router.post` decorators via tree-sitter |
| Spring Boot | L2 | `pom.xml` / `build.gradle` | `@RestController` + `@GetMapping` etc. via tree-sitter |

**L1** = file-system / URL-conf traversal · **L2** = AST/decorator analysis

Frameworks not in this list (Express, Flask, Rails, Go, etc.) fall back to **L3 — LLM primary** mode when an Anthropic API key is provided.

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
  core/       @codebase-viz/core      Adapter registry + 7 framework adapters + WASM runtime
  llm/        @codebase-viz/llm       Stack detector + LLM enrichment pipeline
  renderer/   @codebase-viz/renderer  Mermaid / Markdown output (buildDiagrams)
  cli/        @codebase-viz/cli       CLI entry point (analyze command)
  extension/  codebase-arch-viz       VS Code Extension (publisher: cubha)

fixtures/
  mini-next-app/        Next.js App Router sandbox
  mini-nuxt-app/        Nuxt sandbox
  mini-sveltekit-app/   SvelteKit sandbox
  mini-nest-app/        NestJS sandbox
  mini-django-app/      Django sandbox
  mini-fastapi-app/     FastAPI sandbox
  mini-spring-app/      Spring Boot sandbox
  mini-vanilla/         Unknown framework (L3 fallback test)
```

---

## Development

**Prerequisites**: Node.js 20+, pnpm 9+

```bash
# Install dependencies
pnpm install

# Type-check all packages
pnpm typecheck

# Run all tests (149 tests)
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
| v0.4.0 | Multi-stack adapters (Nuxt, SvelteKit, NestJS, Django, FastAPI, Spring Boot) + WASM runtime + unified `:param` notation |

---

## License

MIT — [github.com/cubha/codesight](https://github.com/cubha/codesight)
