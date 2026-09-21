import { describe, expect, it } from 'vitest'
import { canonicalize, CanonicalizeError, sha256Hex } from '../src/canonical.ts'

describe('canonicalize', () => {
  it('sorts object keys and writes no whitespace', () => {
    expect(canonicalize({ b: 1, a: { d: [3, 2], c: null } })).toBe('{"a":{"c":null,"d":[3,2]},"b":1}')
  })

  it('gives the same text however the data was ordered', () => {
    expect(canonicalize({ x: 1, y: 2 })).toBe(canonicalize({ y: 2, x: 1 }))
  })

  it('sorts keys by UTF-16 code units, like RFC 8785', () => {
    expect(canonicalize({ b: 1, é: 2, a: 3, A: 4 })).toBe('{"A":4,"a":3,"b":1,"é":2}')
  })

  it('writes numbers the way RFC 8785 does', () => {
    expect(canonicalize([Number('333333333.33333329'), 1e30, 4.5, 2e-3, 0.000000000000000000000000001])).toBe('[333333333.3333333,1e+30,4.5,0.002,1e-27]')
    expect(canonicalize(-0)).toBe('0')
  })

  it('escapes strings like JSON, with control characters in lower-case hex', () => {
    const input = `a${String.fromCharCode(0x1f)}b"\\€`
    expect(canonicalize(input)).toBe('"a\\u001fb\\"\\\\€"')
  })

  it('handles booleans, null and empty containers', () => {
    expect(canonicalize([true, false, null, [], {}])).toBe('[true,false,null,[],{}]')
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
    ['a function', () => 1],
    ['a date', new Date(0)],
    ['a map', new Map()],
    ['a nested undefined', { a: undefined }],
  ])('refuses %s, because JSON cannot hold it', (_name, value) => {
    expect(() => canonicalize(value)).toThrow(CanonicalizeError)
  })
})

describe('sha256Hex', () => {
  it('matches the published test vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes bytes and text the same way', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'))
  })
})
