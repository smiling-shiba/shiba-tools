import { describe, expect, it } from 'vitest'
import { parseVersion, satisfies } from '../src/version-range.ts'

describe('parseVersion', () => {
  it('parses major.minor.patch', () => {
    expect(parseVersion('1.22.3')).toEqual([1, 22, 3])
  })

  it('rejects anything else', () => {
    expect(parseVersion('1.2')).toBeUndefined()
    expect(parseVersion('v1.2.3')).toBeUndefined()
  })
})

describe('satisfies', () => {
  it('requires every comparator to hold', () => {
    expect(satisfies('0.1.0', '>=0.1.0 <0.2.0')).toBe(true)
    expect(satisfies('0.1.9', '>=0.1.0 <0.2.0')).toBe(true)
    expect(satisfies('0.2.0', '>=0.1.0 <0.2.0')).toBe(false)
    expect(satisfies('0.0.9', '>=0.1.0 <0.2.0')).toBe(false)
  })

  it('supports each comparator and a bare exact version', () => {
    expect(satisfies('1.0.0', '>0.9.0')).toBe(true)
    expect(satisfies('1.0.0', '>1.0.0')).toBe(false)
    expect(satisfies('1.0.0', '<=1.0.0')).toBe(true)
    expect(satisfies('1.0.0', '=1.0.0')).toBe(true)
    expect(satisfies('1.0.0', '1.0.0')).toBe(true)
  })

  it('compares numbers, not text', () => {
    expect(satisfies('0.10.0', '>0.9.0')).toBe(true)
  })

  it('returns undefined when the version or range is unusable', () => {
    expect(satisfies('nope', '>=0.1.0')).toBeUndefined()
    expect(satisfies('0.1.0', '^0.1.0')).toBeUndefined()
    expect(satisfies('0.1.0', '   ')).toBeUndefined()
  })
})
