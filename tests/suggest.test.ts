import { describe, expect, it } from 'vitest'
import { closest, didYouMean, levenshtein } from '../src/suggest.ts'

describe('levenshtein', () => {
  it('counts single-character edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
    expect(levenshtein('', 'abc')).toBe(3)
  })
})

describe('closest', () => {
  it('finds the plausible typo target', () => {
    expect(closest('set_valeu', ['add_tag', 'set_value', 'emit'])).toBe('set_value')
  })

  it('offers nothing when no candidate is close', () => {
    expect(closest('zzzzzz', ['set_value', 'add_tag'])).toBeUndefined()
  })

  it('prefers the alphabetically first of equally close candidates', () => {
    expect(closest('ab', ['ac', 'aa'])).toBe('aa')
  })

  it('never suggests something for an empty list', () => {
    expect(closest('anything', [])).toBeUndefined()
  })
})

describe('didYouMean', () => {
  it('formats the suggestion', () => {
    expect(didYouMean('creatd', ['created', 'updated'])).toBe('Did you mean "created"?')
  })

  it('returns nothing when there is no match', () => {
    expect(didYouMean('nothing-alike', ['created'])).toBeUndefined()
  })
})
