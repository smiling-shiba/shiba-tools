import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { join, relative, resolve } from 'node:path'
import { build } from 'esbuild'
import type { Message } from 'esbuild'
import { isRecord, parseContract } from './contract.ts'
import { sortDiagnostics } from './diagnostics.ts'
import type { Diagnostic, Severity } from './diagnostics.ts'
import { parseYamlSource } from './yaml-source.ts'

/*
 * Diagnostic codes for building a policy (placeholder SH prefix, like the others).
 *   SH600 entry file not found          SH601 policy imports a host module
 *   SH602 other build error             SH603 policy failed while loading
 *   SH604 no valid default export       SH605 policy id cannot be used in file names
 *   SH606 invalid --version             SH607 policy version already exists
 *   SH608 policy produced a bad contract  SH609 locale-dependent API in the source
 *   SH650 non-deterministic API in the source (warning)
 */

const CALVER = /^(\d{4})\.(0[1-9]|1[0-2])\.(0[1-9]|[12]\d|3[01])\.([1-9]\d*)$/
const POLICY_ID = /^[a-z0-9][a-z0-9_-]*$/i
const RESULT_MARKER = '@@SHT-RESULT@@'
/** The bundle is a plain script that sets this global to the policy's exports (`.default` is the policy). */
const BUNDLE_GLOBAL = 'shibaPolicy'

/** APIs whose results differ between runs or hosts. A policy must be deterministic. */
const NON_DETERMINISTIC: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\bMath\.random\s*\(/, what: 'Math.random()' },
  { pattern: /\bDate\.now\s*\(/, what: 'Date.now()' },
  { pattern: /\bnew\s+Date\b/, what: 'new Date()' },
  { pattern: /\bperformance\.now\s*\(/, what: 'performance.now()' },
  { pattern: /\bfetch\s*\(/, what: 'fetch()' },
  { pattern: /\b(?:setTimeout|setInterval)\s*\(/, what: 'timers' },
  { pattern: /\bprocess\./, what: 'process' },
  { pattern: /\brequire\s*\(/, what: 'require()' },
]

/**
 * APIs that depend on the host's locale data. They give different results on
 * different engines (the server's embedded engine has no locale support), so a
 * policy may not use them. Text shown to players belongs in the app, not in rules.
 */
const LOCALE_DEPENDENT: readonly { pattern: RegExp; what: string }[] = [
  { pattern: /\.localeCompare\s*\(/, what: 'localeCompare()' },
  { pattern: /\.toLocale\w*\s*\(/, what: 'toLocaleString() and the other toLocale...() methods' },
  { pattern: /\bIntl\b/, what: 'Intl' },
]

/** Runs in a child Node process so the policy's code never runs inside sht itself. */
const LOADER = `
import vm from 'node:vm'
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const source = Buffer.concat(chunks).toString('utf8')
const request = JSON.parse(process.argv[1])
const send = (value) => process.stdout.write('\\n${RESULT_MARKER}' + JSON.stringify(value))
try {
  const context = vm.createContext({})
  vm.runInContext(source, context, { timeout: 10_000 })
  const policy = vm.runInContext('${BUNDLE_GLOBAL}', context)?.default
  if (typeof policy !== 'object' || policy === null || typeof policy.id !== 'string' || typeof policy.contract !== 'function') {
    send({ ok: false, code: 'SH604', message: 'The policy file must export the result of definePolicy(...) as its default export' })
  } else if (request.mode === 'id') {
    send({ ok: true, id: policy.id })
  } else {
    send({ ok: true, id: policy.id, contract: policy.contract(request.options) })
  }
} catch (error) {
  send({ ok: false, code: 'SH603', message: error instanceof Error ? error.message : String(error) })
}
`

export interface BuildPolicyOptions {
  /** The policy source file (TypeScript or JavaScript). */
  entry: string
  /** The pack folder; output goes to its `policies/` folder. */
  packDir: string
  /** A calver to use instead of a generated one. */
  version?: string
  /** Build even if the source is unchanged, and overwrite an existing version. */
  force?: boolean
  /** Clock used to generate the calver. Injectable for tests. */
  now?: () => Date
}

export interface BuildPolicyResult {
  status: 'built' | 'unchanged' | 'failed'
  /** File name without extension, for example `toy-policy-2026.09.19.1`. */
  name: string | undefined
  /** Files written, relative to the pack folder. */
  files: string[]
  /** True when pack.yml already names this policy as the active one. */
  active: boolean
  diagnostics: Diagnostic[]
}

interface ChildResult {
  ok: boolean
  id?: string
  contract?: unknown
  code?: string
  message?: string
}

function failure(diagnostics: Diagnostic[]): BuildPolicyResult {
  return { status: 'failed', name: undefined, files: [], active: false, diagnostics: sortDiagnostics(diagnostics) }
}

function diagnostic(file: string, severity: Severity, code: string, message: string, line = 0, column = 0): Diagnostic {
  return { severity, file, line, column, code, message }
}

function fromBuildMessage(message: Message, fallbackFile: string): Diagnostic {
  const specifier = /^Could not resolve "([^"]+)"/.exec(message.text)?.[1]
  const file = message.location?.file ?? fallbackFile
  const line = message.location?.line ?? 0
  const column = (message.location?.column ?? -1) + 1
  if (specifier !== undefined && isBuiltin(specifier)) {
    return diagnostic(file, 'error', 'SH601', `Policies must not import host modules, but this imports "${specifier}". Policy code runs in other environments as well as Node.`, line, column)
  }
  return diagnostic(file, 'error', 'SH602', message.text, line, column)
}

function isBuildFailure(error: unknown): error is { errors: Message[] } {
  return isRecord(error) && Array.isArray(error.errors)
}

function scanSource(inputs: readonly string[], cwd: string): Diagnostic[] {
  const found: Diagnostic[] = []
  for (const input of inputs) {
    if (input.split(/[\\/]/).includes('node_modules') || !/\.(?:[cm]?[jt]s)$/.test(input)) continue
    const path = resolve(cwd, input)
    if (!existsSync(path)) continue
    readFileSync(path, 'utf8').split('\n').forEach((text, index) => {
      const trimmed = text.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
      for (const { pattern, what } of LOCALE_DEPENDENT) {
        const match = pattern.exec(text)
        if (match) {
          found.push(diagnostic(input, 'error', 'SH609', `${what} depends on the host's locale and gives different results on different engines; policies must not use it (compare code points, and keep player-facing text out of the rules)`, index + 1, match.index + 1))
        }
      }
      for (const { pattern, what } of NON_DETERMINISTIC) {
        const match = pattern.exec(text)
        if (match) {
          found.push(diagnostic(input, 'warning', 'SH650', `${what} can give different results between runs or hosts; policies must be deterministic`, index + 1, match.index + 1))
        }
      }
    })
  }
  return found
}

function runLoader(bundle: string, request: unknown): ChildResult | { error: string } {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', LOADER, JSON.stringify(request)], {
    input: bundle,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  })
  if (child.error) return { error: child.error.message }
  const start = child.stdout.lastIndexOf(RESULT_MARKER)
  if (start === -1) return { error: (child.stderr.trim() || 'The policy did not finish loading').split('\n')[0] ?? 'The policy did not finish loading' }
  const parsed: unknown = JSON.parse(child.stdout.slice(start + RESULT_MARKER.length))
  if (!isRecord(parsed) || typeof parsed.ok !== 'boolean') return { error: 'Unexpected result from the policy loader' }
  return {
    ok: parsed.ok,
    ...(typeof parsed.id === 'string' ? { id: parsed.id } : {}),
    ...('contract' in parsed ? { contract: parsed.contract } : {}),
    ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
    ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
  }
}

function compareCalver(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 4; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Versions already built for `id` in a policies folder, oldest first. */
function existingVersions(policiesDir: string, id: string): string[] {
  if (!existsSync(policiesDir)) return []
  const pattern = new RegExp(`^${escapeRegExp(id)}-policy-(.+)\\.contract\\.json$`)
  return readdirSync(policiesDir)
    .map((name) => pattern.exec(name)?.[1])
    .filter((version): version is string => version !== undefined && CALVER.test(version))
    .sort(compareCalver)
}

function nextVersion(existing: readonly string[], now: Date): string {
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  const builds = existing.filter((version) => version.startsWith(`${date}.`)).map((version) => Number(version.slice(date.length + 1)))
  return `${date}.${Math.max(0, ...builds) + 1}`
}

function recordedHash(policiesDir: string, id: string, version: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(policiesDir, `${id}-policy-${version}.contract.json`), 'utf8'))
    const policy = isRecord(parsed) ? parsed.policy : undefined
    return isRecord(policy) && typeof policy.sha256 === 'string' ? policy.sha256 : undefined
  } catch {
    return undefined
  }
}

function isActive(packDir: string, name: string): boolean {
  const path = join(packDir, 'pack.yml')
  if (!existsSync(path)) return false
  const value = parseYamlSource(readFileSync(path, 'utf8')).value
  return isRecord(value) && value.policy === name
}

/**
 * Builds a policy source file into `<packDir>/policies/`: a minified bundle and its
 * generated contract, named `<id>-policy-<calver>`. The build does not type-check;
 * run the TypeScript compiler in the project for that. It does run the policy's code
 * (in a separate process) to read its definition.
 */
export async function buildPolicy(options: BuildPolicyOptions): Promise<BuildPolicyResult> {
  const cwd = process.cwd()
  const entry = resolve(cwd, options.entry)
  const entryLabel = relative(cwd, entry) || options.entry
  if (!existsSync(entry)) return failure([diagnostic(entryLabel, 'error', 'SH600', `Policy source not found: ${entryLabel}`)])
  if (options.version !== undefined && !CALVER.test(options.version)) {
    return failure([diagnostic(entryLabel, 'error', 'SH606', `--version "${options.version}" must be a calver like 2026.09.19.1 (YYYY.MM.DD.N)`)])
  }

  let bundle: string
  const diagnostics: Diagnostic[] = []
  try {
    const output = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: BUNDLE_GLOBAL,
      platform: 'neutral',
      target: 'es2022',
      minify: true,
      legalComments: 'none',
      charset: 'utf8',
      metafile: true,
      logLevel: 'silent',
      outfile: 'policy.js',
      mainFields: ['module', 'main'],
      absWorkingDir: cwd,
    })
    bundle = output.outputFiles[0]?.text ?? ''
    diagnostics.push(...scanSource(Object.keys(output.metafile.inputs), cwd))
  } catch (error) {
    if (!isBuildFailure(error)) throw error
    return failure(error.errors.map((message) => fromBuildMessage(message, entryLabel)))
  }
  if (diagnostics.some((found) => found.severity === 'error')) return failure(diagnostics)

  const sha256 = createHash('sha256').update(bundle).digest('hex')
  const identity = runLoader(bundle, { mode: 'id' })
  if ('error' in identity) return failure([...diagnostics, diagnostic(entryLabel, 'error', 'SH603', `The policy could not be loaded: ${identity.error}`)])
  if (!identity.ok || identity.id === undefined) {
    return failure([...diagnostics, diagnostic(entryLabel, 'error', identity.code ?? 'SH603', identity.message ?? 'The policy could not be loaded')])
  }
  const id = identity.id
  if (!POLICY_ID.test(id)) {
    return failure([...diagnostics, diagnostic(entryLabel, 'error', 'SH605', `Policy id "${id}" cannot be used in file names (letters, digits, hyphens and underscores only)`)])
  }

  const policiesDir = join(options.packDir, 'policies')
  const existing = existingVersions(policiesDir, id)
  const latest = existing.at(-1)
  if (options.version === undefined && !options.force && latest !== undefined && recordedHash(policiesDir, id, latest) === sha256) {
    const name = `${id}-policy-${latest}`
    return { status: 'unchanged', name, files: [], active: isActive(options.packDir, name), diagnostics: sortDiagnostics(diagnostics) }
  }
  const version = options.version ?? nextVersion(existing, (options.now ?? (() => new Date()))())
  if (existing.includes(version) && !options.force) {
    return failure([...diagnostics, diagnostic(entryLabel, 'error', 'SH607', `${id}-policy-${version} already exists in ${relative(cwd, policiesDir) || 'policies'} (use --force to replace it)`)])
  }

  const built = runLoader(bundle, { mode: 'contract', options: { version, sha256 } })
  if ('error' in built) return failure([...diagnostics, diagnostic(entryLabel, 'error', 'SH603', `The policy could not be loaded: ${built.error}`)])
  if (!built.ok) return failure([...diagnostics, diagnostic(entryLabel, 'error', built.code ?? 'SH603', built.message ?? 'The policy could not be loaded')])
  const parsed = parseContract(built.contract)
  if ('error' in parsed) return failure([...diagnostics, diagnostic(entryLabel, 'error', 'SH608', `The policy produced an invalid contract: ${parsed.error}`)])

  const name = `${id}-policy-${version}`
  mkdirSync(policiesDir, { recursive: true })
  writeFileSync(join(policiesDir, `${name}.js`), bundle)
  writeFileSync(join(policiesDir, `${name}.contract.json`), `${JSON.stringify(withHash(built.contract, sha256), null, 2)}\n`)
  return {
    status: 'built',
    name,
    files: [`policies/${name}.js`, `policies/${name}.contract.json`],
    active: isActive(options.packDir, name),
    diagnostics: sortDiagnostics(diagnostics),
  }
}

/** The contract exactly as the policy produced it, plus the bundle hash if the policy left it out. */
function withHash(contract: unknown, sha256: string): unknown {
  if (!isRecord(contract) || !isRecord(contract.policy) || contract.policy.sha256 !== undefined) return contract
  return { ...contract, policy: { ...contract.policy, sha256 } }
}
