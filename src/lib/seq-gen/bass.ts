// Bass lines for the Sequencer's Generate (the Bass lane's styles; any lane can use them): written
// in scale degrees from the key's root, chord tones (root, 5th, octave, 3rd) on the strong steps,
// so following the Chord Prog moves the line onto each chord's root as it plays.
//
// - Root-5-Oct: root on the beats, the 5th and the octave between — the dance-music workhorse.
// - Offbeat: the house / trance bass on every "and" (steps 2, 6, 10, 14), short; the octave now and then.
// - Acid Slide: a busy 1/16 line on root / octave / 3rd / 5th / 7th, accents and slides (ties).
// - Walking: a quarter-note walk — root on the 1, chord tones, an approach note into the next bar.
//
// The patterns are written on a 16-step bar and repeated over longer patterns (8 steps: half a bar).
import { degreeNote } from './berlin'

export const BASS_STYLES = ['Root-5-Oct', 'Offbeat', 'Acid Slide', 'Walking'] as const
export type BassStyle = typeof BASS_STYLES[number]

export interface BassOptions {
  style: BassStyle
  steps: number
  keyPc: number
  scale: readonly number[]
  /** the root's octave (MIDI octave number: C2 = 36 → 2) */
  oct: number
  rng?: () => number
}

export interface BassStep {
  active: boolean
  note: number
  velocity: number
  /** % of the step */
  gate: number
  /** slide into the next step (a tie) */
  tie: boolean
  accent: boolean
}

/** Scale degrees of the chord tones in a scale of any length: 3rd, 5th, 7th (nearest present). */
function chordDegrees(scale: readonly number[]) {
  const idx = (semis: number[], fallback: number) => {
    for (const s of semis) { const i = scale.indexOf(s); if (i >= 0) return i }
    return Math.min(fallback, scale.length - 1)
  }
  return { third: idx([3, 4], 2), fifth: idx([7, 6, 8], 4), seventh: idx([10, 11], 6), len: scale.length || 7 }
}

// A bar's template: per step, a degree token or null (rest). R root, F 5th, O octave, T 3rd, S 7th,
// L the 5th below (the low 5th), A approach (filled in by the walk).
type Tok = 'R' | 'F' | 'O' | 'T' | 'S' | 'L' | null
const _ = null
const TEMPLATES: Record<Exclude<BassStyle, 'Walking' | 'Acid Slide'>, Tok[][]> = {
  'Root-5-Oct': [
    ['R', _, _, 'O', _, _, 'R', _, 'F', _, _, 'O', _, _, 'R', _],
    ['R', _, 'R', _, 'F', _, 'O', _, 'R', _, 'R', _, 'F', _, 'O', _],
    ['R', _, _, 'R', _, _, 'F', _, 'R', _, _, 'O', _, 'F', _, _],
    ['R', _, 'O', _, 'R', _, 'F', _, 'R', _, 'O', _, 'L', _, 'F', _],
  ],
  Offbeat: [
    [_, _, 'R', _, _, _, 'R', _, _, _, 'R', _, _, _, 'R', _],
    [_, _, 'R', _, _, _, 'R', _, _, _, 'R', _, _, _, 'O', _],
    [_, _, 'R', 'R', _, _, 'R', _, _, _, 'R', 'R', _, _, 'F', _],
  ],
}

export function bassLine(opts: BassOptions): BassStep[] {
  const rng = opts.rng ?? Math.random
  const { third, fifth, seventh, len } = chordDegrees(opts.scale)
  const oct = Math.max(0, Math.min(7, opts.oct))
  const deg: Record<Exclude<Tok, null>, number> = { R: 0, F: fifth, O: len, T: third, S: seventh, L: fifth - len }
  const noteOf = (d: number) => Math.max(0, Math.min(127, degreeNote(d, opts.keyPc, opts.scale, oct)))
  const vel = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  const rest = (): BassStep => ({ active: false, note: noteOf(0), velocity: 0, gate: 0, tie: false, accent: false })
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)]

  if (opts.style === 'Walking') {
    // quarter notes: 1 root, 2–3 chord tones, 4 an approach into the next bar's root (a step above / below)
    const bar = (): BassStep[] => {
      const out = Array.from({ length: 16 }, rest)
      const line = [0, pick([third, fifth, len]), pick([fifth, third, seventh]), pick([1, -1, fifth + 1])]
      line.forEach((d, q) => { out[q * 4] = { active: true, note: noteOf(d), velocity: vel(q === 0 ? 100 : 84, q === 0 ? 112 : 98), gate: 85, tie: false, accent: q === 0 } })
      return out
    }
    return tile(opts.steps, bar)
  }

  if (opts.style === 'Acid Slide') {
    const pool = [0, 0, 0, len, len, third, fifth, seventh]
    const bar = (): BassStep[] => Array.from({ length: 16 }, (_x, i) => {
      // the downbeats always play; the rest ~70 %
      if (i % 4 !== 0 && rng() > 0.7) return rest()
      const d = i === 0 ? 0 : pick(pool)
      const accent = i % 4 === 0 ? rng() < 0.5 : rng() < 0.2
      return { active: true, note: noteOf(d), velocity: accent ? vel(112, 127) : vel(78, 96), gate: 55, tie: rng() < 0.25, accent }
    })
    const out = tile(opts.steps, bar)
    // a slide needs a note after it
    out.forEach((s, i) => { if (s.tie && !out[(i + 1) % out.length]?.active) s.tie = false })
    return out
  }

  const tpl = pick(TEMPLATES[opts.style])
  const offbeat = opts.style === 'Offbeat'
  const bar = (): BassStep[] => tpl.map((t, i) => t === null
    ? rest()
    : { active: true, note: noteOf(deg[t]), velocity: i % 4 === 0 ? vel(104, 116) : vel(90, 104), gate: offbeat ? 40 : 60, tie: false, accent: !offbeat && i === 0 })
  return tile(opts.steps, bar)
}

/** `steps` steps from 16-step bars (a new bar each time, the first one's shape kept by the templates). */
function tile(steps: number, bar: () => BassStep[]): BassStep[] {
  const out: BassStep[] = []
  while (out.length < steps) out.push(...bar())
  return out.slice(0, steps)
}
