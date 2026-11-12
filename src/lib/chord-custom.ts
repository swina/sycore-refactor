/**
 * chord-custom.ts — Chord Prog chords that aren't a chord symbol (captured / custom notes):
 * named by their notes ("G3G4", lowest first; C4 = MIDI 60, as noteLabel) instead of "Custom",
 * and the bass the Chord Prog plays for each step:
 *   - a recognised chord symbol (Ebm, DbM, Bb, Cm7, F#m7b5, C/E…): its root in octave 2 (C2 = 36);
 *   - anything else (custom notes, a typed name, MIDI-imported pitch-class names): the lowest note,
 *     an octave down (G3G4 → G2).
 */
import { noteLabel } from '@/lib/chord-detector'

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "G3G4": the notes, lowest first, each once. */
export function customChordName(notes: number[]): string {
  return [...new Set(notes)].sort((a, b) => a - b).map(noteLabel).join('')
}

/** A chord symbol's root (pitch class 0–11), null when the name isn't a chord symbol. */
export function chordSymbolRoot(name: string | undefined | null): number | null {
  const s = (name ?? '').trim()
  // root, then only chord-quality marks (no other note letters: "CEG", "G3G4" are not symbols)
  const m = /^([A-G])([#♯b♭]?)((?:maj|min|dim|aug|sus|add|m|M|°|ø|\+|-|\d|[#♯b♭]|\(|\)|,)*)(?:\/[A-G][#♯b♭]?)?$/.exec(s)
  if (!m) return null
  let pc = LETTER_PC[m[1]]
  if (m[2] === '#' || m[2] === '♯') pc += 1
  if (m[2] === 'b' || m[2] === '♭') pc -= 1
  return ((pc % 12) + 12) % 12
}

/** The step's chord as shown: a "Custom" one by its notes. */
export function chordDisplayName(st: { chordName?: string; notes?: number[] }): string {
  return st.chordName === 'Custom' && st.notes?.length ? customChordName(st.notes) : st.chordName ?? ''
}

/** A step loaded / assigned: "Custom" renamed by its notes. */
export function normalizeCustomStep<T extends { chordName?: string; notes?: number[] }>(st: T): T {
  return st.chordName === 'Custom' && st.notes?.length ? { ...st, chordName: customChordName(st.notes) } : st
}

const BASS_OCTAVE_2 = 36 // C2 (C4 = 60)

/** The Chord Prog's bass note for a step (before the step's / global transpose `shift`). */
export function chordBassNote(st: { chordName?: string; notes?: number[] }, shift = 0): number | null {
  if (!st.notes?.length) return null
  const root = chordSymbolRoot(st.chordName)
  const n = root !== null ? BASS_OCTAVE_2 + root : Math.min(...st.notes) - 12
  return Math.max(0, Math.min(127, n + shift))
}
