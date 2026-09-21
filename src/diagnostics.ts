export type Severity = 'error' | 'warning'

/** One problem found while validating a pack. Line and column are 1-based; 0 means "no location". */
export interface Diagnostic {
  severity: Severity
  /** Path relative to the pack directory, using forward slashes. */
  file: string
  line: number
  column: number
  code: string
  message: string
  suggestion?: string
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.line > 0
    ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
    : diagnostic.file
  const head = `${location}  ${diagnostic.severity}  ${diagnostic.code}  ${diagnostic.message}`
  return diagnostic.suggestion ? `${head}\n    ${diagnostic.suggestion}` : head
}

export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code))
}

export function countBySeverity(diagnostics: readonly Diagnostic[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') errors += 1
    else warnings += 1
  }
  return { errors, warnings }
}
