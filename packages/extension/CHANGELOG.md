# Changelog

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
