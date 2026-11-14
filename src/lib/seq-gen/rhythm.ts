// Rhythm for the Sequencer's Generate (plan: docs/plans/sequencer-generation.md, phase 2): which steps
// play. Weighted — strong steps first (metric weights, Longuet-Higgins & Lee), the style's accent grid
// adds weight, Sync moves weight to the weak steps (most groove around the middle: Witek 2014) —,
// Euclid (Bjorklund: k onsets as even as possible over n, Toussaint 2005), or Random (as before).

export type RhythmMode = 'weighted' | 'euclid' | 'random'
export const RHYTHM_MODES: RhythmMode[] = ['weighted', 'euclid', 'random']

/**
 * Metric weight of each step, 16 steps a bar (1/16): the bar's 1 = 5, half bar = 4, beats = 3,
 * 8ths = 2, 16ths = 1. Longer patterns repeat the bar.
 */
export function metricWeights(steps: number, perBar = 16): number[] {
  return Array.from({ length: steps }, (_, i) => {
    const p = i % perBar
    if (p === 0) return 5
    if (p % (perBar / 2) === 0) return 4
    if (p % (perBar / 4) === 0) return 3
    if (p % (perBar / 8) === 0) return 2
    return 1
  })
}

/** Bjorklund: `pulses` onsets spread as evenly as possible over `steps` (1 = onset), from step 0. */
export function euclid(steps: number, pulses: number): number[] {
  const s = Math.max(1, Math.min(64, Math.round(steps)))
  const p = Math.max(0, Math.min(s, Math.round(pulses)))
  // no pulses / all pulses: nothing to spread (the loop below would never end on 0 pulses)
  if (p === 0 || p === s) return Array(s).fill(p === s ? 1 : 0)
  let first: number[][] = Array.from({ length: p }, () => [1])
  let second: number[][] = Array.from({ length: s - p }, () => [0])
  while (second.length > 1) {
    const merged: number[][] = []
    const minLen = Math.min(first.length, second.length)
    for (let i = 0; i < minLen; i++) merged.push([...first[i], ...second[i]])
    if (first.length > minLen) { second = first.slice(minLen); first = merged }
    else if (second.length > minLen) { second = second.slice(minLen); first = merged }
    else { first = merged; second = [] }
  }
  return [...first.flat(), ...second.flat()]
}

/** The pattern turned left by `offset` steps (negative: right). */
export function rotate<T>(pattern: T[], offset: number): T[] {
  const len = pattern.length
  if (!len) return pattern
  const r = ((Math.round(offset) % len) + len) % len
  return [...pattern.slice(r), ...pattern.slice(0, r)]
}

const SHARPNESS = 1.6

export interface OnsetOptions {
  /** the style's accent grid (repeated over the steps): its steps weigh more */
  styleGrid?: readonly boolean[] | null
  /** 0–100: 0 = strong steps only first, 100 = weak steps first */
  sync?: number
  rng?: () => number
}

/**
 * `count` steps out of `steps`, chosen at random with their weight: metric weight + 2 on the style's
 * accents, mixed toward its inverse by Sync, then exponential (at Sync 0 the strong steps win clearly;
 * toward the middle the weights flatten and the rhythm varies more).
 * The bar's 1 comes first when Sync is under 50 and at least a quarter of the steps play.
 */
export function pickOnsets(steps: number, count: number, opts: OnsetOptions = {}): Set<number> {
  const rng = opts.rng ?? Math.random
  const n = Math.max(0, Math.round(steps))
  const k = Math.max(0, Math.min(n, Math.round(count)))
  const out = new Set<number>()
  if (!k) return out
  const s = Math.max(0, Math.min(100, opts.sync ?? 30)) / 100
  const metric = metricWeights(n)
  const grid = opts.styleGrid && opts.styleGrid.length ? opts.styleGrid : null
  const raw = metric.map((m, i) => m + (grid && grid[i % grid.length] ? 2 : 0))
  const max = Math.max(...raw), min = Math.min(...raw)
  const w = raw.map(v => {
    const mixed = (1 - s) * v + s * (max + min - v)
    return Math.exp(SHARPNESS * mixed)
  })
  if (s < 0.5 && k >= Math.ceil(n / 4)) out.add(0)
  while (out.size < k) {
    let total = 0
    for (let i = 0; i < n; i++) if (!out.has(i)) total += w[i]
    let r = rng() * total
    let pick = -1
    for (let i = 0; i < n; i++) {
      if (out.has(i)) continue
      pick = i
      r -= w[i]
      if (r <= 0) break
    }
    out.add(pick)
  }
  return out
}

/** Euclid's onsets as a set: `pulses` over `steps`, turned by `rotation`. */
export function euclidOnsets(steps: number, pulses: number, rotation = 0): Set<number> {
  const out = new Set<number>()
  rotate(euclid(steps, pulses), rotation).forEach((v, i) => { if (v) out.add(i) })
  return out
}

/** Random (as before): `count` steps, every step as likely. */
export function randomOnsets(steps: number, count: number, rng: () => number = Math.random): Set<number> {
  const idx = Array.from({ length: Math.max(0, Math.round(steps)) }, (_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return new Set(idx.slice(0, Math.max(0, Math.min(idx.length, Math.round(count)))))
}

/** A seeded RNG (mulberry32) — tests, and a Generate that can be repeated. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
