export interface LLMRouteEntry {
  path: string
  file: string
  mode: string
  components: string[]
}

export interface LLMTableEntry {
  name: string
  usedBy: string[]
}

export interface LLMBackendService {
  name: string          // e.g. "NestJS API"
  framework: string     // "nestjs" | "express" | "fastify" | "hono"
  modules?: string[]    // e.g. ["AuthModule", "CrmModule", "LmsModule"]
  entities?: string[]   // DB entity/table names the backend manages
  dbType?: string       // "postgresql" | "mysql" | "mongodb" | "sqlite"
}

export interface LLMAnalysisResult {
  framework: string
  deployTarget?: string   // "browser" | "server" | "mobile" | "edge"
  hasSupabase?: boolean
  hasPrisma?: boolean
  hasDexie?: boolean
  hasFirebase?: boolean
  routes: LLMRouteEntry[]
  tables: LLMTableEntry[]
  backendServices?: LLMBackendService[]
  inferenceNotes: string[]
}

export type { FrameworkKind } from '@codebase-viz/types'
