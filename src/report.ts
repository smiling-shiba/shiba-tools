import { locate } from './yaml-source.ts'
import type { PathSegment, YamlSource } from './yaml-source.ts'
import type { Diagnostic, Severity } from './diagnostics.ts'

export interface Located {
  file: string
  source: YamlSource
}

export class Report {
  readonly items: Diagnostic[] = []

  at(where: Located, path: readonly PathSegment[], target: 'value' | 'key', severity: Severity, code: string, message: string, suggestion?: string): void {
    const position = locate(where.source, path, target)
    this.items.push({ severity, file: where.file, ...position, code, message, ...(suggestion === undefined ? {} : { suggestion }) })
  }

  plain(file: string, severity: Severity, code: string, message: string): void {
    this.items.push({ severity, file, line: 0, column: 0, code, message })
  }

  syntax(where: Located): boolean {
    for (const problem of where.source.syntaxProblems) {
      this.items.push({ severity: 'error', file: where.file, line: problem.line, column: problem.column, code: 'SH010', message: `YAML syntax error: ${problem.message}` })
    }
    return where.source.syntaxProblems.length > 0
  }
}
