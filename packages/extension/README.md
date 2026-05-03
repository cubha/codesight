# Codebase Architecture Visualizer

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/cubha.codebase-arch-viz?label=VS%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz)
[![Open VSX](https://img.shields.io/open-vsx/v/cubha/codebase-arch-viz?label=Open%20VSX&color=a60ee5)](https://open-vsx.org/extension/cubha/codebase-arch-viz)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/cubha.codebase-arch-viz)](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/cubha/codesight/blob/master/LICENSE)

**Instant route diagrams for 7 frameworks — no API key needed.**
Available on **VS Code**, **Cursor**, **VSCodium**, and any editor that uses the Open VSX registry.

CodeSight analyzes your project and renders three interactive diagrams directly inside your editor: route hierarchy, component trees, and DB schema.

- **Routes**: extracted statically for all 7 frameworks (Next.js, Nuxt, SvelteKit, NestJS, Django, FastAPI, Spring Boot) — no API key required
- **Components & DB schema**: fully covered out of the box for **Next.js + Supabase** and **NestJS** (components only); for other stacks, add a Claude API key to fill those tabs

---

## 🖼️ How It Looks

### Sidebar Panel
Control everything from the sidebar — analyze, re-analyze, open the viewer, export diagrams, and manage your API key.

![Sidebar Panel](https://raw.githubusercontent.com/cubha/codesight/master/packages/extension/media/screenshot-sidebar.png)

### Rendering Architecture
Visualize your route hierarchy with SSR / CSR / ISR / SSG labels per route, infrastructure layers, and data layer at a glance.

![Rendering Architecture](https://raw.githubusercontent.com/cubha/codesight/master/packages/extension/media/screenshot-rendering.png)

### DB–Screen
See which pages and server actions query each table, with FK relations and full column schema in the right panel. Toggle between FK / Page queries / Server actions / All views.

![DB Screen](https://raw.githubusercontent.com/cubha/codesight/master/packages/extension/media/screenshot-dbscreen.png)

---

## 🌐 Supported Frameworks

Static **route** analysis works without an API key for all 7 frameworks below. Components and DB schema are extracted statically for Next.js + Supabase (full coverage) and NestJS (components only) — for other stacks, an API key unlocks those two tabs via LLM enrichment.

| Framework | Detection | Static (no key) | Components & DB |
|---|---|---|---|
| **Next.js App Router** | `next` + `app/` dir | Routes + SSR/CSR/SSG/ISR labels + components (.tsx import graph) | DB ✓ for Supabase types |
| **Nuxt** | `nuxt` in deps | Pages from `pages/` + dynamic segments | LLM recommended |
| **SvelteKit** | `@sveltejs/kit` | Routes from `src/routes/` + SSR/CSR/SSG | LLM recommended |
| **NestJS** | `@nestjs/core` | Controllers, modules, services, routes, dependency graph | DB: LLM recommended |
| **Django** | `urls.py` / `manage.py` | URL patterns from `path()` / `re_path()` | LLM recommended |
| **FastAPI** | `fastapi` in requirements | Route decorators (`@app.get`, `@router.post`, etc.) | LLM recommended |
| **Spring Boot** | `pom.xml` / `build.gradle` | `@RestController` + `@GetMapping` / `@PostMapping` etc. | LLM recommended |
| **Other** (Express, Flask, Rails, Go, …) | — | — | Full LLM mode |

**Route path notation**: all adapters emit unified `:param` format (e.g. `/users/:id`, `/blog/:slug*`) for consistent diagram labels.

**Coverage roadmap**: native parsers for Prisma / Drizzle / TypeORM (DB) and Vue / Svelte SFC (components) are planned to expand the API-key-free coverage to non–Next.js stacks.

---

## ✨ Features

| Tab | What you see |
|---|---|
| **Rendering Architecture** | Route hierarchy with SSR / CSR / ISR / SSG labels, infrastructure and data layers |
| **Screen–Component** | Which components each route renders, with import chains |
| **DB–Screen** | Tables, columns, FK relations, and which pages / server actions query each table |

**Sidebar panel**
- Shows project name, detected framework, route/table count, and last cached time
- **Analyze** button (first run) → **Re-analyze** button (after cached)
- **Open Viewer** opens the diagram panel (active only when cache exists)
- **Export** — PNG / SVG / Markdown with one click

**Two analysis modes**

| Mode | What you get | API key |
|---|---|---|
| **Static analysis** | Routes for all 7 frameworks. Plus components & DB for Next.js + Supabase, components for NestJS | Not required |
| **LLM-enhanced** (BYOK) | Adds components & DB for stacks the static parser doesn't yet cover; infers route paths in dynamic patterns | Required |

Static analysis runs first. LLM enrichment is additive — it fills in the gaps the static parser leaves (e.g. components and DB schema on Nuxt/SvelteKit/Django/FastAPI/Spring Boot) but never overwrites verified static results.

**Quality-of-life**
- Results are **cached permanently** — reopening VS Code shows the last analysis instantly, no re-run needed
- **Re-analyze** forces a fresh scan when you've made changes
- Offline-friendly — Mermaid is bundled locally, no CDN required
- Pure Node.js runtime — no Python, Java, or native binaries required (Python/Java AST parsing uses bundled WebAssembly)

---

## 🚀 Getting Started

### Install

- **VS Code** — search **"Codebase Architecture Visualizer"** in the Extensions panel, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz)
- **Cursor / VSCodium / Gitpod / code-server** — search **"Codebase Architecture Visualizer"** in the Extensions panel (served via [Open VSX](https://open-vsx.org/extension/cubha/codebase-arch-viz))

### 1. Open a project

Open your project folder in your editor (`File → Open Folder`).

### 2. Run the analysis

Click the **CodeSight icon** in the Activity Bar (left sidebar) → click **▶ Analyze Project**.

Or use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P` — same shortcut in VS Code and Cursor):
```
CodeSight: Analyze Project
```

### 3. Explore the diagrams

The viewer opens beside your editor with three tabs. Use the sidebar to re-analyze, open the viewer again, or export.

---

## 🤖 LLM Analysis (BYOK)

CodeSight uses **Anthropic Claude** for deeper semantic enrichment on top of static analysis. You supply the API key — it is stored securely in VS Code's SecretStorage and never sent to any server other than Anthropic's API.

**When to use LLM mode**
- You're using Nuxt / SvelteKit / Django / FastAPI / Spring Boot and want components & DB schema in the diagrams
- You're using a DB layer other than Supabase types (Prisma, Drizzle, TypeORM, SQLAlchemy, JPA, etc.)
- Your framework is not in the static-support list (Express, Flask, Rails, Go, etc.)
- You want richer labels: SSR/CSR modes, component roles, backend service annotations
- You want route paths inferred even when they're dynamically constructed

**Setup**

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Click **🔑 Set API Key** in the CodeSight sidebar
3. Toggle **Enable LLM Analysis** in the sidebar

**Model selection** (`codesight.model` setting)

| Value | Description |
|---|---|
| `claude-sonnet-4-6` | Default — best balance of speed and quality |
| `claude-haiku-4-5-20251001` | Faster, lower cost |
| `claude-opus-4-7` | Highest quality for complex codebases |

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `codesight.enableLLM` | `false` | Enable Claude-powered deep analysis |
| `codesight.model` | `claude-sonnet-4-6` | Claude model to use |

---

## 🔧 Commands

| Command | Description |
|---|---|
| `CodeSight: Analyze Project` | Run analysis and open the viewer |
| `CodeSight: Set Anthropic API Key` | Store your API key securely |
| `CodeSight: Clear Anthropic API Key` | Remove the stored key |

---

## 📋 Requirements

- VS Code 1.90+ (or Cursor / VSCodium based on the same version)
- Node.js 20+
- Supabase (optional — DB–Screen tab works best with Supabase usage in Next.js projects)

No additional runtimes required. Python and Java AST parsing is handled via bundled WebAssembly modules.

---

## 🔒 Privacy

- Your code is **never sent anywhere** in static-only mode
- In LLM mode, relevant source files are sent to the **Anthropic API using your own key**
- Anthropic's data handling: [anthropic.com/privacy](https://www.anthropic.com/privacy)
- Analysis results are cached locally in `.codesight/cache.json` in your project

---

## 📦 Source

[github.com/cubha/codesight](https://github.com/cubha/codesight) — MIT License
