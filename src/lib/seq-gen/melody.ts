// Melodic lines for the Sequencer's Generate (plan: docs/plans/sequencer-generation.md, phase 3).
// A walk on the scale's degrees with Huron's regularities (Sweet Anticipation, 2006): mostly steps,
// leaps rare and followed by a step back the other way, a pull toward the middle of the range, the
// tonic triad (1-3-5) on the strong steps, the phrase ending on the tonic. A motif: the first block
// (half a bar at 16 steps, a bar at 32+) is repeated, the last block varied (A A′, A A′ A A″).
//
// The triad is the tonic's: following the Chord Prog (phase 1) moves it onto each chord's tones as it
// plays, so Generate doesn't bake the progression in (it would be moved twice).

import { metricWeights } from './rhythm'

export type MelodyMode = 'line' | 'classic'
export const MELODY_MODES: MelodyMode[] = ['line', 'classic']

export interface LineOptions {
  /** pattern length in steps */
  steps: number
  /** the steps that play */
  onsets: Set<number> | number[]
  keyPc: number
  scale: readonly number[]
  /** the range: octaves (MIDI octave numbers, C4 = 60 → 4) */
  octMin: number
  octMax: number
  /** motif block length (steps); 0 / ≥ steps: no repetition */
  motifLen?: number
  rng?: () => number
}

/** The motif's length for a pattern: half a bar at 16 steps, a bar from 32, the whole under 16. */
export function motifLength(steps: number): number {
  if (steps >= 32) return 16
  if (steps >= 16) return 8
  return steps
}

/** The block's onsets repeated over the pattern (motif rhythm). */
export function repeatOnsets(block: Set<number>, blockLen: number, steps: number): Set<number> {
  const out = new Set<number>()
  for (let start = 0; start < steps; start += blockLen) for (const i of block) if (start + i < steps) out.add(start + i)
  return out
}

/** Pitch classes above the tonic of the tonic triad in this scale: 0, the third (3 / 4), the fifth (7 / nearest). */
function triadDegrees(scale: readonly number[]): Set<number> {
  const near = (target: number) => {
    let best = 0
    for (let i = 0; i < scale.length; i++) if (Math.abs(scale[i] - target) < Math.abs(scale[best] - target)) best = i
    return best
  }
  const third = scale.includes(3) ? scale.indexOf(3) : scale.includes(4) ? scale.indexOf(4) : near(4)
  return new Set([0, third, near(7)])
}

const pick = <T>(items: T[], weights: number[], rng: () => number): T => {
  let total = 0
  for (const w of weights) total += w
  let r = rng() * total
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i] }
  return items[items.length - 1]
}

/**
 * The line: step → MIDI note, for every onset. Works on degree indices across the range (degree d →
 * keyPc + octave + scale[d mod len]); bass ranges (top octave ≤ 3) prefer the root and allow octave jumps.
 */
export function melodyLine(o: LineOptions): Map<number, number> {
  const rng = o.rng ?? Math.random
  const scale = o.scale.length ? o.scale : [0, 2, 4, 5, 7, 9, 11]
  const len = scale.length
  const lo = Math.max(0, Math.min(8, Math.min(o.octMin, o.octMax)))
  const hi = Math.max(lo, Math.min(8, Math.max(o.octMin, o.octMax)))
  const base = (lo + 1) * 12 + o.keyPc
  const span = (hi - lo + 1) * len + 1                       // degrees available, up to the tonic above
  const midi = (d: number) => base + Math.floor(d / len) * 12 + scale[d % len]
  const center = (span - 1) / 2
  const bass = hi <= 3
  const triad = triadDegrees(scale)
  const weights = metricWeights(o.steps)
  const motif = o.motifLen && o.motifLen < o.steps ? o.motifLen : o.steps
  const all = [...o.onsets].filter(i => i >= 0 && i < o.steps).sort((a, b) => a - b)
  const out = new Map<number, number>()

  // the phrase starts near the tonic of its register
  const home = bass ? 0 : Math.round(center / len) * len
  // one walk over a list of steps, from degree `from` (the last one played; null: the phrase's start);
  // `end`: close on the tonic
  const walk = (stepsIn: number[], from: number | null, lastLeap: number, end: boolean) => {
    let prev = from
    let leap = lastLeap
    stepsIn.forEach((st, k) => {
      const strong = weights[st] >= 3
      const last = end && k === stepsIn.length - 1
      const cands: number[] = []
      const ws: number[] = []
      for (let d = 0; d < span; d++) {
        let w = 1
        if (prev !== null) {
          const iv = d - prev
          const a = Math.abs(iv)
          if (bass && a === len) w *= 0.5                     // the bass's octave jump
          else if (a > 7) continue
          else w *= a === 0 ? (bass ? 0.6 : 0.3) : a === 1 ? 1 : a === 2 ? 0.7 : a === 3 ? 0.3 : a === 4 ? 0.2 : 0.08
          // after a leap: back the other way, by step (gap fill)
          if (Math.abs(leap) >= 3 && a > 0) w *= Math.sign(iv) === -Math.sign(leap) ? (a <= 2 ? 3 : 1.5) : 0.3
        } else {
          w *= Math.exp(-Math.pow((d - home) / 2, 2))
        }
        // pull toward the middle of the range (bass: toward the low root)
        const c = bass ? Math.min(center, len / 2) : center
        w *= Math.exp(-Math.pow((d - c) / Math.max(2, span / 2), 2))
        const deg = d % len
        if (strong) w *= triad.has(deg) ? (bass && deg === 0 ? 5 : 3) : 0.4
        if (last) w *= deg === 0 ? 15 : triad.has(deg) ? 1.5 : 0.1
        cands.push(d)
        ws.push(w)
      }
      if (!cands.length) return
      const d = pick(cands, ws, rng)
      if (prev !== null) leap = d - prev
      prev = d
      out.set(st, midi(d))
    })
    return { prev, leap }
  }

  // the motif's block, then its copies; the last block varied (its last notes walked again, ending on the tonic)
  walk(all.filter(i => i < motif), null, 0, motif >= o.steps)
  const blocks = Math.ceil(o.steps / motif)
  for (let b = 1; b < blocks; b++) {
    const off = b * motif
    const here = all.filter(i => i >= off && i < off + motif)
    for (const st of here) {
      const src = st - off
      if (out.has(src)) out.set(st, out.get(src)!)
    }
    // A′ (every other block and the last): the last 1–2 notes again, the last block closing on the tonic
    const varied = b === blocks - 1 || b % 2 === 1
    if (varied && here.length) {
      const n = Math.min(here.length, here.length > 3 ? 2 : 1)
      const keep = here.slice(0, here.length - n)
      const prevNote = keep.length ? out.get(keep[keep.length - 1]) : undefined
      const prevDeg = prevNote === undefined ? null : degreeOf(prevNote, base, scale)
      walk(here.slice(here.length - n), prevDeg, 0, b === blocks - 1)
    }
  }
  return out
}

/** The degree index (in melodyLine's numbering) of a note of the scale. */
function degreeOf(note: number, base: number, scale: readonly number[]): number {
  const rel = note - base
  const oct = Math.floor(rel / 12)
  const pc = ((rel % 12) + 12) % 12
  let d = 0
  for (let i = 0; i < scale.length; i++) if (scale[i] <= pc) d = i
  return oct * scale.length + d
}
