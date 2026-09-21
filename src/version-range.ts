type Version = readonly [number, number, number]

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/
const COMPARATOR = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/

export function parseVersion(text: string): Version | undefined {
  const match = VERSION.exec(text)
  if (!match) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * Checks a semantic version against a space-separated list of comparators,
 * for example ">=0.1.0 <0.2.0". Every comparator must hold. Returns undefined
 * when the version or the range cannot be parsed.
 */
export function satisfies(version: string, range: string): boolean | undefined {
  const parsed = parseVersion(version)
  if (!parsed) return undefined
  const tokens = range.trim().split(/\s+/).filter((token) => token !== '')
  if (tokens.length === 0) return undefined
  let holds = true
  for (const token of tokens) {
    const match = COMPARATOR.exec(token)
    const limit = match?.[2] === undefined ? undefined : parseVersion(match[2])
    if (!match || !limit) return undefined
    const order = compare(parsed, limit)
    switch (match[1] ?? '=') {
      case '>=': holds = holds && order >= 0; break
      case '>': holds = holds && order > 0; break
      case '<=': holds = holds && order <= 0; break
      case '<': holds = holds && order < 0; break
      default: holds = holds && order === 0
    }
  }
  return holds
}
