import type { IAdapter } from '@codebase-viz/types'
import { nextJsAdapter } from './nextjs/index.js'
import { nuxtAdapter } from './nuxt/index.js'
import { svelteKitAdapter } from './sveltekit/index.js'
import { nestJsAdapter } from './nestjs/index.js'
import { djangoAdapter } from './django/index.js'
import { fastApiAdapter } from './fastapi/index.js'
import { springBootAdapter } from './springboot/index.js'

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
  registry.register(nuxtAdapter)
  registry.register(svelteKitAdapter)
  registry.register(nestJsAdapter)
  registry.register(djangoAdapter)
  registry.register(fastApiAdapter)
  registry.register(springBootAdapter)
  return registry
}
