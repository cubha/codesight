import Anthropic from '@anthropic-ai/sdk'
import type { LLMAnalysisResult } from './schema.js'

const SYSTEM_PROMPT = `You are a code architecture analyzer. Analyze the provided source code and return a JSON object describing the project structure.

Return ONLY valid JSON matching this schema:
{
  "framework": string,       // "nextjs-app-router" | "nextjs-pages" | "vite-react" | "nuxt" | "sveltekit" | "expo" | "nestjs" | or any detected framework
  "deployTarget": string,    // "browser" | "server" | "mobile" | "edge" — where the frontend runs
  "hasSupabase": boolean,    // true if @supabase/supabase-js or supabase client is used
  "hasPrisma": boolean,      // true if @prisma/client is used
  "hasDexie": boolean,       // true if dexie (IndexedDB wrapper) is used
  "hasFirebase": boolean,    // true if firebase SDK is used
  "routes": [
    {
      "path": string,        // URL path e.g. "/blog/[slug]"
      "file": string,        // repo-relative file path
      "mode": string,        // "SSR" | "CSR" | "SSG" | "ISR" | "unknown"
      "components": string[] // component names rendered on this route
    }
  ],
  "tables": [
    {
      "name": string,        // table/collection/entity name
      "usedBy": string[]     // FRONTEND component names that query this resource (API calls, direct DB queries). Do NOT include backend module names.
    }
  ],
  "backendServices": [
    {
      "name": string,        // e.g. "NestJS API"
      "framework": string,   // "nestjs" | "express" | "fastify" | "hono" | "django" | "rails"
      "modules": string[],   // top-level module/domain names (e.g. ["AuthModule", "CrmModule"])
      "entities": string[],  // DB entity/table names this backend manages
      "dbType": string       // "postgresql" | "mysql" | "mongodb" | "sqlite"
    }
  ],
  "inferenceNotes": string[] // brief reasoning notes
}

Rules:
- Detect framework from package.json deps and config files; don't rely only on the hint provided
- If files from multiple apps are provided (monorepo), set "framework" to the PRIMARY frontend framework and list backend apps in "backendServices"
- deployTarget: "browser" for SPAs (Vite/CRA/Next.js-CSR), "server" for SSR (Next.js/Nuxt), "mobile" for Expo/React Native
- Only include routes that are actual UI pages/screens (not API endpoints)
- tables: what the FRONTEND queries via API calls or direct DB — set usedBy to frontend component names only
- backendServices: NestJS/Express/FastAPI apps found in the codebase — list their modules and entity names
- Set mode to "CSR" if "use client" directive is present, "SSR" for server components
- ISR if revalidate is set, SSG if generateStaticParams with no revalidate
- If no backend is found, set backendServices to []`

export interface LLMClientOptions {
  apiKey: string
  model?: string
  maxTokens?: number
}

export interface AnalyzeOptions {
  projectName: string
  framework: string
  fileContents: Record<string, string>
}

export async function analyzWithLLM(
  options: LLMClientOptions,
  analyzeOptions: AnalyzeOptions,
): Promise<LLMAnalysisResult> {
  const client = new Anthropic({ apiKey: options.apiKey })
  const model = options.model ?? 'claude-sonnet-4-5'
  const maxTokens = options.maxTokens ?? 8000

  const fileBlock = Object.entries(analyzeOptions.fileContents)
    .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n')

  const userMessage = `Project: ${analyzeOptions.projectName}
Detected framework: ${analyzeOptions.framework}

Analyze the following source files and return the JSON structure:

${fileBlock}`

  const message = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const textContent = message.content.find(c => c.type === 'text')
  if (textContent === undefined || textContent.type !== 'text') {
    throw new Error('LLM returned no text content')
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]+\}/)
  if (jsonMatch === null) {
    throw new Error('LLM response does not contain valid JSON')
  }

  return JSON.parse(jsonMatch[0]) as LLMAnalysisResult
}
