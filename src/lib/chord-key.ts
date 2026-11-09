/**
 * chord-key.ts — the Chord Prog's key as root + mode, and a diatonic generator.
 *
 * The Chord Prog library is one file per pair of relative keys (selectedKey 0–11:
 * "C Major / A min", "Db Major / Bb min", …; 12+ modal and genres). Its
 * progressions are written from the minor tonic ("A i bVIIM …"), so a minor key
 * draws from the library; a major key — with nothing major in the library — is
 * generated here from common major progressions (I–V–vi–IV, ii–V–I…).
 *
 * keyMode: 'major' | 'minor' picks a key exactly (e.g. Cm = file "Eb Major / C min"
 * in minor); null = the pair as before (any progression of the file).
 */
export type KeyMode = 'major' | 'minor' | null

export const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/** The tonic (0–11) of the key: the file's major root, or its relative minor (3 semitones below). */
export function keyRoot(selectedKey: number, mode: KeyMode): number | null {
  if (!(selectedKey >= 0 && selectedKey < 12)) return null
  return mode === 'minor' ? (selectedKey + 9) % 12 : selectedKey
}

/** The library file (selectedKey) of a tonic in a mode. */
export function keyFile(root: number, mode: KeyMode): number {
  const r = ((root % 12) + 12) % 12
  return mode === 'minor' ? (r + 3) % 12 : r
}

/** "Cm", "Bb", or the pair "Eb/Cm" (mode null); '' for modal / genre files. */
export function keyLabel(selectedKey: number, mode: KeyMode): string {
  if (!(selectedKey >= 0 && selectedKey < 12)) return ''
  const maj = NOTE_NAMES[selectedKey]
  const min = NOTE_NAMES[(selectedKey + 9) % 12] + 'm'
  return mode === 'major' ? maj : mode === 'minor' ? min : `${maj}/${min}`
}

/** For the AI prompt: "C minor", "Bb major", or "Eb major / C minor". */
export function keyPhrase(selectedKey: number, mode: KeyMode): string | null {
  if (!(selectedKey >= 0 && selectedKey < 12)) return null
  const maj = `${NOTE_NAMES[selectedKey]} major`
  const min = `${NOTE_NAMES[(selectedKey + 9) % 12]} minor`
  return mode === 'major' ? maj : mode === 'minor' ? min : `${maj} / ${min}`
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]

/** Common major progressions, as scale degrees (0 = I … 6 = vii°). */
export const MAJOR_PROGRESSIONS: number[][] = [
  [0, 4, 5, 3],    // I V vi IV
  [0, 5, 3, 4],    // I vi IV V
  [5, 3, 0, 4],    // vi IV I V
  [0, 3, 4, 3],    // I IV V IV
  [1, 4, 0, 5],    // ii V I vi
  [0, 2, 3, 4],    // I iii IV V
  [3, 0, 4, 5],    // IV I V vi
  [0, 3, 5, 4],    // I IV vi V
  [0, 1, 3, 4],    // I ii IV V
  [0, 4, 3, 4],    // I V IV V
  [0, 5, 1, 4],    // I vi ii V
  [3, 4, 2, 5],    // IV V iii vi
]

export interface GenChord { chordName: string; notes: number[] }

/** The triad on a degree of the major scale of `root`: name and voicing (three notes in 55–72 near
 *  `prev`, plus the root as bass in 36–47). */
function majorTriad(root: number, degree: number, prev: number[] | null): GenChord {
  const pcs = [0, 2, 4].map(k => (root + MAJOR_SCALE[(degree + k) % 7]) % 12)
  const third = (pcs[1] - pcs[0] + 12) % 12
  const fifth = (pcs[2] - pcs[0] + 12) % 12
  const quality = third === 4 ? '' : fifth === 6 ? 'dim' : 'm'
  const chordName = NOTE_NAMES[pcs[0]] + quality
  // Each chord tone in 55–66 (G3–F#4 for the lowest), then the inversion closest to the previous chord.
  const place = (pc: number) => 55 + ((pc - 55) % 12 + 12) % 12
  const inversions = [0, 1, 2].map(i => {
    const order = [pcs[i], pcs[(i + 1) % 3], pcs[(i + 2) % 3]]
    const low = place(order[0])
    const notes = [low]
    for (const pc of order.slice(1)) {
      let n = place(pc)
      while (n <= notes[notes.length - 1]) n += 12
      notes.push(n)
    }
    return notes
  })
  const dist = (a: number[]) => (prev ? a.reduce((s, n, i) => s + Math.abs(n - (prev[i] ?? n)), 0) : a[0] - 60 >= 0 ? a[0] - 60 : 60 - a[0])
  const voicing = inversions.reduce((best, v) => (dist(v) < dist(best) ? v : best))
  const bass = 36 + pcs[0]
  return { chordName, notes: [...voicing, bass] }
}

/** A major-key progression of `length` chords (a template, repeated), in `root`. `rnd` for tests. */
export function generateMajor(root: number, length: number, rnd: () => number = Math.random): GenChord[] {
  const tpl = MAJOR_PROGRESSIONS[Math.floor(rnd() * MAJOR_PROGRESSIONS.length)]
  const out: GenChord[] = []
  let prev: number[] | null = null
  for (let i = 0; i < length; i++) {
    const c = majorTriad(root, tpl[i % tpl.length], prev)
    prev = c.notes.slice(0, 3)
    out.push(c)
  }
  return out
}
