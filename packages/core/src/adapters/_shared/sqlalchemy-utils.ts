import type Parser from 'web-tree-sitter'

export function extractStringContent(node: Parser.SyntaxNode): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child !== null && child.type === 'string_content') return child.text
  }
  return undefined
}

export function parseNullable(callNode: Parser.SyntaxNode): boolean {
  const argList = callNode.childForFieldName('arguments')
  if (argList === null) return true
  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null || arg.type !== 'keyword_argument') continue
    const key = arg.child(0)
    const val = arg.child(2)
    if (key?.text === 'nullable' && val !== null) {
      if (val.text === 'True') return true
      if (val.text === 'False') return false
    }
  }
  return true
}

export function parsePrimaryKey(callNode: Parser.SyntaxNode): boolean {
  const argList = callNode.childForFieldName('arguments')
  if (argList === null) return false
  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null || arg.type !== 'keyword_argument') continue
    const key = arg.child(0)
    const val = arg.child(2)
    if (key?.text === 'primary_key' && val?.text === 'True') return true
  }
  return false
}

export function parseMappedNullable(typeAnnotationNode: Parser.SyntaxNode | null): boolean | undefined {
  if (typeAnnotationNode === null) return undefined

  function findMappedNode(node: Parser.SyntaxNode): Parser.SyntaxNode | undefined {
    if (node.type === 'generic_type' && node.child(0)?.text === 'Mapped') return node
    if (node.type === 'subscript') {
      const valueNode = node.childForFieldName('value') ?? node.child(0)
      if (valueNode?.text === 'Mapped') return node
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child !== null) {
        const found = findMappedNode(child)
        if (found !== undefined) return found
      }
    }
    return undefined
  }

  const mappedNode = findMappedNode(typeAnnotationNode)
  if (mappedNode === undefined) return undefined

  let typeArgText: string | undefined
  if (mappedNode.type === 'generic_type') {
    typeArgText = mappedNode.child(1)?.text
  } else {
    const subscriptArg = mappedNode.childForFieldName('subscript') ?? mappedNode.child(2)
    typeArgText = subscriptArg?.text
  }

  if (typeArgText === undefined) return undefined

  if (
    typeArgText.includes('Optional') ||
    typeArgText.includes('| None') ||
    typeArgText.includes('None |')
  ) {
    return true
  }

  return false
}

export function parseColumnType(callNode: Parser.SyntaxNode, fallback: string): string {
  const argList = callNode.childForFieldName('arguments')
  if (argList === null) return fallback

  let firstPositionalType: string | undefined
  let hasForeignKey = false

  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null) continue
    if (arg.type === 'keyword_argument') continue
    if (arg.type === ',') continue

    if (arg.type === 'call') {
      const funcNode = arg.childForFieldName('function')
      const callName = funcNode?.type === 'attribute' ? funcNode.lastChild?.text : funcNode?.text
      if (callName === 'ForeignKey') {
        hasForeignKey = true
        continue
      }
      continue
    }

    if (arg.type === 'identifier' || arg.type === 'attribute') {
      if (firstPositionalType === undefined) {
        firstPositionalType = arg.type === 'attribute' ? (arg.lastChild?.text ?? arg.text) : arg.text
      }
      continue
    }
  }

  if (firstPositionalType === undefined) return fallback
  return hasForeignKey ? `${firstPositionalType}→FK` : firstPositionalType
}

export function parseForeignKeyRef(
  argList: Parser.SyntaxNode,
): { table: string; column: string } | undefined {
  for (let i = 0; i < argList.childCount; i++) {
    const arg = argList.child(i)
    if (arg === null || arg.type === 'keyword_argument' || arg.type === ',') continue
    if (arg.type !== 'call') continue
    const funcNode = arg.childForFieldName('function')
    const callName = funcNode?.type === 'attribute' ? funcNode.lastChild?.text : funcNode?.text
    if (callName !== 'ForeignKey') continue
    const fkArgs = arg.childForFieldName('arguments')
    if (fkArgs === null) continue
    for (let j = 0; j < fkArgs.childCount; j++) {
      const fkArg = fkArgs.child(j)
      if (fkArg === null || fkArg.type !== 'string') continue
      let content: string | undefined
      for (let k = 0; k < fkArg.childCount; k++) {
        const ch = fkArg.child(k)
        if (ch !== null && ch.type === 'string_content') { content = ch.text; break }
      }
      if (content === undefined) continue
      const dotIdx = content.indexOf('.')
      const table = dotIdx >= 0 ? content.slice(0, dotIdx) : content
      const column = dotIdx >= 0 ? content.slice(dotIdx + 1) : 'id'
      if (table.length > 0) return { table, column }
    }
  }
  return undefined
}
