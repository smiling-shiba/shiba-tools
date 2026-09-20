import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import fc from 'fast-check'
import { Type } from 'typebox'
import { describe, expect, it } from 'vitest'
import { parse, parseDocument, stringify } from 'yaml'

const personaSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  health: Type.Integer({ minimum: 1, default: 30 }),
  website: Type.Optional(Type.String({ format: 'uri' })),
}, { additionalProperties: false })

describe('schema and content dependencies', () => {
  const ajv = addFormats(new Ajv({ allErrors: true }))
  const validate = ajv.compile(personaSchema)

  it('validates parsed YAML against a TypeBox schema using Ajv', () => {
    expect(validate(parse('id: fisherman\nhealth: 30\n'))).toBe(true)
  })

  it.each([
    ['id: fisherman\nhealth: 0\n', 'minimum'],
    ['id: fisherman\nhealth: many\n', 'type'],
    ['id: fisherman\nhealth: 30\nwebsite: invalid\n', 'format'],
    ['health: 30\n', 'required'],
  ])('reports schema errors for %s', (source, keyword) => {
    expect(validate(parse(source))).toBe(false)
    expect(validate.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ keyword }),
    ]))
  })

  it('reports malformed YAML', () => {
    expect(parseDocument('cards: [unfinished').errors).not.toHaveLength(0)
  })

  it('preserves author comments when editing a YAML document', () => {
    const document = parseDocument('# Starter persona\nid: fisherman\nhealth: 30 # base health\n')
    document.set('health', 40)
    const saved = document.toString()
    expect(saved).toContain('# Starter persona')
    expect(saved).toContain('# base health')
    expect(parse(saved)).toEqual({ id: 'fisherman', health: 40 })
  })

  it('round-trips generated content through YAML without changing values', () => {
    fc.assert(fc.property(
      fc.record({ id: fc.string({ minLength: 1 }), health: fc.integer({ min: 1, max: 100 }) }),
      (persona) => {
        const restored: unknown = parse(stringify(persona))
        expect(restored).toEqual(persona)
        expect(validate(restored)).toBe(true)
      },
    ), { seed: 1001, numRuns: 100 })
  })
})
