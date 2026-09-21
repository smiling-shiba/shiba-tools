import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import type { KeyObject } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalize, sha256Hex } from './canonical.ts'
import { isRecord } from './contract.ts'
import { sortDiagnostics } from './diagnostics.ts'
import type { Diagnostic } from './diagnostics.ts'
import { checkLock, diagnostic, hasErrors, LOCK_FILE, readLock, SIGNATURE_FILE } from './lock.ts'
import type { Lock } from './lock.ts'

/** What pack.sig.json holds. The public key travels with the signature; trusting it is a separate decision. */
export interface SignatureFile {
  algorithm: 'ed25519'
  /** First 16 hex characters of the SHA-256 of the public key. */
  keyId: string
  /** The public key, SPKI DER, base64. */
  publicKey: string
  /** Signature over the canonical JSON of the lock, base64. */
  signature: string
  signs: string
}

function spkiOf(key: KeyObject): Buffer {
  return key.export({ type: 'spki', format: 'der' })
}

export function keyIdOf(spki: Uint8Array): string {
  return sha256Hex(spki).slice(0, 16)
}

/** The bytes that get signed: the lock in canonical JSON form. */
function signedBytes(lock: Lock): Buffer {
  return Buffer.from(canonicalize(lock), 'utf8')
}

export interface KeyFiles {
  privateKey: string
  publicKey: string
  keyId: string
}

/** Creates `<name>.key` (private, owner-only) and `<name>.pub` in `outDir`. Refuses to overwrite unless `force`. */
export function writeKeyPair(name: string, outDir: string, force: boolean): { files?: KeyFiles; diagnostics: Diagnostic[] } {
  const privatePath = join(outDir, `${name}.key`)
  const publicPath = join(outDir, `${name}.pub`)
  if (!force) {
    for (const path of [privatePath, publicPath]) {
      if (existsSync(path)) return { diagnostics: [diagnostic(path, 'error', 'SH730', `${path} already exists (use --force to replace it)`)] }
    }
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 })
  return { files: { privateKey: privatePath, publicKey: publicPath, keyId: keyIdOf(spkiOf(publicKey)) }, diagnostics: [] }
}

function readPrivateKey(path: string): { key?: KeyObject; diagnostics: Diagnostic[] } {
  try {
    const key = createPrivateKey(readFileSync(path))
    if (key.asymmetricKeyType !== 'ed25519') return { diagnostics: [diagnostic(path, 'error', 'SH730', 'The key must be an ed25519 private key')] }
    return { key, diagnostics: [] }
  } catch (error) {
    return { diagnostics: [diagnostic(path, 'error', 'SH730', `Cannot read the private key: ${error instanceof Error ? error.message : String(error)}`)] }
  }
}

/** Signs the pack's lock. Refuses when the lock is out of date, so a stale list is never signed. */
export function signPack(packDir: string, keyPath: string): { keyId?: string; diagnostics: Diagnostic[] } {
  const read = readLock(packDir)
  if (!read.lock) return { diagnostics: read.diagnostics }
  const drift = checkLock(packDir, read.lock)
  if (hasErrors(drift)) {
    return { diagnostics: [diagnostic(LOCK_FILE, 'error', 'SH716', `${LOCK_FILE} is out of date; run sht pack again before signing`), ...drift] }
  }
  const loaded = readPrivateKey(keyPath)
  if (!loaded.key) return { diagnostics: loaded.diagnostics }
  const spki = spkiOf(createPublicKey(loaded.key))
  const file: SignatureFile = {
    algorithm: 'ed25519',
    keyId: keyIdOf(spki),
    publicKey: spki.toString('base64'),
    signature: sign(null, signedBytes(read.lock), loaded.key).toString('base64'),
    signs: `${LOCK_FILE}, canonical JSON (RFC 8785)`,
  }
  writeFileSync(join(packDir, SIGNATURE_FILE), `${JSON.stringify(file, null, 2)}\n`)
  return { keyId: file.keyId, diagnostics: drift }
}

function readSignature(packDir: string): { file?: SignatureFile; missing?: boolean; diagnostics: Diagnostic[] } {
  const path = join(packDir, SIGNATURE_FILE)
  if (!existsSync(path)) return { missing: true, diagnostics: [] }
  const invalid = (why: string) => ({ diagnostics: [diagnostic(SIGNATURE_FILE, 'error', 'SH723', `${SIGNATURE_FILE} is invalid: ${why}`)] })
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return invalid(`not valid JSON (${error instanceof Error ? error.message : String(error)})`)
  }
  if (!isRecord(parsed) || parsed.algorithm !== 'ed25519') return invalid('algorithm must be ed25519')
  if (typeof parsed.keyId !== 'string' || typeof parsed.publicKey !== 'string' || typeof parsed.signature !== 'string') return invalid('keyId, publicKey and signature are required')
  return { file: { algorithm: 'ed25519', keyId: parsed.keyId, publicKey: parsed.publicKey, signature: parsed.signature, signs: typeof parsed.signs === 'string' ? parsed.signs : '' }, diagnostics: [] }
}

function signatureMatches(lock: Lock, file: SignatureFile): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(file.publicKey, 'base64'), format: 'der', type: 'spki' })
    return verify(null, signedBytes(lock), key, Buffer.from(file.signature, 'base64'))
  } catch {
    return false
  }
}

/** Public keys (SPKI DER, base64) found at `path`: one PEM file, or every `*.pub` file in a folder. */
function loadTrustedKeys(path: string): { keys: Set<string>; diagnostics: Diagnostic[] } {
  const keys = new Set<string>()
  const diagnostics: Diagnostic[] = []
  let files: string[]
  try {
    files = statSync(path).isDirectory() ? readdirSync(path).filter((name) => name.endsWith('.pub')).sort().map((name) => join(path, name)) : [path]
  } catch {
    return { keys, diagnostics: [diagnostic(path, 'error', 'SH730', `Trusted keys not found: ${path}`)] }
  }
  for (const file of files) {
    try {
      keys.add(spkiOf(createPublicKey(readFileSync(file))).toString('base64'))
    } catch (error) {
      diagnostics.push(diagnostic(file, 'error', 'SH730', `Cannot read the public key: ${error instanceof Error ? error.message : String(error)}`))
    }
  }
  return { keys, diagnostics }
}

export interface VerifyOptions {
  /** A public key file, or a folder of `*.pub` files, whose signers are trusted. */
  trust?: string
  /** Treat an unsigned pack, or a signer that is not established, as an error. */
  requireSignature?: boolean
}

export interface VerifyResult {
  status: 'ok' | 'failed'
  filesChecked: number
  signed: boolean
  signer?: { keyId: string; trusted: boolean }
  diagnostics: Diagnostic[]
}

/** Checks that the files still match the lock, and that the lock is validly signed by a trusted key. */
export function verifyPack(packDir: string, options: VerifyOptions = {}): VerifyResult {
  const failed = (diagnostics: Diagnostic[], filesChecked = 0): VerifyResult => ({ status: 'failed', filesChecked, signed: false, diagnostics: sortDiagnostics(diagnostics) })
  const read = readLock(packDir)
  if (!read.lock) return failed(read.diagnostics)
  const diagnostics = checkLock(packDir, read.lock)
  const filesChecked = read.lock.files.length

  const level = options.requireSignature ? 'error' : 'warning'
  const signature = readSignature(packDir)
  if (signature.missing) {
    diagnostics.push(diagnostic(SIGNATURE_FILE, level, 'SH720', 'This pack is not signed'))
    return { status: hasErrors(diagnostics) ? 'failed' : 'ok', filesChecked, signed: false, diagnostics: sortDiagnostics(diagnostics) }
  }
  if (!signature.file) return failed([...diagnostics, ...signature.diagnostics], filesChecked)

  if (!signatureMatches(read.lock, signature.file)) {
    diagnostics.push(diagnostic(SIGNATURE_FILE, 'error', 'SH721', `The signature does not match ${LOCK_FILE}; the lock changed after it was signed, or the signature is not genuine`))
    return { status: 'failed', filesChecked, signed: true, diagnostics: sortDiagnostics(diagnostics) }
  }

  const keyId = signature.file.keyId
  let trusted = false
  if (options.trust === undefined) {
    diagnostics.push(diagnostic(SIGNATURE_FILE, level, 'SH722', `The signature is valid (key ${keyId}), but no trusted keys were given (--trust), so the signer is not established`))
  } else {
    const loaded = loadTrustedKeys(options.trust)
    diagnostics.push(...loaded.diagnostics)
    trusted = loaded.keys.has(signature.file.publicKey)
    if (!trusted && !hasErrors(loaded.diagnostics)) diagnostics.push(diagnostic(SIGNATURE_FILE, 'error', 'SH722', `The signature is valid, but key ${keyId} is not one of the trusted keys`))
  }
  return { status: hasErrors(diagnostics) ? 'failed' : 'ok', filesChecked, signed: true, signer: { keyId, trusted }, diagnostics: sortDiagnostics(diagnostics) }
}
