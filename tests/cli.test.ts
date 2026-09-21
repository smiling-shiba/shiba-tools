import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { main } from '../src/cli.ts'
import { removeTempCopies, tempPackCopy } from './helpers.ts'

const toyPack = fileURLToPath(new URL('./fixtures/toy-pack', import.meta.url))
const brokenPack = fileURLToPath(new URL('./fixtures/broken-pack', import.meta.url))

function run(...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = []
  const err: string[] = []
  const code = main(argv, { out: (text) => out.push(text), err: (text) => err.push(text) })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('sht validate', () => {
  afterEach(removeTempCopies)

  it('exits 0 and says so for a valid pack', () => {
    const result = run('validate', toyPack)
    expect(result.code).toBe(0)
    expect(result.out).toBe('OK: no problems found')
  })

  it('exits 1 and prints file:line:column diagnostics for a broken pack', () => {
    const result = run('validate', brokenPack)
    expect(result.code).toBe(1)
    expect(result.out).toContain('templates/entities/typo-function.yml:6:9  error  SH101  Unknown function "set_valeu"')
    expect(result.out).toContain('Did you mean "set_value"?')
    expect(result.out).toMatch(/\d+ error\(s\), \d+ warning\(s\)$/)
  })

  it('prints machine-readable output with --json', () => {
    const result = run('validate', brokenPack, '--json')
    const parsed: unknown = JSON.parse(result.out)
    expect(parsed).toMatchObject({ errors: expect.any(Number), warnings: 0, diagnostics: expect.any(Array) })
    expect(result.code).toBe(1)
  })

  it('exits 0 when there are only warnings', () => {
    const copy = tempPackCopy(toyPack)
    rmSync(join(copy, 'policies/toy-policy-2026.09.19.1.js'))
    const result = run('validate', copy)
    expect(result.code).toBe(0)
    expect(result.out).toContain('SH014')
    expect(result.out).toContain('0 error(s), 1 warning(s)')
  })

  it('shows usage and exits 2 without a command', () => {
    const result = run()
    expect(result.code).toBe(2)
    expect(result.err).toContain('Usage: sht validate')
  })

  it('exits 2 for an unknown command or option', () => {
    expect(run('frobnicate').code).toBe(2)
    expect(run('validate', '--nope').code).toBe(2)
  })

  it('shows help and exits 0', () => {
    const result = run('--help')
    expect(result.code).toBe(0)
    expect(result.out).toContain('Usage: sht validate')
  })
})
