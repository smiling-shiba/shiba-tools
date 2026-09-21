import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Diagnostic } from '../src/diagnostics.ts'
import { validatePack } from '../src/validate.ts'
import { emptyTempDir, removeTempCopies, tempPackCopy } from './helpers.ts'

const toyPack = fileURLToPath(new URL('./fixtures/toy-pack', import.meta.url))
const brokenPack = fileURLToPath(new URL('./fixtures/broken-pack', import.meta.url))

const inFile = (diagnostics: Diagnostic[], file: string): Diagnostic[] =>
  diagnostics.filter((diagnostic) => diagnostic.file === `templates/${file}`)

const codes = (diagnostics: Diagnostic[], file: string): string[] =>
  inFile(diagnostics, file).map((diagnostic) => diagnostic.code)

describe('given a valid toy pack', () => {
  it('reports no problems', () => {
    expect(validatePack(toyPack)).toEqual([])
  })

  it('gives the same answer every time', () => {
    expect(validatePack(brokenPack)).toEqual(validatePack(brokenPack))
  })
})

describe('given a pack with one broken template per problem', () => {
  const diagnostics = validatePack(brokenPack)

  it('leaves the valid templates alone', () => {
    expect(inFile(diagnostics, 'entities/crate.yml')).toEqual([])
    expect(inFile(diagnostics, 'entities/lamp.yml')).toEqual([])
  })

  it('flags an unknown function and suggests the closest name', () => {
    expect(inFile(diagnostics, 'entities/typo-function.yml')).toEqual([{
      severity: 'error', file: 'templates/entities/typo-function.yml', line: 6, column: 9,
      code: 'SH101', message: 'Unknown function "set_valeu"', suggestion: 'Did you mean "set_value"?',
    }])
  })

  it('flags an argument of the wrong type and shows what it got', () => {
    const [problem, ...rest] = inFile(diagnostics, 'entities/bad-arg.yml')
    expect(rest).toEqual([])
    expect(problem).toMatchObject({ code: 'SH204', line: 9, column: 14 })
    expect(problem?.message).toBe('Argument "value" must be integer (got "heavy")')
  })

  it('rejects an unknown argument and reports the missing required one', () => {
    expect(codes(diagnostics, 'entities/unknown-arg.yml')).toEqual(['SH204', 'SH202'])
    const unknown = inFile(diagnostics, 'entities/unknown-arg.yml').find((problem) => problem.code === 'SH202')
    expect(unknown).toMatchObject({ line: 9, column: 7, suggestion: 'Did you mean "value"?' })
  })

  it('rejects an unknown field and reports the missing required one', () => {
    expect(codes(diagnostics, 'entities/unknown-field.yml')).toEqual(['SH203', 'SH201'])
    const unknown = inFile(diagnostics, 'entities/unknown-field.yml').find((problem) => problem.code === 'SH201')
    expect(unknown).toMatchObject({ line: 3, column: 1, suggestion: 'Did you mean "name"?' })
  })

  it('flags an unknown hook', () => {
    expect(inFile(diagnostics, 'entities/unknown-hook.yml')).toEqual([{
      severity: 'error', file: 'templates/entities/unknown-hook.yml', line: 4, column: 5,
      code: 'SH102', message: 'Unknown hook "creatd"', suggestion: 'Did you mean "created"?',
    }])
  })

  it('requires "on" and "do" together', () => {
    expect(inFile(diagnostics, 'entities/on-without-do.yml')).toMatchObject([
      { code: 'SH103', line: 4, column: 1, message: '"on" needs a matching "do"' },
    ])
  })

  it('reports YAML syntax errors and nothing else for that file', () => {
    const problems = inFile(diagnostics, 'entities/syntax-error.yml')
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.every((problem) => problem.code === 'SH010')).toBe(true)
    expect(problems[0]?.message).not.toMatch(/ at line \d+/)
  })

  it('requires a kind, and knows the kinds the policy declares', () => {
    expect(inFile(diagnostics, 'entities/missing-kind.yml')).toMatchObject([
      { code: 'SH120', line: 1, column: 1, message: 'Missing required field "kind"' },
    ])
    expect(inFile(diagnostics, 'entities/unknown-kind.yml')).toMatchObject([
      { code: 'SH110', line: 1, column: 7, message: 'Unknown kind "widget"' },
    ])
  })

  it('reports a duplicate id on the second file only', () => {
    expect(inFile(diagnostics, 'entities/duplicate-a.yml')).toEqual([])
    expect(inFile(diagnostics, 'entities/duplicate-b.yml')).toMatchObject([
      { code: 'SH302', line: 2, column: 5, message: 'Duplicate entity id "dup" (first defined in templates/entities/duplicate-a.yml)' },
    ])
  })

  it('flags a reference to something that does not exist', () => {
    expect(inFile(diagnostics, 'collections/bad-reference.yml')).toEqual([{
      severity: 'error', file: 'templates/collections/bad-reference.yml', line: 3, column: 19,
      code: 'SH301', message: 'Unknown entity "lamp2"', suggestion: 'Did you mean "lamp"?',
    }])
  })

  it('returns problems sorted by file and position', () => {
    const keys = diagnostics.map((problem) => `${problem.file}|${String(problem.line).padStart(6, '0')}|${String(problem.column).padStart(6, '0')}`)
    expect(keys).toEqual([...keys].sort())
  })
})

describe('given problems in pack.yml or the contract', () => {
  afterEach(removeTempCopies)
  const copyOfToyPack = (): string => tempPackCopy(toyPack)

  it('reports a missing pack.yml', () => {
    expect(validatePack(emptyTempDir())).toMatchObject([{ code: 'SH011', file: 'pack.yml', severity: 'error' }])
  })

  it('reports an SDK version outside the pack range', () => {
    const copy = copyOfToyPack()
    const path = join(copy, 'pack.yml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('>=0.1.0 <0.2.0', '>=0.2.0 <0.3.0'))
    expect(validatePack(copy)).toMatchObject([
      { code: 'SH501', file: 'pack.yml', line: 5, message: 'SDK 0.1.0 does not satisfy ">=0.2.0 <0.3.0"' },
    ])
  })

  it('reports a range it cannot understand', () => {
    const copy = copyOfToyPack()
    const path = join(copy, 'pack.yml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('>=0.1.0 <0.2.0', '^0.1.0'))
    expect(validatePack(copy)).toMatchObject([{ code: 'SH501', file: 'pack.yml' }])
  })

  it('rejects an unknown pack.yml field and suggests the right one', () => {
    const copy = copyOfToyPack()
    const path = join(copy, 'pack.yml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('templates:', 'templats:'))
    const problems = validatePack(copy)
    expect(problems).toContainEqual(expect.objectContaining({ code: 'SH013', line: 6, suggestion: 'Did you mean "templates"?' }))
  })

  it('reports a missing required pack.yml field', () => {
    const copy = copyOfToyPack()
    const path = join(copy, 'pack.yml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('policy: toy-policy-2026.09.19.1\n', ''))
    expect(validatePack(copy)).toContainEqual(expect.objectContaining({ code: 'SH011', message: 'Missing required field "policy"' }))
  })

  it('reports a missing contract file', () => {
    const copy = copyOfToyPack()
    rmSync(join(copy, 'policies/toy-policy-2026.09.19.1.contract.json'))
    expect(validatePack(copy)).toMatchObject([
      { code: 'SH012', file: 'pack.yml', message: 'Contract not found: policies/toy-policy-2026.09.19.1.contract.json' },
    ])
  })

  it('reports a contract that is not valid JSON', () => {
    const copy = copyOfToyPack()
    writeFileSync(join(copy, 'policies/toy-policy-2026.09.19.1.contract.json'), '{ nope')
    const [problem] = validatePack(copy)
    expect(problem).toMatchObject({ code: 'SH012', file: 'policies/toy-policy-2026.09.19.1.contract.json' })
    expect(problem?.message).toContain('not valid JSON')
  })

  it('reports a contract with the wrong shape', () => {
    const copy = copyOfToyPack()
    writeFileSync(join(copy, 'policies/toy-policy-2026.09.19.1.contract.json'), '{"policy": {"id": "toy", "version": "1"}}')
    const [problem] = validatePack(copy)
    expect(problem).toMatchObject({ code: 'SH012' })
    expect(problem?.message).toContain('Contract is invalid')
  })

  it('warns, without failing, when the bundle is missing', () => {
    const copy = copyOfToyPack()
    rmSync(join(copy, 'policies/toy-policy-2026.09.19.1.js'))
    expect(validatePack(copy)).toMatchObject([{ code: 'SH014', severity: 'warning' }])
  })

  it('warns when no templates match', () => {
    const copy = copyOfToyPack()
    rmSync(join(copy, 'templates'), { recursive: true })
    expect(validatePack(copy)).toMatchObject([{ code: 'SH016', severity: 'warning' }])
  })

  it('refuses a policy name that tries to leave the policies folder', () => {
    const copy = copyOfToyPack()
    const path = join(copy, 'pack.yml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('toy-policy-2026.09.19.1', '../evil'))
    expect(validatePack(copy)).toMatchObject([{ code: 'SH012', file: 'pack.yml' }])
  })
})
