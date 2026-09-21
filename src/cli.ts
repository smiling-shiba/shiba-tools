import { parseArgs } from 'node:util'
import { buildPolicy } from './build-policy.ts'
import { packPack } from './pack-lock.ts'
import { signPack, verifyPack, writeKeyPair } from './signing.ts'
import { countBySeverity, formatDiagnostic } from './diagnostics.ts'
import { VSCODE_SETTINGS, VSCODE_SETTINGS_FILE, writeSchemas } from './schemas.ts'
import { validatePack } from './validate.ts'

export interface CliIo {
  out(text: string): void
  err(text: string): void
}

const USAGE = `Usage: sht validate [packDir] [--json]
       sht schemas [packDir]
       sht build-policy <policySource> [--pack <packDir>] [--version <calver>] [--force]
       sht pack [packDir]
       sht keygen <name> [--out <dir>] [--force]
       sht sign [packDir] --key <privateKeyFile>
       sht verify [packDir] [--trust <publicKeyOrFolder>] [--require-signature]

Commands:
  validate   Check a pack's templates against its policy contract.
  schemas    Generate editor schemas (.shiba/) for autocomplete in VS Code.
  build-policy  Bundle a policy source file into <packDir>/policies/ with its contract.
  pack       Check the pack, then list every file with its hash in pack.lock.json.
  keygen     Create a signing key pair: <name>.key (private) and <name>.pub (public).
  sign       Sign pack.lock.json with a private key, writing pack.sig.json.
  verify     Check the files against pack.lock.json and the signature against trusted keys.

Options:
  --json     Print diagnostics as JSON (validate).
  --pack     Pack folder for build-policy (default: current folder).
  --version  Calver for build-policy, instead of a generated one (YYYY.MM.DD.N).
  --force    Rebuild even if the source is unchanged, replace an existing version, or overwrite keys.
  --key      Private key file for sign.
  --trust    Public key file, or folder of *.pub files, whose signers verify trusts.
  --require-signature  Make verify fail if the pack is unsigned or the signer is not trusted.
  --out      Folder for keygen (default: current folder).
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

function runPack(packDir: string, io: CliIo): number {
  const result = packPack(packDir)
  for (const item of result.diagnostics) io.out(formatDiagnostic(item))
  if (result.status === 'failed') {
    io.out(`Pack failed: ${countBySeverity(result.diagnostics).errors} error(s)`)
    return 1
  }
  const what = `${result.id ?? ''} ${result.version ?? ''}: ${result.filesLocked} files locked in pack.lock.json`
  io.out(result.status === 'unchanged' ? `Up to date: ${what}` : `Packed ${what}`)
  if (result.removedSignature) io.out('Removed the old pack.sig.json because it no longer matched. Run sht sign again.')
  return 0
}

function runKeygen(name: string | undefined, values: { out?: string; force?: boolean }, io: CliIo): number {
  if (name === undefined) {
    io.err(`Missing the key name.\n\n${USAGE}`)
    return 2
  }
  const result = writeKeyPair(name, values.out ?? '.', values.force ?? false)
  for (const item of result.diagnostics) io.out(formatDiagnostic(item))
  if (!result.files) return 1
  io.out(`Wrote ${result.files.privateKey}  (private: keep it secret and never commit it)`)
  io.out(`Wrote ${result.files.publicKey}  (public: share this)`)
  io.out(`Key id: ${result.files.keyId}`)
  return 0
}

function runSign(packDir: string, key: string | undefined, io: CliIo): number {
  if (key === undefined) {
    io.err(`Missing --key <private key file>.\n\n${USAGE}`)
    return 2
  }
  const result = signPack(packDir, key)
  for (const item of result.diagnostics) io.out(formatDiagnostic(item))
  if (countBySeverity(result.diagnostics).errors > 0) {
    io.out('Signing failed')
    return 1
  }
  io.out(`Signed with key ${result.keyId ?? ''}. Wrote pack.sig.json`)
  return 0
}

function runVerify(packDir: string, values: { trust?: string; 'require-signature'?: boolean }, io: CliIo): number {
  const result = verifyPack(packDir, {
    ...(values.trust === undefined ? {} : { trust: values.trust }),
    requireSignature: values['require-signature'] ?? false,
  })
  for (const item of result.diagnostics) io.out(formatDiagnostic(item))
  if (result.status === 'failed') {
    io.out(`Verification failed: ${countBySeverity(result.diagnostics).errors} error(s)`)
    return 1
  }
  io.out(`Verified: ${result.filesChecked} files match pack.lock.json`)
  if (!result.signed || !result.signer) io.out('Not signed')
  else io.out(result.signer.trusted ? `Signed by key ${result.signer.keyId} (trusted)` : `Signed by key ${result.signer.keyId} (signer not established)`)
  return 0
}

async function runBuildPolicy(entry: string | undefined, values: { pack?: string; version?: string; force?: boolean }, io: CliIo): Promise<number> {
  if (entry === undefined) {
    io.err(`Missing the policy source file.\n\n${USAGE}`)
    return 2
  }
  const packDir = values.pack ?? '.'
  const result = await buildPolicy({
    entry,
    packDir,
    ...(values.version === undefined ? {} : { version: values.version }),
    ...(values.force === undefined ? {} : { force: values.force }),
  })
  for (const diagnostic of result.diagnostics) io.out(formatDiagnostic(diagnostic))
  const { errors } = countBySeverity(result.diagnostics)
  if (result.status === 'failed') {
    io.out(`Build failed: ${errors} error(s)`)
    return 1
  }
  if (result.status === 'unchanged') {
    io.out(`Up to date: ${result.name ?? ''} (source unchanged; use --force to rebuild)`)
  } else {
    io.out(`Built ${result.name ?? ''}`)
    for (const file of result.files) io.out(`  ${file}`)
  }
  if (!result.active) io.out(`To use it, set "policy: ${result.name ?? ''}" in ${packDir === '.' ? '' : `${packDir}/`}pack.yml`)
  return 0
}

/** Runs the sht command line and returns the process exit code. */
export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        pack: { type: 'string' },
        version: { type: 'string' },
        force: { type: 'boolean' },
        key: { type: 'string' },
        trust: { type: 'string' },
        out: { type: 'string' },
        'require-signature': { type: 'boolean' },
      },
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
  if (command === 'build-policy') return runBuildPolicy(parsed.positionals[1], parsed.values, io)
  if (command === 'pack') return runPack(packDir, io)
  if (command === 'keygen') return runKeygen(parsed.positionals[1], parsed.values, io)
  if (command === 'sign') return runSign(packDir, parsed.values.key, io)
  if (command === 'verify') return runVerify(packDir, parsed.values, io)
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
