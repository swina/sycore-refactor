// Move a Chord Prog step to another position (drag & drop, or the step
// detail's ◀ ▶): the step is taken out and inserted at `to`, the ones in
// between shift by one. `limit` = steps in use (numSteps): a move never
// lands past them. Returns a new array, or null when nothing moves.
export function moveStepInList<T>(steps: T[], from: number, to: number, limit = steps.length): T[] | null {
  const n = Math.min(limit, steps.length)
  if (from < 0 || from >= n) return null
  const dest = Math.max(0, Math.min(n - 1, to))
  if (dest === from) return null
  const out = steps.slice()
  const [item] = out.splice(from, 1)
  out.splice(dest, 0, item)
  return out
}
