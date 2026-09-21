import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalize } from './canonical.ts'
import { sortDiagnostics } from './diagnostics.ts'
import type { Diagnostic } from './diagnostics.ts'
import { computeLock, diagnostic, hasErrors, LOCK_FILE, readLock, SIGNATURE_FILE } from './lock.ts'
import { validatePack } from './validate.ts'

export interface PackResult {
  status: 'packed' | 'unchanged' | 'failed'
  filesLocked: number
  id?: string
  version?: string
  /** True when an existing signature no longer matched the new lock and was deleted. */
  removedSignature: boolean
  diagnostics: Diagnostic[]
}

/**
 * Checks that the pack is valid, then writes `pack.lock.json`: every file in the pack with its
 * hash. Templates are hashed in canonical form, so comments and formatting do not matter.
 */
export function packPack(packDir: string): PackResult {
  const failed = (diagnostics: Diagnostic[]): PackResult => ({ status: 'failed', filesLocked: 0, removedSignature: false, diagnostics: sortDiagnostics(diagnostics) })
  const validation = validatePack(packDir)
  if (hasErrors(validation)) {
    return failed([diagnostic('pack.yml', 'error', 'SH700', 'The pack has validation errors; fix them (see sht validate) before packing'), ...validation])
  }
  const computed = computeLock(packDir)
  if (!computed.lock) return failed([...validation, ...computed.diagnostics])
  const { lock } = computed
  const diagnostics = sortDiagnostics([...validation, ...computed.diagnostics])

  const existing = existsSync(join(packDir, LOCK_FILE)) ? readLock(packDir).lock : undefined
  if (existing !== undefined && canonicalize(existing) === canonicalize(lock)) {
    return { status: 'unchanged', filesLocked: lock.files.length, id: lock.pack.id, version: lock.pack.version, removedSignature: false, diagnostics }
  }
  writeFileSync(join(packDir, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`)
  const signaturePath = join(packDir, SIGNATURE_FILE)
  const hadSignature = existsSync(signaturePath)
  if (hadSignature) rmSync(signaturePath)
  return { status: 'packed', filesLocked: lock.files.length, id: lock.pack.id, version: lock.pack.version, removedSignature: hadSignature, diagnostics }
}
