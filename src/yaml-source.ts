import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml'
import type { Document } from 'yaml'

export interface Position {
  line: number
  column: number
}

export interface SyntaxProblem extends Position {
  message: string
}

/** A parsed YAML file that can map data paths back to line and column. */
export interface YamlSource {
  document: Document.Parsed
  lineCounter: LineCounter
  /** Plain JavaScript value, or undefined when the file has syntax errors. */
  value: unknown
  syntaxProblems: SyntaxProblem[]
}

export type PathSegment = string | number

export function parseYamlSource(text: string): YamlSource {
  const lineCounter = new LineCounter()
  const document = parseDocument(text, { lineCounter })
  const syntaxProblems = document.errors.map((error) => {
    const start = error.linePos?.[0]
    return {
      message: (error.message.split('\n')[0] ?? error.message).replace(/ at line \d+, column \d+:?$/, ''),
      line: start?.line ?? 1,
      column: start?.col ?? 1,
    }
  })
  return {
    document,
    lineCounter,
    value: syntaxProblems.length === 0 ? document.toJS() : undefined,
    syntaxProblems,
  }
}

function rangeStart(node: unknown): number | undefined {
  if (typeof node !== 'object' || node === null || !('range' in node)) return undefined
  const range = node.range
  if (!Array.isArray(range)) return undefined
  const start: unknown = range[0]
  return typeof start === 'number' ? start : undefined
}

/**
 * Finds where the value at `path` starts, or where its key starts when
 * `target` is "key". If the path is not fully present it returns the closest
 * ancestor that is.
 */
export function locate(source: YamlSource, path: readonly PathSegment[], target: 'value' | 'key' = 'value'): Position {
  let node: unknown = source.document.contents
  for (const [index, segment] of path.entries()) {
    if (isMap(node)) {
      const pair = node.items.find((item) => isScalar(item.key) && String(item.key.value) === String(segment))
      if (!pair) break
      node = target === 'key' && index === path.length - 1 ? pair.key : pair.value
    } else if (isSeq(node) && typeof segment === 'number') {
      const item: unknown = node.items[segment]
      if (item === undefined) break
      node = item
    } else {
      break
    }
  }
  const position = source.lineCounter.linePos(rangeStart(node) ?? 0)
  return { line: position.line, column: position.col }
}
