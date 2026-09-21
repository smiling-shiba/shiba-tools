import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { expandGlob } from '../src/glob.ts'

const toyPack = fileURLToPath(new URL('./fixtures/toy-pack', import.meta.url))

describe('expandGlob', () => {
  it('matches nested files and returns them sorted', () => {
    expect(expandGlob(toyPack, 'templates/**/*.yml')).toEqual([
      'templates/collections/starter-set.yml',
      'templates/entities/crate.yml',
      'templates/entities/lamp.yml',
    ])
  })

  it('does not match other extensions', () => {
    expect(expandGlob(toyPack, 'templates/**/*.json')).toEqual([])
  })

  it('matches a single directory level with *', () => {
    expect(expandGlob(toyPack, 'templates/entities/*.yml')).toEqual([
      'templates/entities/crate.yml',
      'templates/entities/lamp.yml',
    ])
  })

  it('returns nothing for a directory that does not exist', () => {
    expect(expandGlob(toyPack, 'missing/**/*.yml')).toEqual([])
  })
})
