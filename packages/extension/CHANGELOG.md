# Changelog

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
