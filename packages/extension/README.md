# Codebase Architecture Visualizer

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/cubha.codebase-arch-viz?label=VS%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz)
[![Open VSX](https://img.shields.io/open-vsx/v/cubha/codebase-arch-viz?label=Open%20VSX&color=a60ee5)](https://open-vsx.org/extension/cubha/codebase-arch-viz)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/cubha.codebase-arch-viz)](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/cubha/codesight/blob/master/LICENSE)

**Instant architecture diagrams for 12 frameworks — no API key needed.**  
Available on **VS Code**, **Cursor**, **VSCodium**, and any editor using the Open VSX registry.

CodeSight analyzes your project statically and renders three interactive diagrams inside your editor: route hierarchy with HTTP methods, component trees, and DB schema with mapper connections.

---

## 🖼️ How It Looks

### Sidebar Panel
Control everything from the sidebar — analyze, re-analyze, open the viewer, export diagrams, and manage your API key.

![Sidebar Panel](https://raw.githubusercontent.com/cubha/codesight/master/packages/extension/media/screenshot-sidebar.png)

### Rendering Architecture
Route hierarchy with SSR / CSR / ISR / SSG labels and **HTTP method badges** (`GET /users · SSR`) for backend frameworks.

![Rendering Architecture](https://raw.githubusercontent.com/cubha/codesight/master/packages/extension/media/screenshot-rendering.png)

### DB–Screen
Table schema with columns, nullable flags, FK targets, and which pages query each table.

![DB Screen](https://raw.githubusercontent.com/cubha/codesight/master/packages/extension/media/screenshot-dbscreen.png)

---

## 🌐 Supported Frameworks

| Framework | Level | Routes | Components | DB |
|---|---|---|---|---|
| **Next.js App Router** | **L3** | ✅ SSR/SSG/ISR/CSR | ✅ `.tsx` import graph | ✅ Supabase · Prisma · Drizzle · TypeORM |
| **NestJS** | **L2** | ✅ `GET/POST` labels | ✅ Controllers · Services · Modules | ✅ TypeORM entities |
| **Django** | **L2** | ✅ `path()` / `re_path()` | ✅ View / ViewSet classes | ✅ `models.Model` + nullable/FK/db_table |
| **FastAPI** | **L2** | ✅ `GET/POST` labels | ✅ Pydantic schemas | ✅ SQLAlchemy + nullable/type/__tablename__ |
| **Spring Boot** | **L2** | ✅ `GET/POST` labels | ✅ `@Service` / `@Repository` | ✅ JPA `@Entity` + @JoinColumn/nullable |
| **Nuxt** | **L2** | ✅ `pages/` | ✅ `.vue` SFC import graph | — |
| **SvelteKit** | **L2** | ✅ `+page`/`+layout`/`+server` | ✅ `.svelte` + runtime (client/shared/server) | ✅ Prisma · Drizzle (conditional) |
| **Next.js Pages Router** | **L1** | ✅ SSG/ISR/SSR detection | — | — |
| **Remix** | **L1** | ✅ nested folder routes | — | — |
| **Vue SPA** | **L1** | ✅ `createRouter()` | — | — |
| **Angular** | **L1** | ✅ `provideRouter()` | — | — |
| **Flask** | **L1** | ✅ Blueprint routes | — | — |

**L3** = all 3 tabs · **L2** = routes + components or DB · **L1** = routes only

Frameworks not in this list (Express, Hono, Rails, Go, etc.) use **LLM primary** mode when an Anthropic API key is provided.

---

## ✨ What's new in v0.7.0

### HTTP method labels in diagrams
Backend routes now show method badges in the Rendering Architecture tab:
```
GET /api/users · SSR
POST /api/users · SSR
DELETE /api/users/:id · SSR
```
Supported for NestJS (`@Get`, `@Post`), FastAPI (`@router.get`), and Spring Boot (`@GetMapping`, `@PostMapping`).

### SvelteKit component runtime detection
Components are now tagged `client`, `shared`, or `server`:
- `+page.svelte` alone → `client`
- `+page.svelte` + `+page.server.ts` → `shared`
- `+page.server.ts` alone → `server`

### Remix nested route support
Folder-based nested routes are now scanned recursively:
```
app/routes/users/_index.tsx  → /users
app/routes/users/$id.tsx     → /users/:id
```

### Richer ORM column metadata
| ORM | New fields |
|---|---|
| Django ORM | `null=True` → nullable, `ForeignKey('User')` → FK target, `Meta.db_table` → table name |
| SQLAlchemy | `nullable=True/False`, actual column type (String/Integer/…), `__tablename__` |
| JPA | `@Column(nullable=false)`, `@JoinColumn(name="…")` as FK column |

### DB–Screen mapper connections (SvelteKit + NestJS)
SvelteKit and NestJS routes/components are now connected to their DB tables in the DB–Screen tab when ORM tables are detected.

---

## ✨ Features

| Tab | What you see |
|---|---|
| **Rendering Architecture** | Route hierarchy · HTTP method badges · SSR/CSR/ISR/SSG labels · infra layers |
| **Screen–Component** | Route → component import graph · runtime tags (client/shared/server) |
| **DB–Screen** | Tables · columns with types/nullable · FK targets · mapper connections to routes |

**Sidebar panel**
- Detected framework, parsing level (L1/L2/L3), route/table count, last cached time
- **Analyze** → **Re-analyze** button
- **Open Viewer** — opens the diagram panel

**Two analysis modes**

| Mode | What you get | API key |
|---|---|---|
| **Static analysis** | Full L3 for Next.js App Router. L2 routes+components+DB for NestJS/Django/FastAPI/Spring/Nuxt/SvelteKit. L1 routes for Remix/Vue/Angular/Flask/Pages. | Not required |
| **LLM-enhanced** (BYOK) | Fills gaps the static parser can't reach; infers dynamic route patterns | Required |

**Quality-of-life**
- Results are **cached permanently** in `.codesight/cache.json`
- Offline-friendly — Mermaid is bundled locally, no CDN required
- Pure Node.js — Python/Java AST via bundled WebAssembly, no native installs

---

## 🚀 Getting Started

### Install

- **VS Code** — search **"Codebase Architecture Visualizer"** in Extensions, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=cubha.codebase-arch-viz)
- **Cursor / VSCodium / code-server** — search in Extensions panel (served via [Open VSX](https://open-vsx.org/extension/cubha/codebase-arch-viz))

### Run

1. Open your project folder (`File → Open Folder`)
2. Click the **CodeSight icon** in the Activity Bar → **▶ Analyze Project**
3. Explore the three diagram tabs

Or use the Command Palette (`Ctrl+Shift+P`):
```
CodeSight: Analyze Project
```

---

## 🤖 LLM Analysis (BYOK)

CodeSight uses **Anthropic Claude** for deeper enrichment on top of static analysis. Your key is stored in VS Code's SecretStorage and never sent anywhere other than Anthropic's API.

**Setup**

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Click **🔑 Set API Key** in the sidebar
3. Toggle **Enable LLM Analysis**

**Model selection** (`codesight.model`)

| Value | Description |
|---|---|
| `claude-sonnet-4-6` | Default — best balance |
| `claude-haiku-4-5-20251001` | Faster, lower cost |
| `claude-opus-4-7` | Highest quality for large codebases |

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| `codesight.enableLLM` | `false` | Enable Claude-powered analysis |
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

No additional runtimes. Python and Java AST parsing uses bundled WebAssembly modules.

---

## 🔒 Privacy

- Your code is **never sent anywhere** in static-only mode
- In LLM mode, relevant source files are sent to the **Anthropic API using your own key**
- Anthropic's data handling: [anthropic.com/privacy](https://www.anthropic.com/privacy)
- Results cached locally in `.codesight/cache.json`

---

## 📦 Source

[github.com/cubha/codesight](https://github.com/cubha/codesight) — MIT License
