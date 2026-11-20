// The Sequencer following the chords by scale degree (plan: docs/plans/sequencer-generation.md, phase 1).
// A chord moves the pattern by the scale degrees from the key's tonic to the chord's root, inside the
// Sequencer's scale: in C major, Dm moves C-E-G to D-F-A (not D-F#-A as a chromatic shift would).

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const mod12 = (n: number) => ((n % 12) + 12) % 12

/**
 * The root (pitch class 0–11) of a chord from its name — `Cm7`, `F#`, `Bbmaj7`, `C/E` (the root, not
 * the bass), `G3G4` (a custom chord: its first note) — or, when the name says nothing, from its notes
 * (the lowest). null when neither does.
 */
export function chordRootPc(name: string | null | undefined, notes?: readonly number[]): number | null {
  const m = /^\s*([A-Ga-g])([#♯b♭]?)/.exec(String(name ?? ''))
  if (m) {
    let pc = LETTER_PC[m[1].toUpperCase()]
    if (m[2] === '#' || m[2] === '♯') pc += 1
    else if (m[2] === 'b' || m[2] === '♭') pc -= 1
    return mod12(pc)
  }
  if (notes && notes.length) return mod12(Math.min(...notes))
  return null
}

/** The scale degree (0-based) at or just below a pitch class above the tonic (0–11). */
function degreeBelow(rel: number, scale: readonly number[]): number {
  let d = 0
  for (let i = 0; i < scale.length; i++) if (scale[i] <= rel) d = i
  return d
}

/**
 * The scale degrees from the key's tonic to `rootPc`, the nearest way (up or down: in C major, Am is
 * 2 down rather than 5 up, so the line stays in its register). A root outside the scale counts as the
 * degree just below it.
 */
export function degreeShift(rootPc: number, keyPc: number, scale: readonly number[]): number {
  const len = scale.length
  if (!len) return 0
  const d = degreeBelow(mod12(rootPc - keyPc), scale)
  return d > len / 2 ? d - len : d
}

/**
 * `note` moved by `shift` degrees within the scale on `keyPc`; a note outside the scale keeps its
 * distance from the degree below it (a chromatic passing note stays one).
 */
export function transposeDiatonic(note: number, shift: number, keyPc: number, scale: readonly number[]): number {
  const len = scale.length
  if (!shift || !len) return note
  const rel = note - keyPc
  const oct = Math.floor(rel / 12)
  const pc = mod12(rel)
  const d = degreeBelow(pc, scale)
  const chroma = pc - scale[d]
  const nd = d + shift
  const octAdd = Math.floor(nd / len)
  const di = ((nd % len) + len) % len
  return keyPc + (oct + octAdd) * 12 + scale[di] + chroma
}

/** How a lane follows the Chord Prog's chords: 'scale' — by degree in its scale (above) · 'chord' — the
 *  same, then fitted onto the chord sounding (fitToChord). */
export type SeqFit = 'scale' | 'chord'
export const SEQ_FITS: readonly SeqFit[] = ['scale', 'chord']
export const seqFitOf = (v: unknown): SeqFit => (v === 'chord' ? 'chord' : 'scale')

/** The pitch classes of a chord's notes (any octave, any voicing), sorted, no repeats. */
export function chordPcs(notes: readonly number[] | null | undefined): number[] {
  return [...new Set((notes ?? []).map(mod12))].sort((a, b) => a - b)
}

/** The chord tone nearest to `note` (the lower one on a tie, so a line doesn't climb). */
function nearestChordTone(note: number, pcs: readonly number[]): number {
  let best = note
  let bestD = Infinity
  for (let d = 0; d <= 6; d++) {
    for (const cand of d ? [note - d, note + d] : [note]) {
      if (pcs.includes(mod12(cand)) && d < bestD) { best = cand; bestD = d }
    }
    if (bestD <= d) break
  }
  return best
}

/**
 * Fit a note (already moved onto the chord by degree) to the chord sounding, so a chord from outside
 * the lane's scale (a borrowed bVII, a major IV in minor…) doesn't clash with the line:
 *  - a strong step (on the beat): the nearest chord tone;
 *  - a weak step: kept, unless it's a half step above a chord tone (a b9 against it: moved down onto
 *    it) or outside the scale and not a chord tone (moved to the nearest chord tone).
 * `pcs`: the chord's pitch classes (chordPcs); empty: the note as it is.
 */
export function fitToChord(note: number, pcs: readonly number[], strong: boolean, keyPc: number, scale: readonly number[]): number {
  if (!pcs.length) return note
  const pc = mod12(note)
  if (pcs.includes(pc)) return note
  if (strong) return nearestChordTone(note, pcs)
  if (pcs.includes(mod12(pc - 1))) return note - 1
  const inScale = scale.includes(mod12(pc - keyPc))
  return inScale ? note : nearestChordTone(note, pcs)
}
