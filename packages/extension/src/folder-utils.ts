export interface FolderLike {
  uri: { fsPath: string }
  name: string
}

export function resolveSelectedFolder(
  folders: readonly FolderLike[],
  savedPath: string | undefined,
): string | undefined {
  if (folders.length === 0) return undefined
  if (savedPath !== undefined) {
    const match = folders.find(f => f.uri.fsPath === savedPath)
    if (match !== undefined) return match.uri.fsPath
  }
  return folders[0]?.uri.fsPath
}
