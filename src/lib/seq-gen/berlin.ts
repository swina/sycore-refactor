// Berlin School sequencing for the Sequencer's Generate (Tangerine Dream, Klaus Schulze, early
// Jarre-era analogue sequencers): every step plays (a running 1/16 line), short notes, a low
// pedal on the root alternating with a small moving figure an octave up, the cell repeated
// until the end of the pattern. A cell of 3, 5, 6 or 7 steps over a 16-step pattern doesn't
// divide it: its accent moves against the bar on every repeat (the "phasing" of the style).
//
// Cells are written in scale degrees (0 = root, 7 = octave in a 7-note scale): they stay in the
// key with any scale, and following the Chord Prog moves the whole line onto each chord as it
// plays (as the Sequencer does for every style).

export interface BerlinOptions {
  /** pattern length in steps */
  steps: number
  keyPc: number
  scale: readonly number[]
  /** the lowest octave (MIDI octave number, C4 = 60 → 4): the pedal's */
  octMin: number
  rng?: () => number
}

export interface BerlinStep {
  note: number
  /** the root pedal (played a little softer) */
  pedal: boolean
  /** first note of a cell repeat */
  cellStart: boolean
}

/** The cells, in scale degrees of a 7-note scale (rescaled for others). Pedal = degree 0. */
export const BERLIN_CELLS: readonly (readonly number[])[] = [
  [0, 7, 0, 4, 0, 9, 0, 4],      // pedal under octave, 5th, 3rd above
  [0, 7, 4, 7, 2, 7, 4, 7],      // root, then a line under a top octave pedal
  [0, 0, 7, 0, 0, 5, 0, 4],      // double pedal, the figure falling
  [0, 7, 6, 7, 4, 7, 2, 7],      // inner line falling under the octave
  [0, 4, 7],                     // 3 against 16: the classic phasing triad
  [0, 7, 4, 9, 7],               // 5 steps
  [0, 2, 4, 7, 4, 2],            // 6 steps, up and down
  [0, 7, 0, 4, 7, 9, 4],         // 7 steps
]

/** A degree of a 7-note scale mapped onto a scale of `len` notes (the octave stays the octave). */
function rescale(d: number, len: number): number {
  if (len === 7) return d
  const oct = Math.floor(d / 7)
  return oct * len + Math.round(((d % 7) * len) / 7)
}

/** The note of scale degree `d` (may pass the octave) from the root of octave `oct`. */
export function degreeNote(d: number, keyPc: number, scale: readonly number[], oct: number): number {
  const len = scale.length || 7
  const o = Math.floor(d / len)
  const i = ((d % len) + len) % len
  return (oct + 1) * 12 + keyPc + o * 12 + (scale[i] ?? 0)
}

/** A Berlin School line: one note per step, every step. */
export function berlinLine(opts: BerlinOptions): BerlinStep[] {
  const rng = opts.rng ?? Math.random
  const len = opts.scale.length || 7
  const cell = BERLIN_CELLS[Math.floor(rng() * BERLIN_CELLS.length)].map(d => rescale(d, len))
  // the pedal octave: low enough for the figure (up to an octave + a 3rd) to stay within MIDI
  const oct = Math.max(0, Math.min(7, opts.octMin))
  const out: BerlinStep[] = []
  for (let i = 0; i < opts.steps; i++) {
    const k = i % cell.length
    const d = cell[k]
    const note = Math.max(0, Math.min(127, degreeNote(d, opts.keyPc, opts.scale, oct)))
    out.push({ note, pedal: d === 0, cellStart: k === 0 })
  }
  return out
}

/**
 * The style's filter move for P1: 0 at the pattern's start, 1 in its middle, back to 0 at its end (a
 * triangle) — used in place of RND%'s random share, so P1 opens (RND% +) or closes (RND% −) across the
 * pattern and comes back for the loop.
 */
export function sweepShape(i: number, steps: number): number {
  if (steps < 2) return 0
  const t = i / steps
  return t <= 0.5 ? t * 2 : (1 - t) * 2
}
