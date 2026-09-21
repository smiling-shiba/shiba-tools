import { readdirSync } from 'node:fs'
import { join } from 'node:path'

function globToRegExp(pattern: string): RegExp {
  let source = ''
  let index = 0
  while (index < pattern.length) {
    if (pattern.startsWith('**/', index)) {
      source += '(?:.*/)?'
      index += 3
    } else if (pattern.startsWith('**', index)) {
      source += '.*'
      index += 2
    } else if (pattern.charAt(index) === '*') {
      source += '[^/]*'
      index += 1
    } else {
      source += pattern.charAt(index).replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      index += 1
    }
  }
  return new RegExp(`^${source}$`)
}

function walk(directory: string, prefix: string, found: string[]): void {
  let entries
  try {
    entries = readdirSync(join(directory, prefix), { withFileTypes: true })
  } catch {
    return // a missing directory simply matches nothing
  }
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) walk(directory, relative, found)
    else found.push(relative)
  }
}

/**
 * Lists files under `root` whose forward-slash relative path matches `pattern`
 * (supports `*` and `**`). The result is sorted so builds are deterministic.
 */
export function expandGlob(root: string, pattern: string): string[] {
  const segments = pattern.split('/')
  const staticPrefix: string[] = []
  for (const segment of segments) {
    if (segment.includes('*')) break
    staticPrefix.push(segment)
  }
  const start = staticPrefix.length === segments.length ? staticPrefix.slice(0, -1) : staticPrefix
  const found: string[] = []
  walk(root, start.join('/'), found)
  const matcher = globToRegExp(pattern)
  return found.filter((path) => matcher.test(path)).sort()
}
