import { parseArgs } from 'node:util'
import { countBySeverity, formatDiagnostic } from './diagnostics.ts'
import { VSCODE_SETTINGS, VSCODE_SETTINGS_FILE, writeSchemas } from './schemas.ts'
import { validatePack } from './validate.ts'

export interface CliIo {
  out(text: string): void
  err(text: string): void
}

const USAGE = `Usage: sht validate [packDir] [--json]
       sht schemas [packDir]

Commands:
  validate   Check a pack's templates against its policy contract.
  schemas    Generate editor schemas (.shiba/) for autocomplete in VS Code.

Options:
  --json     Print diagnostics as JSON.
  -h, --help Show this help.

Exit codes: 0 no errors (warnings allowed), 1 errors found, 2 bad usage.`

function runSchemas(packDir: string, io: CliIo): number {
  const result = writeSchemas(packDir)
  const { errors } = countBySeverity(result.diagnostics)
  for (const diagnostic of result.diagnostics) io.out(formatDiagnostic(diagnostic))
  if (errors > 0) {
    io.err('Cannot generate schemas until the pack loads. Fix the problems above (see "sht validate").')
    return 1
  }
  for (const file of result.written) io.out(`Wrote ${file}`)
  if (result.settings === 'created') {
    io.out(`Created ${VSCODE_SETTINGS_FILE}`)
  } else {
    io.out(`${VSCODE_SETTINGS_FILE} already exists and was left alone. Make sure it contains:\n${JSON.stringify(VSCODE_SETTINGS, null, 2)}`)
  }
  io.out('Open the pack folder in VS Code (with the "YAML" extension by Red Hat) to get autocomplete.')
  return 0
}

/** Runs the sht command line and returns the process exit code. */
export function main(argv: readonly string[], io: CliIo): number {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
      allowPositionals: true,
    })
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`)
    return 2
  }

  const [command, packDir = '.'] = parsed.positionals
  if (parsed.values.help) {
    io.out(USAGE)
    return 0
  }
  if (command === 'schemas') return runSchemas(packDir, io)
  if (command !== 'validate') {
    io.err(command === undefined ? USAGE : `Unknown command "${command}"\n\n${USAGE}`)
    return 2
  }

  const diagnostics = validatePack(packDir)
  const { errors, warnings } = countBySeverity(diagnostics)
  if (parsed.values.json) {
    io.out(JSON.stringify({ diagnostics, errors, warnings }, null, 2))
  } else {
    for (const diagnostic of diagnostics) io.out(formatDiagnostic(diagnostic))
    io.out(errors === 0 && warnings === 0 ? 'OK: no problems found' : `${errors} error(s), ${warnings} warning(s)`)
  }
  return errors > 0 ? 1 : 0
}
