import { describe, it, expect } from 'vitest'
import { resolveSelectedFolder } from './folder-utils.js'

describe('resolveSelectedFolder (P2)', () => {
  it('빈 폴더 목록 → undefined', () => {
    expect(resolveSelectedFolder([], undefined)).toBeUndefined()
  })

  it('저장된 경로 없음 → 첫 폴더 fallback', () => {
    const folders = [
      { uri: { fsPath: '/a' }, name: 'a' },
      { uri: { fsPath: '/b' }, name: 'b' },
    ]
    expect(resolveSelectedFolder(folders, undefined)).toBe('/a')
  })

  it('저장된 경로가 목록에 있음 → 저장된 경로 반환', () => {
    const folders = [
      { uri: { fsPath: '/a' }, name: 'a' },
      { uri: { fsPath: '/b' }, name: 'b' },
    ]
    expect(resolveSelectedFolder(folders, '/b')).toBe('/b')
  })

  it('저장된 경로가 목록에 없음 (폴더 제거됨) → 첫 폴더 fallback', () => {
    const folders = [
      { uri: { fsPath: '/a' }, name: 'a' },
      { uri: { fsPath: '/b' }, name: 'b' },
    ]
    expect(resolveSelectedFolder(folders, '/c-removed')).toBe('/a')
  })

  it('단일 폴더 + 저장된 경로 일치 → 그 폴더', () => {
    const folders = [{ uri: { fsPath: '/only' }, name: 'only' }]
    expect(resolveSelectedFolder(folders, '/only')).toBe('/only')
  })
})
