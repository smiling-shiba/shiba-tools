/** Edit distance between two strings (insert, delete, substitute each cost 1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution)
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/** The candidate closest to `input`, if it is close enough to be a plausible typo. */
export function closest(input: string, candidates: Iterable<string>): string | undefined {
  const maxDistance = Math.max(2, Math.floor(input.length / 3))
  let best: string | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const distance = levenshtein(input, candidate)
    const closer = distance < bestDistance || (distance === bestDistance && best !== undefined && candidate < best)
    if (closer && distance <= maxDistance && distance < input.length) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

export function didYouMean(input: string, candidates: Iterable<string>): string | undefined {
  const match = closest(input, candidates)
  return match === undefined ? undefined : `Did you mean "${match}"?`
}
