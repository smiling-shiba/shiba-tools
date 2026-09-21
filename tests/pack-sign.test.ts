import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalize, sha256Hex } from '../src/canonical.ts'
import { LOCK_FILE, SIGNATURE_FILE } from '../src/lock.ts'
import { packPack } from '../src/pack-lock.ts'
import { signPack, verifyPack, writeKeyPair } from '../src/signing.ts'
import { emptyTempDir, removeTempCopies, tempPackCopy } from './helpers.ts'

const toyPack = fileURLToPath(new URL('./fixtures/toy-pack', import.meta.url))
const brokenPack = fileURLToPath(new URL('./fixtures/broken-pack', import.meta.url))
const LAMP = 'templates/entities/lamp.yml'
const BUNDLE = 'policies/toy-policy-2026.09.19.1.js'

afterEach(removeTempCopies)

interface LockShape {
  files: { path: string; kind: string; sha256: string }[]
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
const readLock = (pack: string): LockShape => {
  const lock = readJson(join(pack, LOCK_FILE))
  return lock as LockShape
}
const codes = (result: { diagnostics: readonly { code: string }[] }): string[] => result.diagnostics.map((item) => item.code)
const errorsOf = (result: { diagnostics: readonly { code: string; file: string; severity: string }[] }): string[] =>
  result.diagnostics.filter((item) => item.severity === 'error').map((item) => `${item.code} ${item.file}`)
const replaceIn = (pack: string, file: string, from: string, to: string): void => {
  writeFileSync(join(pack, file), readFileSync(join(pack, file), 'utf8').replace(from, to))
}

function packed(): string {
  const pack = tempPackCopy(toyPack)
  expect(packPack(pack).status).toBe('packed')
  return pack
}

function signed(): { pack: string; keys: string; keyFile: string; trust: string } {
  const pack = packed()
  const keys = emptyTempDir()
  expect(writeKeyPair('dev', keys, false).files).toBeDefined()
  const keyFile = join(keys, 'dev.key')
  expect(signPack(pack, keyFile).diagnostics).toEqual([])
  return { pack, keys, keyFile, trust: join(keys, 'dev.pub') }
}

describe('sht pack', () => {
  it('lists every file of the pack, sorted, with hashes', () => {
    const pack = tempPackCopy(toyPack)
    expect(packPack(pack)).toMatchObject({ status: 'packed', filesLocked: 6, id: 'toy-pack', version: '2026.09.19.1', removedSignature: false })
    expect(readJson(join(pack, LOCK_FILE))).toMatchObject({ lockVersion: 1, pack: { id: 'toy-pack', version: '2026.09.19.1' }, policy: 'toy-policy-2026.09.19.1' })
    expect(readLock(pack).files.map((file) => `${file.kind}:${file.path}`)).toEqual([
      'pack:pack.yml',
      'contract:policies/toy-policy-2026.09.19.1.contract.json',
      'policy:policies/toy-policy-2026.09.19.1.js',
      'template:templates/collections/starter-set.yml',
      'template:templates/entities/crate.yml',
      'template:templates/entities/lamp.yml',
    ])
  })

  it('hashes templates in canonical form and the policy bundle as raw bytes', () => {
    const pack = packed()
    const hashOf = (path: string): string | undefined => readLock(pack).files.find((file) => file.path === path)?.sha256
    expect(hashOf(LAMP)).toBe(sha256Hex(canonicalize(parse(readFileSync(join(pack, LAMP), 'utf8')))))
    expect(hashOf(BUNDLE)).toBe(sha256Hex(readFileSync(join(pack, BUNDLE))))
  })

  it('gives identical lock files for identical packs, and reports "unchanged" the second time', () => {
    const [first, second] = [tempPackCopy(toyPack), tempPackCopy(toyPack)]
    packPack(first)
    packPack(second)
    expect(readFileSync(join(first, LOCK_FILE), 'utf8')).toBe(readFileSync(join(second, LOCK_FILE), 'utf8'))
    expect(packPack(first).status).toBe('unchanged')
  })

  it('ignores comments and formatting in templates, but notices real changes', () => {
    const pack = packed()
    writeFileSync(join(pack, LAMP), `# a new comment\n${readFileSync(join(pack, LAMP), 'utf8')}\n\n`)
    expect(packPack(pack).status).toBe('unchanged')
    replaceIn(pack, LAMP, 'name: Lamp', 'name: Lamp Deluxe')
    expect(packPack(pack).status).toBe('packed')
  })

  it('includes assets by their bytes, and leaves out dot files', () => {
    const pack = tempPackCopy(toyPack)
    mkdirSync(join(pack, 'assets/art'), { recursive: true })
    writeFileSync(join(pack, 'assets/art/logo.png'), Buffer.from([1, 2, 3]))
    packPack(pack)
    expect(readLock(pack).files.filter((file) => file.kind === 'asset')).toEqual([
      { path: 'assets/art/logo.png', kind: 'asset', sha256: sha256Hex(Buffer.from([1, 2, 3])) },
    ])
  })

  it('refuses a pack that does not validate, and says why', () => {
    const pack = tempPackCopy(brokenPack)
    const result = packPack(pack)
    expect(result.status).toBe('failed')
    expect(codes(result)).toContain('SH700')
    expect(codes(result)).toContain('SH101')
    expect(existsSync(join(pack, LOCK_FILE))).toBe(false)
  })

  it('refuses when the policy bundle is missing', () => {
    const pack = tempPackCopy(toyPack)
    rmSync(join(pack, BUNDLE))
    expect(codes(packPack(pack))).toContain('SH715')
  })

  it('refuses an assets folder outside the pack', () => {
    const pack = tempPackCopy(toyPack)
    replaceIn(pack, 'pack.yml', 'assets: assets/', 'assets: ../elsewhere')
    expect(codes(packPack(pack))).toContain('SH701')
  })

  it('deletes a signature that no longer matches the new lock', () => {
    const { pack } = signed()
    replaceIn(pack, LAMP, 'name: Lamp', 'name: Lamp Two')
    expect(packPack(pack)).toMatchObject({ status: 'packed', removedSignature: true })
    expect(existsSync(join(pack, SIGNATURE_FILE))).toBe(false)
  })
})

describe('sht verify', () => {
  it('passes an unsigned pack with a warning, and fails it when a signature is required', () => {
    const pack = packed()
    expect(verifyPack(pack)).toMatchObject({ status: 'ok', filesChecked: 6, signed: false })
    expect(verifyPack(pack).diagnostics).toMatchObject([{ code: 'SH720', severity: 'warning' }])
    expect(verifyPack(pack, { requireSignature: true })).toMatchObject({ status: 'failed', diagnostics: [{ code: 'SH720', severity: 'error' }] })
  })

  it('needs a lock file, and rejects a broken one', () => {
    const pack = tempPackCopy(toyPack)
    expect(codes(verifyPack(pack))).toEqual(['SH710'])
    writeFileSync(join(pack, LOCK_FILE), '{ nope')
    expect(codes(verifyPack(pack))).toEqual(['SH711'])
    writeFileSync(join(pack, LOCK_FILE), '{"lockVersion": 2}')
    expect(codes(verifyPack(pack))).toEqual(['SH711'])
  })

  it('catches a changed, a missing and an extra file', () => {
    const pack = packed()
    replaceIn(pack, LAMP, 'name: Lamp', 'name: Other')
    rmSync(join(pack, 'templates/entities/crate.yml'))
    writeFileSync(join(pack, 'templates/entities/extra.yml'), 'kind: entity\nid: extra\nname: Extra\n')
    const result = verifyPack(pack)
    expect(result.status).toBe('failed')
    expect(errorsOf(result)).toEqual([
      'SH713 templates/entities/crate.yml',
      'SH714 templates/entities/extra.yml',
      `SH712 ${LAMP}`,
    ])
  })

  it('catches a changed policy bundle and a changed asset', () => {
    const pack = tempPackCopy(toyPack)
    writeFileSync(join(pack, 'assets/logo.png'), Buffer.from([1]))
    packPack(pack)
    writeFileSync(join(pack, BUNDLE), '// swapped')
    writeFileSync(join(pack, 'assets/logo.png'), Buffer.from([2]))
    expect(errorsOf(verifyPack(pack))).toEqual([`SH712 assets/logo.png`, `SH712 ${BUNDLE}`])
  })

  it('does not lock other policy versions kept in policies/', () => {
    const pack = packed()
    writeFileSync(join(pack, 'policies/toy-policy-2026.01.01.1.js'), '// an old version')
    expect(verifyPack(pack).status).toBe('ok')
  })
})

describe('keys, signing and trust', () => {
  it('signs, and a trusted signer verifies', () => {
    const { pack, trust } = signed()
    expect(verifyPack(pack, { trust, requireSignature: true })).toMatchObject({ status: 'ok', signed: true, signer: { trusted: true }, diagnostics: [] })
  })

  it('accepts a folder of trusted keys, and rejects a signer that is not in it', () => {
    const { pack, keys } = signed()
    writeKeyPair('other', keys, false)
    expect(verifyPack(pack, { trust: keys })).toMatchObject({ status: 'ok', signer: { trusted: true } })
    const strangers = emptyTempDir()
    writeKeyPair('stranger', strangers, false)
    const result = verifyPack(pack, { trust: strangers })
    expect(result.status).toBe('failed')
    expect(codes(result)).toEqual(['SH722'])
  })

  it('checks the signature but does not establish the signer when no trusted keys are given', () => {
    const { pack } = signed()
    expect(verifyPack(pack)).toMatchObject({ status: 'ok', signer: { trusted: false } })
    expect(verifyPack(pack).diagnostics).toMatchObject([{ code: 'SH722', severity: 'warning' }])
    expect(verifyPack(pack, { requireSignature: true })).toMatchObject({ status: 'failed', diagnostics: [{ code: 'SH722', severity: 'error' }] })
  })

  it('rejects a signature after the lock has been changed', () => {
    const { pack, trust } = signed()
    const lock = readLock(pack)
    const first = lock.files[0]
    if (first === undefined) throw new Error('the lock has no files')
    first.sha256 = '0'.repeat(64)
    writeFileSync(join(pack, LOCK_FILE), JSON.stringify(lock, null, 2))
    expect(codes(verifyPack(pack, { trust }))).toContain('SH721')
  })

  it('does not care about whitespace in the lock file, only its content', () => {
    const { pack, trust } = signed()
    writeFileSync(join(pack, LOCK_FILE), JSON.stringify(readJson(join(pack, LOCK_FILE))))
    expect(verifyPack(pack, { trust })).toMatchObject({ status: 'ok', diagnostics: [] })
  })

  it('rejects a tampered signature and a garbage signature file', () => {
    const { pack, trust } = signed()
    const file = readJson(join(pack, SIGNATURE_FILE)) as { signature: string }
    file.signature = `${file.signature.startsWith('A') ? 'B' : 'A'}${file.signature.slice(1)}`
    writeFileSync(join(pack, SIGNATURE_FILE), JSON.stringify(file))
    expect(codes(verifyPack(pack, { trust }))).toEqual(['SH721'])
    writeFileSync(join(pack, SIGNATURE_FILE), 'not json')
    expect(codes(verifyPack(pack, { trust }))).toEqual(['SH723'])
    writeFileSync(join(pack, SIGNATURE_FILE), '{"algorithm":"rsa"}')
    expect(codes(verifyPack(pack, { trust }))).toEqual(['SH723'])
  })

  it('reports missing trusted keys instead of quietly trusting nothing', () => {
    const { pack } = signed()
    expect(codes(verifyPack(pack, { trust: join(emptyTempDir(), 'nope.pub') }))).toContain('SH730')
  })

  it('refuses to sign a pack whose lock is out of date', () => {
    const { pack, keyFile } = signed()
    replaceIn(pack, LAMP, 'name: Lamp', 'name: Changed')
    rmSync(join(pack, SIGNATURE_FILE))
    expect(codes(signPack(pack, keyFile))).toContain('SH716')
    expect(existsSync(join(pack, SIGNATURE_FILE))).toBe(false)
  })

  it('needs a lock, and a usable ed25519 private key', () => {
    const pack = tempPackCopy(toyPack)
    expect(codes(signPack(pack, '/nowhere.key'))).toEqual(['SH710'])
    packPack(pack)
    expect(codes(signPack(pack, join(emptyTempDir(), 'missing.key')))).toEqual(['SH730'])
    const rsa = join(emptyTempDir(), 'rsa.key')
    writeFileSync(rsa, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }))
    const result = signPack(pack, rsa)
    expect(codes(result)).toEqual(['SH730'])
    expect(result.diagnostics[0]?.message).toContain('ed25519')
  })

  it('creates a private key only its owner can read, plus a public key, and never overwrites without --force', () => {
    const dir = emptyTempDir()
    const made = writeKeyPair('dev', dir, false)
    expect(made.files?.keyId).toMatch(/^[0-9a-f]{16}$/)
    expect(statSync(join(dir, 'dev.key')).mode & 0o777).toBe(0o600)
    expect(readFileSync(join(dir, 'dev.pub'), 'utf8')).toContain('BEGIN PUBLIC KEY')
    expect(readFileSync(join(dir, 'dev.key'), 'utf8')).toContain('BEGIN PRIVATE KEY')
    const again = writeKeyPair('dev', dir, false)
    expect(again.files).toBeUndefined()
    expect(codes(again)).toEqual(['SH730'])
    expect(writeKeyPair('dev', dir, true).files?.keyId).not.toBe(made.files?.keyId)
  })
})
