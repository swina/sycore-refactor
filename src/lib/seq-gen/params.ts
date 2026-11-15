// Generate's P1 / P2 per step (the two CCs a step sends): the instrument preset's value for that CC,
// moved at random by RND% (−100…+100). Positive: up to that share of the way to 127; negative: down
// to that share of the way to 0 — so a value at 0 or 127 can still vary, and the result stays in range.

export function paramValue(base: number, variation: number, rng: () => number = Math.random): number {
  const b = Math.max(0, Math.min(127, Number(base) || 0))
  const f = Math.max(-100, Math.min(100, Number(variation) || 0)) / 100
  const room = f >= 0 ? 127 - b : b
  return Math.max(0, Math.min(127, Math.round(b + room * f * rng())))
}
