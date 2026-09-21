import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import type { ValidateFunction } from 'ajv'
import { afterEach, describe, expect, it } from 'vitest'
import { main } from '../src/cli.ts'
import { parseContract } from '../src/contract.ts'
import { expandGlob } from '../src/glob.ts'
import { collectTemplateIds } from '../src/pack.ts'
import { buildPackSchema, buildTemplateSchema, VSCODE_SETTINGS, writeSchemas } from '../src/schemas.ts'
import { validatePack } from '../src/validate.ts'
import { parseYamlSource } from '../src/yaml-source.ts'
import { removeTempCopies, tempPackCopy } from './helpers.ts'

const toyPack = fileURLToPath(new URL('./fixtures/toy-pack', import.meta.url))
const brokenPack = fileURLToPath(new URL('./fixtures/broken-pack', import.meta.url))
const contractFile = 'policies/toy-policy-2026.09.19.1.contract.json'

// The editor schemas use extra keywords (snippets, enum descriptions) that only editors understand.
const ajv = new Ajv({ strict: false, allErrors: true })

function templateSchemaFor(packDir: string): ValidateFunction {
  const parsed = parseContract(JSON.parse(readFileSync(join(packDir, contractFile), 'utf8')))
  if ('error' in parsed) throw new Error(parsed.error)
  return ajv.compile(buildTemplateSchema(parsed.contract, collectTemplateIds(packDir, 'templates/**/*.yml')))
}

afterEach(removeTempCopies)
const tempCopy = (): string => tempPackCopy(toyPack)

describe('the template schema', () => {
  const accepts = templateSchemaFor(toyPack)

  it('accepts every valid toy template', () => {
    for (const file of expandGlob(toyPack, 'templates/**/*.yml')) {
      const value = parseYamlSource(readFileSync(join(toyPack, file), 'utf8')).value
      expect(accepts(value), `${file}: ${JSON.stringify(accepts.errors)}`).toBe(true)
    }
  })

  it('agrees with `sht validate` on every template in the broken pack, except what a schema cannot express', () => {
    const schema = templateSchemaFor(brokenPack)
    const diagnostics = validatePack(brokenPack)
    for (const file of expandGlob(brokenPack, 'templates/**/*.yml')) {
      const source = parseYamlSource(readFileSync(join(brokenPack, file), 'utf8'))
      if (source.syntaxProblems.length > 0) continue
      const validatorAccepts = !diagnostics.some((problem) => problem.file === file && problem.severity === 'error')
      const schemaAccepts = schema(source.value)
      // Duplicate ids span files, which a per-file schema cannot see.
      const expected = file.endsWith('duplicate-b.yml') ? true : validatorAccepts
      expect(schemaAccepts, file).toBe(expected)
    }
  })

  it('rejects an unknown hook, an unknown function and a misspelled field', () => {
    expect(accepts({ kind: 'entity', id: 'x', name: 'X', on: 'creatd', do: [{ fn: 'emit', args: { event: 'e' } }] })).toBe(false)
    expect(accepts({ kind: 'entity', id: 'x', name: 'X', on: 'created', do: [{ fn: 'set_valeu', args: {} }] })).toBe(false)
    expect(accepts({ kind: 'entity', id: 'x', nmae: 'X' })).toBe(false)
  })

  it('checks each function\'s arguments, including unknown and missing ones', () => {
    const step = (args: unknown) => ({ kind: 'entity', id: 'x', name: 'X', on: 'created', do: [{ fn: 'set_value', args }] })
    expect(accepts(step({ key: 'w', value: 5 }))).toBe(true)
    expect(accepts(step({ key: 'w', value: 'heavy' }))).toBe(false)
    expect(accepts(step({ key: 'w', value: 5, extra: 1 }))).toBe(false)
    expect(accepts(step({ key: 'w' }))).toBe(false)
  })

  it('requires "on" and "do" together', () => {
    expect(accepts({ kind: 'entity', id: 'x', name: 'X', on: 'created' })).toBe(false)
    expect(accepts({ kind: 'entity', id: 'x', name: 'X', do: [] })).toBe(false)
  })

  it('offers the ids that exist as the only valid references', () => {
    expect(accepts({ kind: 'collection', id: 'c', entities: ['crate', 'lamp'] })).toBe(true)
    expect(accepts({ kind: 'collection', id: 'c', entities: ['lamp2'] })).toBe(false)
  })

  it('offers a snippet for each kind and each function, with the required parts filled in as placeholders', () => {
    const parsed = parseContract(JSON.parse(readFileSync(join(toyPack, contractFile), 'utf8')))
    if ('error' in parsed) throw new Error(parsed.error)
    const schema = buildTemplateSchema(parsed.contract, new Map())
    expect(schema.defaultSnippets).toEqual([
      { label: 'collection', description: 'New collection template', body: { kind: 'collection', id: '${1:id}', entities: ['${2:entities}'] } },
      { label: 'entity', description: 'New entity template', body: { kind: 'entity', id: '${1:id}', name: '${2:name}' } },
    ])
    expect(schema).toMatchObject({
      allOf: [
        expect.anything(),
        {
          then: {
            properties: {
              do: {
                items: {
                  defaultSnippets: [
                    { label: 'add_tag', description: 'Add tag', body: { fn: 'add_tag', args: { tag: '${1:tag}' } } },
                    { label: 'emit', description: 'Emit event', body: { fn: 'emit', args: { event: '${1:event}' } } },
                    { label: 'set_value', description: 'Set value', body: { fn: 'set_value', args: { key: '${1:key}', value: '${2:0}' } } },
                  ],
                },
              },
            },
          },
        },
      ],
    })
  })

  it('is deterministic', () => {
    const parsed = parseContract(JSON.parse(readFileSync(join(toyPack, contractFile), 'utf8')))
    if ('error' in parsed) throw new Error(parsed.error)
    const ids = collectTemplateIds(toyPack, 'templates/**/*.yml')
    expect(JSON.stringify(buildTemplateSchema(parsed.contract, ids))).toBe(JSON.stringify(buildTemplateSchema(parsed.contract, ids)))
  })
})

describe('the pack.yml schema', () => {
  const accepts = ajv.compile(buildPackSchema(['toy-policy-2026.09.19.1']))
  const good = { id: 'p', version: '2026.09.19.1', policy: 'toy-policy-2026.09.19.1', sdk: { range: '>=0.1.0 <0.2.0' }, templates: 'templates/**/*.yml' }

  it('accepts a good pack.yml and rejects unknown keys and unknown policies', () => {
    expect(accepts(good)).toBe(true)
    expect(accepts({ ...good, extra: 1 })).toBe(false)
    expect(accepts({ ...good, policy: 'other-policy-2026.01.01.1' })).toBe(false)
  })
})

describe('writeSchemas', () => {
  it('writes both schemas and creates the VS Code settings', () => {
    const pack = tempCopy()
    const result = writeSchemas(pack)
    expect(result).toMatchObject({ written: ['.shiba/template.schema.json', '.shiba/pack.schema.json'], settings: 'created', diagnostics: [] })
    expect(JSON.parse(readFileSync(join(pack, '.vscode/settings.json'), 'utf8'))).toEqual(VSCODE_SETTINGS)
  })

  it('produces identical files when run twice', () => {
    const pack = tempCopy()
    writeSchemas(pack)
    const first = readFileSync(join(pack, '.shiba/template.schema.json'), 'utf8')
    writeSchemas(pack)
    expect(readFileSync(join(pack, '.shiba/template.schema.json'), 'utf8')).toBe(first)
  })

  it('never modifies an existing settings file', () => {
    const pack = tempCopy()
    const custom = '{ "editor.tabSize": 4 }\n'
    mkdirSync(join(pack, '.vscode'))
    writeFileSync(join(pack, '.vscode/settings.json'), custom)
    expect(writeSchemas(pack).settings).toBe('exists')
    expect(readFileSync(join(pack, '.vscode/settings.json'), 'utf8')).toBe(custom)
  })

  it('writes nothing when the pack does not load', () => {
    const pack = tempCopy()
    rmSync(join(pack, contractFile))
    const result = writeSchemas(pack)
    expect(result.written).toEqual([])
    expect(result.diagnostics).toMatchObject([{ code: 'SH012' }])
    expect(existsSync(join(pack, '.shiba'))).toBe(false)
  })
})

describe('sht schemas', () => {
  const run = (...argv: string[]): { code: number; out: string; err: string } => {
    const out: string[] = []
    const err: string[] = []
    const code = main(argv, { out: (text) => out.push(text), err: (text) => err.push(text) })
    return { code, out: out.join('\n'), err: err.join('\n') }
  }

  it('reports what it wrote and how to use it', () => {
    const pack = tempCopy()
    const result = run('schemas', pack)
    expect(result.code).toBe(0)
    expect(result.out).toContain('Wrote .shiba/template.schema.json')
    expect(result.out).toContain('Created .vscode/settings.json')
    expect(result.out).toContain('YAML" extension by Red Hat')
  })

  it('exits 1 with the diagnostics when the pack does not load', () => {
    const result = run('schemas', join(tmpdir(), 'sht-no-such-pack'))
    expect(result.code).toBe(1)
    expect(result.out).toContain('SH011')
  })
})
