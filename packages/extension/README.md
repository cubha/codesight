# CodeSight

**Visualize your Next.js + Supabase codebase — rendering architecture, component trees, and DB schema — directly inside VS Code.**

CodeSight analyzes your project and renders three interactive Mermaid diagrams in a side panel, giving you an instant architectural overview without reading hundreds of files.

---

## Features

| Tab | What you see |
|---|---|
| **Rendering Architecture** | Route hierarchy with SSR / CSR / ISR / SSG labels per route |
| **Screen–Component** | Which components each route renders, with import chains |
| **DB–Screen** | Tables, columns, FK relations, and which pages/server actions query each table |

**Smart analysis modes**

- **Static only** (no API key required) — parses your file system, routes, and Supabase calls
- **LLM-enhanced** (BYOK — Bring Your Own Key) — feeds your code to Claude for richer results: routing modes, component roles, backend services

**Quality-of-life**

- Results are **cached permanently** — reopening VS Code shows the last analysis instantly
- **Re-analyze** button in the viewer header forces a fresh scan
- **Export dropdown** (PNG / SVG / Markdown) — save any diagram with one click
- Works with Next.js 14 / 15 App Router projects

---

## Getting Started

### 1. Open a Next.js project

Open your project folder in VS Code (`File → Open Folder`).

### 2. Run the analysis

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
CodeSight: Analyze Project
```

A side panel opens with the three diagram tabs.

### 3. (Optional) Enable LLM analysis

For richer results, set your Anthropic API key:

```
CodeSight: Set Anthropic API Key
```

Then toggle **LLM analysis** in Settings:

```
codesight.enableLLM: true
```

Your key is stored in VS Code's **SecretStorage** — it never leaves your machine.

---

## LLM Analysis (BYOK)

CodeSight uses **Anthropic Claude** for deep semantic analysis. You supply the API key; CodeSight never stores it on any server.

**Getting a key**

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key under API Keys
3. Paste it via `CodeSight: Set Anthropic API Key`

**Model selection** (`codesight.model`)

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
- Next.js 14 or 15 project with App Router
- Supabase (optional — DB–Screen tab requires Supabase usage)

---

## Privacy

- Your code is **never sent anywhere** in static-only mode
- In LLM mode, relevant source files are sent to the Anthropic API using **your own key**
- Anthropic's data handling policies apply: [anthropic.com/privacy](https://www.anthropic.com/privacy)
- Analysis results are cached locally in `.codesight/cache.json` in your project

---

## Source

[github.com/cubha/codesight](https://github.com/cubha/codesight) — MIT License
