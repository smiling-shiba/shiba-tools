import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPolicy } from '../src/build-policy.ts'
import { parseContract } from '../src/contract.ts'
import { emptyTempDir, removeTempCopies, tempPackCopy } from './helpers.ts'

const source = fileURLToPath(new URL('./fixtures/policy-src', import.meta.url))
const good = join(source, 'good/policy.ts')
const variant = (name: string): string => join(source, 'variants', name)
const on = (year: number, month: number, day: number) => () => new Date(year, month - 1, day, 12)
const sept19 = on(2026, 9, 19)

afterEach(removeTempCopies)

const files = (pack: string): string[] => (existsSync(join(pack, 'policies')) ? readdirSync(join(pack, 'policies')).sort() : [])
const contractIn = (pack: string, name: string): unknown => JSON.parse(readFileSync(join(pack, 'policies', `${name}.contract.json`), 'utf8'))

describe('building a policy', () => {
  it('writes a bundle and a contract named <id>-policy-<calver>', async () => {
    const pack = emptyTempDir()
    const result = await buildPolicy({ entry: good, packDir: pack, now: sept19 })
    expect(result).toMatchObject({ status: 'built', name: 'demo-policy-2026.09.19.1', diagnostics: [] })
    expect(result.files).toEqual(['policies/demo-policy-2026.09.19.1.js', 'policies/demo-policy-2026.09.19.1.contract.json'])
    expect(files(pack)).toEqual(['demo-policy-2026.09.19.1.contract.json', 'demo-policy-2026.09.19.1.js'])
  })

  it('bundles imported files into one minified module and strips TypeScript types', async () => {
    const pack = emptyTempDir()
    await buildPolicy({ entry: good, packDir: pack, now: sept19 })
    const bundle = readFileSync(join(pack, 'policies/demo-policy-2026.09.19.1.js'), 'utf8')
    expect(bundle).not.toMatch(/\bimport\b/)
    expect(bundle).not.toContain(': string')
    expect(bundle).toContain('demo')
    expect(bundle.trim().split('\n')).toHaveLength(1)
  })

  it('records the version and the bundle hash in a valid contract', async () => {
    const pack = emptyTempDir()
    await buildPolicy({ entry: good, packDir: pack, now: sept19 })
    const contract = contractIn(pack, 'demo-policy-2026.09.19.1')
    expect(parseContract(contract)).toHaveProperty('contract')
    const bundle = readFileSync(join(pack, 'policies/demo-policy-2026.09.19.1.js'))
    expect(contract).toMatchObject({ policy: { id: 'demo', version: '2026.09.19.1', sha256: createHash('sha256').update(bundle).digest('hex') } })
  })

  it('accepts plain JavaScript source', async () => {
    const pack = emptyTempDir()
    expect(await buildPolicy({ entry: join(source, 'good/plain.js'), packDir: pack, now: sept19 })).toMatchObject({ status: 'built', name: 'plain-policy-2026.09.19.1' })
  })

  it('gives byte-identical output for the same source and version', async () => {
    const [first, second] = [emptyTempDir(), emptyTempDir()]
    await buildPolicy({ entry: good, packDir: first, version: '2026.09.19.1' })
    await buildPolicy({ entry: good, packDir: second, version: '2026.09.19.1' })
    for (const name of files(first)) expect(readFileSync(join(second, 'policies', name), 'utf8')).toBe(readFileSync(join(first, 'policies', name), 'utf8'))
  })

  it('ignores what the policy prints while loading', async () => {
    expect(await buildPolicy({ entry: variant('noisy.ts'), packDir: emptyTempDir(), now: sept19 })).toMatchObject({ status: 'built', name: 'noisy-policy-2026.09.19.1' })
  })
})

describe('versions', () => {
  it('reports "unchanged" and writes nothing when the source has not changed', async () => {
    const pack = emptyTempDir()
    await buildPolicy({ entry: good, packDir: pack, now: sept19 })
    const again = await buildPolicy({ entry: good, packDir: pack, now: on(2026, 9, 21) })
    expect(again).toMatchObject({ status: 'unchanged', name: 'demo-policy-2026.09.19.1', files: [] })
    expect(files(pack)).toHaveLength(2)
  })

  it('counts up the build number on the same day when the source changes', async () => {
    const copy = tempPackCopy(source)
    const pack = emptyTempDir()
    const entry = join(copy, 'good/policy.ts')
    await buildPolicy({ entry, packDir: pack, now: sept19 })
    writeFileSync(join(copy, 'good/helper.ts'), "export const POLICY_ID: string = 'demo'\nexport const CHANGED = true\nconsole.log(CHANGED)\n")
    const second = await buildPolicy({ entry, packDir: pack, now: sept19 })
    expect(second).toMatchObject({ status: 'built', name: 'demo-policy-2026.09.19.2' })
    expect(files(pack)).toHaveLength(4)
  })

  it('starts again at 1 on a new day', async () => {
    const copy = tempPackCopy(source)
    const pack = emptyTempDir()
    const entry = join(copy, 'good/policy.ts')
    await buildPolicy({ entry, packDir: pack, now: sept19 })
    writeFileSync(join(copy, 'good/helper.ts'), "export const POLICY_ID: string = 'demo'\nconsole.log(1)\n")
    expect(await buildPolicy({ entry, packDir: pack, now: on(2026, 9, 20) })).toMatchObject({ status: 'built', name: 'demo-policy-2026.09.20.1' })
  })

  it('rebuilds unchanged source with --force, as the next build number', async () => {
    const pack = emptyTempDir()
    await buildPolicy({ entry: good, packDir: pack, now: sept19 })
    expect(await buildPolicy({ entry: good, packDir: pack, now: sept19, force: true })).toMatchObject({ status: 'built', name: 'demo-policy-2026.09.19.2' })
  })

  it('uses an explicit version, and refuses to replace an existing one without --force', async () => {
    const pack = emptyTempDir()
    expect(await buildPolicy({ entry: good, packDir: pack, version: '2026.01.02.7' })).toMatchObject({ status: 'built', name: 'demo-policy-2026.01.02.7' })
    const clash = await buildPolicy({ entry: good, packDir: pack, version: '2026.01.02.7' })
    expect(clash.status).toBe('failed')
    expect(clash.diagnostics).toMatchObject([{ code: 'SH607', severity: 'error' }])
    expect((await buildPolicy({ entry: good, packDir: pack, version: '2026.01.02.7', force: true })).status).toBe('built')
  })

  it('rejects a version that is not a calver', async () => {
    const result = await buildPolicy({ entry: good, packDir: emptyTempDir(), version: '1.2.3' })
    expect(result.diagnostics).toMatchObject([{ code: 'SH606' }])
  })
})

describe('the active policy', () => {
  it('knows whether pack.yml already names the built policy', async () => {
    const pack = emptyTempDir()
    expect((await buildPolicy({ entry: good, packDir: pack, now: sept19 })).active).toBe(false)
    writeFileSync(join(pack, 'pack.yml'), 'policy: demo-policy-2026.09.19.1\n')
    expect((await buildPolicy({ entry: good, packDir: pack, now: sept19 })).active).toBe(true)
  })
})

describe('problems', () => {
  const failsWith = async (entry: string): Promise<{ codes: string[]; pack: string; result: Awaited<ReturnType<typeof buildPolicy>> }> => {
    const pack = emptyTempDir()
    const result = await buildPolicy({ entry, packDir: pack, now: sept19 })
    return { codes: result.diagnostics.map((problem) => problem.code), pack, result }
  }

  it('reports a missing source file', async () => {
    const { codes, result } = await failsWith(variant('does-not-exist.ts'))
    expect(codes).toEqual(['SH600'])
    expect(result.status).toBe('failed')
  })

  it('rejects host imports, with the file and position', async () => {
    const { result, pack } = await failsWith(variant('host-import.ts'))
    expect(result.status).toBe('failed')
    expect(result.diagnostics).toMatchObject([{ code: 'SH601', file: 'tests/fixtures/policy-src/variants/host-import.ts', line: 1, column: 30 }])
    expect(result.diagnostics[0]?.message).toContain('"node:fs"')
    expect(files(pack)).toEqual([])
  })

  it('reports an import that cannot be found', async () => {
    const { result } = await failsWith(variant('missing-import.ts'))
    expect(result.diagnostics).toMatchObject([{ code: 'SH602', line: 1 }])
    expect(result.diagnostics[0]?.message).toContain('not-a-real-package')
  })

  it('reports a syntax error', async () => {
    expect((await failsWith(variant('syntax-error.ts'))).codes).toEqual(['SH602'])
  })

  it('reports a policy that fails while loading, with its message', async () => {
    const { result } = await failsWith(variant('throws.ts'))
    expect(result.diagnostics).toMatchObject([{ code: 'SH603' }])
    expect(result.diagnostics[0]?.message).toContain('the definition is broken')
  })

  it('reports a file that does not default-export a policy', async () => {
    expect((await failsWith(variant('no-default.ts'))).codes).toEqual(['SH604'])
  })

  it('reports a policy id that cannot be used in file names', async () => {
    const { codes, pack } = await failsWith(variant('bad-id.ts'))
    expect(codes).toEqual(['SH605'])
    expect(files(pack)).toEqual([])
  })

  it('warns, without failing, about APIs that are not deterministic', async () => {
    const { result, pack } = await failsWith(variant('random.ts'))
    expect(result.status).toBe('built')
    expect(result.diagnostics).toMatchObject([{ severity: 'warning', code: 'SH650', file: 'tests/fixtures/policy-src/variants/random.ts', line: 4 }])
    expect(result.diagnostics[0]?.message).toContain('Math.random()')
    expect(files(pack)).toHaveLength(2)
  })
})
