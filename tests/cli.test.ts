import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { main } from '../src/cli.ts'
import { emptyTempDir, removeTempCopies, tempPackCopy } from './helpers.ts'

const toyPack = fileURLToPath(new URL('./fixtures/toy-pack', import.meta.url))
const brokenPack = fileURLToPath(new URL('./fixtures/broken-pack', import.meta.url))
const policySource = fileURLToPath(new URL('./fixtures/policy-src', import.meta.url))

async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = []
  const err: string[] = []
  const code = await main(argv, { out: (text) => out.push(text), err: (text) => err.push(text) })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('sht validate', () => {
  afterEach(removeTempCopies)

  it('exits 0 and says so for a valid pack', async () => {
    const result = await run('validate', toyPack)
    expect(result.code).toBe(0)
    expect(result.out).toBe('OK: no problems found')
  })

  it('exits 1 and prints file:line:column diagnostics for a broken pack', async () => {
    const result = await run('validate', brokenPack)
    expect(result.code).toBe(1)
    expect(result.out).toContain('templates/entities/typo-function.yml:6:9  error  SH101  Unknown function "set_valeu"')
    expect(result.out).toContain('Did you mean "set_value"?')
    expect(result.out).toMatch(/\d+ error\(s\), \d+ warning\(s\)$/)
  })

  it('prints machine-readable output with --json', async () => {
    const result = await run('validate', brokenPack, '--json')
    const parsed: unknown = JSON.parse(result.out)
    expect(parsed).toMatchObject({ errors: expect.any(Number), warnings: 0, diagnostics: expect.any(Array) })
    expect(result.code).toBe(1)
  })

  it('exits 0 when there are only warnings', async () => {
    const copy = tempPackCopy(toyPack)
    rmSync(join(copy, 'policies/toy-policy-2026.09.19.1.js'))
    const result = await run('validate', copy)
    expect(result.code).toBe(0)
    expect(result.out).toContain('SH014')
    expect(result.out).toContain('0 error(s), 1 warning(s)')
  })

  it('shows usage and exits 2 without a command', async () => {
    const result = await run()
    expect(result.code).toBe(2)
    expect(result.err).toContain('Usage: sht validate')
  })

  it('exits 2 for an unknown command or option', async () => {
    expect((await run('frobnicate')).code).toBe(2)
    expect((await run('validate', '--nope')).code).toBe(2)
  })

  it('shows help and exits 0', async () => {
    const result = await run('--help')
    expect(result.code).toBe(0)
    expect(result.out).toContain('Usage: sht validate')
  })
})

describe('sht build-policy', () => {
  afterEach(removeTempCopies)
  const goodPolicy = `${policySource}/good/policy.ts`

  it('builds into the pack folder and says how to use the result', async () => {
    const pack = emptyTempDir()
    const result = await run('build-policy', goodPolicy, '--pack', pack)
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/Built demo-policy-\d{4}\.\d{2}\.\d{2}\.1\n/)
    expect(result.out).toMatch(/ {2}policies\/demo-policy-.*\.js\n/)
    expect(result.out).toMatch(/To use it, set "policy: demo-policy-\d{4}\.\d{2}\.\d{2}\.1" in .*\/pack\.yml$/)
  })

  it('says so, and writes nothing, when the source has not changed', async () => {
    const pack = emptyTempDir()
    await run('build-policy', goodPolicy, '--pack', pack)
    const again = await run('build-policy', goodPolicy, '--pack', pack)
    expect(again.code).toBe(0)
    expect(again.out).toMatch(/^Up to date: demo-policy-/)
  })

  it('uses --version and --force', async () => {
    const pack = emptyTempDir()
    expect((await run('build-policy', goodPolicy, '--pack', pack, '--version', '2026.01.02.7')).out).toContain('Built demo-policy-2026.01.02.7')
    const clash = await run('build-policy', goodPolicy, '--pack', pack, '--version', '2026.01.02.7')
    expect(clash.code).toBe(1)
    expect(clash.out).toContain('SH607')
    expect((await run('build-policy', goodPolicy, '--pack', pack, '--version', '2026.01.02.7', '--force')).code).toBe(0)
  })

  it('exits 1 with diagnostics when the policy cannot be built', async () => {
    const result = await run('build-policy', `${policySource}/variants/host-import.ts`, '--pack', emptyTempDir())
    expect(result.code).toBe(1)
    expect(result.out).toContain('SH601')
    expect(result.out).toContain('Build failed: 1 error(s)')
  })

  it('exits 2 when no policy source is given', async () => {
    const result = await run('build-policy')
    expect(result.code).toBe(2)
    expect(result.err).toContain('Missing the policy source file')
  })
})

describe('sht pack, keygen, sign and verify', () => {
  afterEach(removeTempCopies)

  it('takes a pack from packed to signed to verified', async () => {
    const pack = tempPackCopy(toyPack)
    const keys = emptyTempDir()
    expect((await run('pack', pack)).out).toMatch(/^Packed toy-pack 2026\.09\.19\.1: 6 files locked in pack\.lock\.json$/)
    expect((await run('pack', pack)).out).toMatch(/^Up to date: /)
    const keygen = await run('keygen', 'dev', '--out', keys)
    expect(keygen.code).toBe(0)
    expect(keygen.out).toContain('private: keep it secret and never commit it')
    const signedResult = await run('sign', pack, '--key', `${keys}/dev.key`)
    expect(signedResult.code).toBe(0)
    expect(signedResult.out).toMatch(/^Signed with key [0-9a-f]{16}\. Wrote pack\.sig\.json$/)
    const verified = await run('verify', pack, '--trust', `${keys}/dev.pub`, '--require-signature')
    expect(verified.code).toBe(0)
    expect(verified.out).toMatch(/Verified: 6 files match pack\.lock\.json\nSigned by key [0-9a-f]{16} \(trusted\)$/)
  })

  it('exits 1 with the reasons when verification fails', async () => {
    const pack = tempPackCopy(toyPack)
    await run('pack', pack)
    rmSync(`${pack}/templates/entities/lamp.yml`)
    const result = await run('verify', pack)
    expect(result.code).toBe(1)
    expect(result.out).toContain('SH713')
    expect(result.out).toContain('Verification failed: 1 error(s)')
  })

  it('says when a pack is not signed, and passes unless a signature is required', async () => {
    const pack = tempPackCopy(toyPack)
    await run('pack', pack)
    const result = await run('verify', pack)
    expect(result.code).toBe(0)
    expect(result.out).toContain('SH720')
    expect(result.out).toMatch(/Not signed$/)
    expect((await run('verify', pack, '--require-signature')).code).toBe(1)
  })

  it('exits 1 when the pack does not validate', async () => {
    const result = await run('pack', brokenPack)
    expect(result.code).toBe(1)
    expect(result.out).toContain('SH700')
    expect(result.out).toMatch(/Pack failed: \d+ error\(s\)$/)
  })

  it('exits 2 without a key name or a --key', async () => {
    expect((await run('keygen')).code).toBe(2)
    expect((await run('sign', toyPack)).code).toBe(2)
  })
})
