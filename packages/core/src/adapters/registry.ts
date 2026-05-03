import type { IAdapter } from '@codebase-viz/types'
import { nextJsAdapter } from './nextjs/index.js'

export class AdapterRegistry {
  private readonly adapters = new Map<string, IAdapter>()

  register(adapter: IAdapter): void {
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string | undefined): IAdapter | undefined {
    if (id === undefined) return undefined
    return this.adapters.get(id)
  }

  has(id: string): boolean {
    return this.adapters.has(id)
  }

  list(): IAdapter[] {
    return [...this.adapters.values()]
  }
}

export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry()
  registry.register(nextJsAdapter)
  return registry
}
