import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const created: string[] = []

// Generated editor files may exist in a fixture after someone runs `sht schemas` on it. Tests must not depend on them.
const GENERATED = /[\\/]\.(shiba|vscode)(?:[\\/]|$)/

/** Copies a pack into a fresh temporary folder, without generated editor files. Call `removeTempCopies` afterwards. */
export function tempPackCopy(source: string): string {
  const copy = mkdtempSync(join(tmpdir(), 'sht-test-'))
  created.push(copy)
  cpSync(source, copy, { recursive: true, filter: (path) => !GENERATED.test(path) })
  return copy
}

/** An empty temporary folder. */
export function emptyTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sht-test-'))
  created.push(dir)
  return dir
}

export function removeTempCopies(): void {
  for (const path of created.splice(0)) rmSync(path, { recursive: true, force: true })
}
