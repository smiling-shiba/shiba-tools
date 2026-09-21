import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { canonicalize, CanonicalizeError, sha256Hex } from './canonical.ts'
import { isRecord } from './contract.ts'
import { sortDiagnostics } from './diagnostics.ts'
import type { Diagnostic, Severity } from './diagnostics.ts'
import { expandGlob } from './glob.ts'
import { readPackConfig } from './pack.ts'
import { Report } from './report.ts'
import { parseYamlSource } from './yaml-source.ts'

/*
 * Diagnostic codes for locking, signing and verifying (placeholder SH prefix, like the others).
 *   SH700 pack has validation errors      SH701 a file cannot be hashed
 *   SH710 lock file missing               SH711 lock file unreadable or invalid
 *   SH712 file changed since the lock     SH713 file in the lock is missing
 *   SH714 file not in the lock            SH715 policy bundle missing
 *   SH716 lock out of date (before signing)
 *   SH720 pack not signed                 SH721 signature does not match the lock
 *   SH722 signer not trusted / not established   SH723 signature file unreadable or invalid
 *   SH730 key file problem
 */

export const LOCK_FILE = 'pack.lock.json'
export const SIGNATURE_FILE = 'pack.sig.json'

export type LockedKind = 'pack' | 'policy' | 'contract' | 'template' | 'asset'

export interface LockedFile {
  path: string
  kind: LockedKind
  /** Hash of the file's raw bytes, or, for YAML and JSON files, of its canonical JSON form. */
  sha256: string
}

export interface Lock {
  lockVersion: 1
  pack: { id: string; version: string }
  policy: string
  files: LockedFile[]
}

const KINDS: readonly LockedKind[] = ['pack', 'policy', 'contract', 'template', 'asset']

function isLockedKind(value: string): value is LockedKind {
  return KINDS.some((kind) => kind === value)
}

export function diagnostic(file: string, severity: Severity, code: string, message: string): Diagnostic {
  return { severity, file, line: 0, column: 0, code, message }
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error')
}

function hashCanonicalYaml(packDir: string, path: string, diagnostics: Diagnostic[]): string | undefined {
  const source = parseYamlSource(readFileSync(join(packDir, path), 'utf8'))
  if (source.syntaxProblems.length > 0) {
    diagnostics.push(diagnostic(path, 'error', 'SH701', `Cannot hash a file with YAML syntax errors: ${source.syntaxProblems[0]?.message ?? 'invalid YAML'}`))
    return undefined
  }
  try {
    return sha256Hex(canonicalize(source.value))
  } catch (error) {
    diagnostics.push(diagnostic(path, 'error', 'SH701', error instanceof CanonicalizeError ? error.message : String(error)))
    return undefined
  }
}

function hashCanonicalJson(packDir: string, path: string, diagnostics: Diagnostic[]): string | undefined {
  try {
    return sha256Hex(canonicalize(JSON.parse(readFileSync(join(packDir, path), 'utf8'))))
  } catch (error) {
    diagnostics.push(diagnostic(path, 'error', 'SH701', `Cannot hash a file that is not valid JSON: ${error instanceof Error ? error.message : String(error)}`))
    return undefined
  }
}

/** Lists every file that makes up a pack and hashes it. Does not check that the pack is valid. */
export function computeLock(packDir: string): { lock?: Lock; diagnostics: Diagnostic[] } {
  const report = new Report()
  const loaded = readPackConfig(packDir, report)
  if (!loaded) return { diagnostics: sortDiagnostics(report.items) }
  const { config } = loaded
  const diagnostics: Diagnostic[] = []
  const files: LockedFile[] = []
  const add = (path: string, kind: LockedKind, sha256: string | undefined): void => {
    if (sha256 !== undefined) files.push({ path, kind, sha256 })
  }

  add('pack.yml', 'pack', hashCanonicalYaml(packDir, 'pack.yml', diagnostics))

  const bundle = `policies/${config.policy}.js`
  const contract = `policies/${config.policy}.contract.json`
  if (!existsSync(join(packDir, bundle))) {
    diagnostics.push(diagnostic(bundle, 'error', 'SH715', `Policy bundle not found: ${bundle} (build it with sht build-policy)`))
  } else {
    add(bundle, 'policy', sha256Hex(readFileSync(join(packDir, bundle))))
  }
  if (existsSync(join(packDir, contract))) add(contract, 'contract', hashCanonicalJson(packDir, contract, diagnostics))

  for (const path of expandGlob(packDir, config.templates)) add(path, 'template', hashCanonicalYaml(packDir, path, diagnostics))

  const assetsDir = config.assets.replace(/\/+$/, '')
  const insidePack = resolve(packDir, assetsDir).startsWith(`${resolve(packDir)}${sep}`)
  if (!insidePack) {
    diagnostics.push(diagnostic('pack.yml', 'error', 'SH701', `The assets folder "${config.assets}" must be inside the pack`))
  } else {
    for (const path of expandGlob(packDir, `${assetsDir}/**`)) {
      if (path.split('/').some((part) => part.startsWith('.'))) continue
      add(path, 'asset', sha256Hex(readFileSync(join(packDir, path))))
    }
  }

  if (hasErrors(diagnostics)) return { diagnostics: sortDiagnostics(diagnostics) }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return {
    lock: { lockVersion: 1, pack: { id: config.id, version: config.version }, policy: config.policy, files },
    diagnostics: sortDiagnostics(diagnostics),
  }
}

/** Reads and checks the shape of pack.lock.json. */
export function readLock(packDir: string): { lock?: Lock; diagnostics: Diagnostic[] } {
  const path = join(packDir, LOCK_FILE)
  if (!existsSync(path)) return { diagnostics: [diagnostic(LOCK_FILE, 'error', 'SH710', `${LOCK_FILE} not found; run sht pack first`)] }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { diagnostics: [diagnostic(LOCK_FILE, 'error', 'SH711', `${LOCK_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)] }
  }
  const invalid = (why: string) => ({ diagnostics: [diagnostic(LOCK_FILE, 'error', 'SH711', `${LOCK_FILE} is invalid: ${why}`)] })
  if (!isRecord(parsed) || parsed.lockVersion !== 1) return invalid('lockVersion must be 1')
  if (!isRecord(parsed.pack) || typeof parsed.pack.id !== 'string' || typeof parsed.pack.version !== 'string') return invalid('pack must have an id and a version')
  if (typeof parsed.policy !== 'string') return invalid('policy must be a name')
  if (!Array.isArray(parsed.files)) return invalid('files must be a list')
  const files: LockedFile[] = []
  const entries: unknown[] = parsed.files
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.kind !== 'string' || !isLockedKind(entry.kind)) {
      return invalid('every file needs a path, a kind and a sha256')
    }
    files.push({ path: entry.path, kind: entry.kind, sha256: entry.sha256 })
  }
  return { lock: { lockVersion: 1, pack: { id: parsed.pack.id, version: parsed.pack.version }, policy: parsed.policy, files }, diagnostics: [] }
}

/** Compares the files on disk with a lock and reports what changed, went missing, or was added. */
export function checkLock(packDir: string, lock: Lock): Diagnostic[] {
  const current = computeLock(packDir)
  if (!current.lock) return current.diagnostics
  const diagnostics = [...current.diagnostics]
  const now = new Map(current.lock.files.map((file) => [file.path, file.sha256]))
  const then = new Map(lock.files.map((file) => [file.path, file.sha256]))
  for (const [path, hash] of then) {
    const actual = now.get(path)
    if (actual === undefined) diagnostics.push(diagnostic(path, 'error', 'SH713', `${path} is listed in ${LOCK_FILE} but is missing`))
    else if (actual !== hash) diagnostics.push(diagnostic(path, 'error', 'SH712', `${path} has changed since ${LOCK_FILE} was made`))
  }
  for (const path of now.keys()) {
    if (!then.has(path)) diagnostics.push(diagnostic(path, 'error', 'SH714', `${path} is not in ${LOCK_FILE}`))
  }
  if (current.lock.policy !== lock.policy) diagnostics.push(diagnostic('pack.yml', 'error', 'SH712', `The active policy is "${current.lock.policy}" but ${LOCK_FILE} says "${lock.policy}"`))
  return sortDiagnostics(diagnostics)
}
