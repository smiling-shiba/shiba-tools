import { createHash } from 'node:crypto'

export class CanonicalizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanonicalizeError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Canonical JSON (RFC 8785): object keys sorted, no whitespace, numbers and strings
 * written the way JSON.stringify writes them. The same data always gives the same
 * text, whatever formatting or comments it came from. Throws for values JSON cannot
 * hold, such as NaN, Infinity, dates and functions.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalizeError(`Cannot hash the number ${String(value)}`)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((item: unknown) => canonicalize(item)).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  }
  throw new CanonicalizeError(`Cannot hash a value of type ${typeof value === 'object' ? 'object (not plain data)' : typeof value}`)
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}
