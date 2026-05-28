import { walkDir } from './file-finder.js'

export const VUE_SCRIPT_RE = /<script(?:\s[^>]*)?>(?<content>[\s\S]*?)<\/script>/
export const VUE_TEMPLATE_RE = /<template(?:\s[^>]*)?>(?<content>[\s\S]*?)<\/template>/
export const COMPONENT_TAG_RE = /<([A-Z][A-Za-z0-9]*)/g

// .vue 파일 단일 traverse. nuxt/vue-spa 공통.
export async function findVueFiles(repoRoot: string, excludeDirs: Set<string>): Promise<string[]> {
  return walkDir(repoRoot, { extensions: new Set(['.vue']), excludeDirs })
}
