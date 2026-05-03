# Codebase Architecture Visualizer

**AI-powered codebase visualizer — rendering architecture, component trees, and DB schema — directly inside VS Code.**

Understand your codebase at a glance. CodeSight analyzes your project and renders three interactive Mermaid diagrams in a side panel, giving you an instant architectural overview without reading hundreds of files.

---

## How It Looks

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

## Features

| Tab | What you see |
|---|---|
| **Rendering Architecture** | Route hierarchy with SSR / CSR / ISR / SSG labels, infrastructure and data layers |
| **Screen–Component** | Which components each route renders, with import chains |
| **DB–Screen** | Tables, columns, FK relations, and which pages / server actions query each table |

**Sidebar panel**
- Shows project name, route/table count, and last cached time
- **Analyze** button (first run) → **Re-analyze** button (after cached)
- **Open Viewer** opens the diagram panel (active only when cache exists)
- **Export** — PNG / SVG / Markdown with one click

**Smart analysis modes**
- **Static only** (no API key required) — parses your file system, routes, and DB calls out of the box
- **LLM-enhanced** (BYOK) — feeds your code to Claude for deep analysis: routing modes, component roles, backend services, and more

**Quality-of-life**
- Results are **cached permanently** — reopening VS Code shows the last analysis instantly, no re-run needed
- **Re-analyze** forces a fresh scan when you've made changes
- Offline-friendly — Mermaid is bundled locally, no CDN required

---

## Getting Started

### 1. Open a project

Open your project folder in VS Code (`File → Open Folder`).

### 2. Run the analysis

Click the **CodeSight icon** in the Activity Bar (left sidebar) → click **▶ Analyze Project**.

Or use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
```
CodeSight: Analyze Project
```

### 3. Explore the diagrams

The viewer opens beside your editor with three tabs. Use the sidebar to re-analyze, open the viewer again, or export.

---

## LLM Analysis (BYOK)

CodeSight uses **Anthropic Claude** for deep semantic analysis. You supply the API key — it is stored securely in VS Code's SecretStorage and never sent to any server other than Anthropic's API.

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

## Settings

| Setting | Default | Description |
|---|---|---|
| `codesight.enableLLM` | `false` | Enable Claude-powered deep analysis |
| `codesight.model` | `claude-sonnet-4-6` | Claude model to use |

---

## Commands

| Command | Description |
|---|---|
| `CodeSight: Analyze Project` | Run analysis and open the viewer |
| `CodeSight: Set Anthropic API Key` | Store your API key securely |
| `CodeSight: Clear Anthropic API Key` | Remove the stored key |

---

## Requirements

- VS Code 1.90+
- Node.js 20+ (for the analysis engine)
- Any web project — LLM mode covers a wide range of stacks
- Supabase (optional — DB–Screen tab works best with Supabase usage)

---

## Privacy

- Your code is **never sent anywhere** in static-only mode
- In LLM mode, relevant source files are sent to the **Anthropic API using your own key**
- Anthropic's data handling: [anthropic.com/privacy](https://www.anthropic.com/privacy)
- Analysis results are cached locally in `.codesight/cache.json` in your project

---

## Source

[github.com/cubha/codesight](https://github.com/cubha/codesight) — MIT License
