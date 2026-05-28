import { describe, it, expect } from 'vitest'
import { Project } from 'ts-morph'
import { buildImportMap } from './ts-morph-utils.js'

function makeSF(code: string) {
  const project = new Project({
    compilerOptions: { target: 99, allowJs: true, jsx: 4 },
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
  })
  return project.createSourceFile('/virtual/test.ts', code)
}

describe('buildImportMap', () => {
  it('default import: 식별자명 → moduleSpec', () => {
    const sf = makeSF(`import Home from './pages/Home'`)
    const m = buildImportMap(sf)
    expect(m.get('Home')).toBe('./pages/Home')
  })

  it('named import: 원본 이름이 키', () => {
    const sf = makeSF(`import { HomePage } from '@/pages/home-page'`)
    const m = buildImportMap(sf)
    expect(m.get('HomePage')).toBe('@/pages/home-page')
  })

  it('named import + as rename: alias 이름이 키 (원본 이름은 키가 아님)', () => {
    const sf = makeSF(`import { MenuPage as MenuManagePage } from '@/pages/system/menu/menu-manage-page'`)
    const m = buildImportMap(sf)
    expect(m.get('MenuManagePage')).toBe('@/pages/system/menu/menu-manage-page')
    expect(m.get('MenuPage')).toBeUndefined()
  })

  it('default + named 혼합', () => {
    const sf = makeSF(`import React, { useState, useEffect as effect } from 'react'`)
    const m = buildImportMap(sf)
    expect(m.get('React')).toBe('react')
    expect(m.get('useState')).toBe('react')
    expect(m.get('effect')).toBe('react')
    expect(m.get('useEffect')).toBeUndefined()
  })

  it('다중 import 선언이 같은 모듈 spec을 가리킬 수 있음', () => {
    const sf = makeSF(`
      import { HomePage } from '@/pages/home-page'
      import { CodePage } from '@/pages/system/code/code-page'
    `)
    const m = buildImportMap(sf)
    expect(m.get('HomePage')).toBe('@/pages/home-page')
    expect(m.get('CodePage')).toBe('@/pages/system/code/code-page')
  })

  it('namespace import는 수집하지 않음 (현재 정책)', () => {
    const sf = makeSF(`import * as path from 'node:path'`)
    const m = buildImportMap(sf)
    expect(m.get('path')).toBeUndefined()
  })
})
