import type { SourceFile } from 'ts-morph'

// identifierName(코드에서 사용되는 이름) → moduleSpecifierValue.
// import { X as Y } from 'foo' 의 경우 Y(alias)가 키. alias가 없으면 원본 이름이 키.
// default import의 경우 default 식별자명이 키.
export function buildImportMap(sourceFile: SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const decl of sourceFile.getImportDeclarations()) {
    const di = decl.getDefaultImport()
    if (di !== undefined) map.set(di.getText(), decl.getModuleSpecifierValue())
    for (const ni of decl.getNamedImports()) {
      const localName = ni.getAliasNode()?.getText() ?? ni.getName()
      map.set(localName, decl.getModuleSpecifierValue())
    }
  }
  return map
}
