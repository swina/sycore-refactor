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

// ── The key of a progression, from its chords (the Sequencer's Gen "Key: CP") ──────────────────

export interface KeyChord { chordName?: string | null; notes?: readonly number[]; transpose?: number }
export interface DetectedKey { root: number; mode: 'major' | 'minor'; label: string }

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const MAJOR_SET = new Set([0, 2, 4, 5, 7, 9, 11])
// natural minor plus the raised 7th (the harmonic minor's major V)
const MINOR_SET = new Set([0, 2, 3, 5, 7, 8, 10, 11])
const m12 = (n: number) => ((n % 12) + 12) % 12

function rootOf(c: KeyChord): number | null {
  const m = /^\s*([A-Ga-g])([#♯b♭]?)/.exec(String(c.chordName ?? ''))
  if (m) {
    let pc = LETTER_PC[m[1].toUpperCase()]
    if (m[2] === '#' || m[2] === '♯') pc += 1
    else if (m[2] === 'b' || m[2] === '♭') pc -= 1
    return m12(pc + (c.transpose ?? 0))
  }
  return c.notes?.length ? m12(Math.min(...c.notes) + (c.transpose ?? 0)) : null
}

/**
 * The key (tonic + major / minor) the chords sit in best: each key of 24 scores its chords' notes in
 * its scale (+1) or not (−2: an outside note weighs), the roots on its degrees, the tonic chord — of the key's quality — and a
 * progression starting / ending on it. `hint` (the Chord Prog's own key file and mode) tips a close call.
 * null when there are no chords.
 */
export function detectKey(chords: readonly KeyChord[], hint?: { selectedKey: number; keyMode: KeyMode }): DetectedKey | null {
  const parsed = chords
    .map(c => {
      const root = rootOf(c)
      const pcs = new Set((c.notes ?? []).map(n => m12(n + (c.transpose ?? 0))))
      if (root !== null) pcs.add(root)
      return root === null ? null : { root, pcs }
    })
    .filter((c): c is { root: number; pcs: Set<number> } => c !== null)
  if (!parsed.length) return null
  const hintRoot = hint && hint.keyMode ? keyRoot(hint.selectedKey, hint.keyMode) : null
  let best: (DetectedKey & { score: number }) | null = null
  for (const mode of ['major', 'minor'] as const) {
    const set = mode === 'major' ? MAJOR_SET : MINOR_SET
    for (let tonic = 0; tonic < 12; tonic++) {
      let score = 0
      parsed.forEach((c, i) => {
        for (const pc of c.pcs) score += set.has(m12(pc - tonic)) ? 1 : -2
        if (set.has(m12(c.root - tonic))) score += 1
        if (c.root === tonic) {
          const third = c.pcs.has(m12(tonic + (mode === 'major' ? 4 : 3)))
          score += third ? 2 : 1
          if (i === 0) score += 2
          if (i === parsed.length - 1) score += 1.5
        }
      })
      if (hint && hint.selectedKey >= 0 && hint.selectedKey < 12) {
        if (hintRoot === tonic && hint.keyMode === mode) score += 1.5
        else if (!hint.keyMode && keyFile(tonic, mode) === hint.selectedKey) score += 0.75
      }
      if (!best || score > best.score) best = { root: tonic, mode, score, label: NOTE_NAMES[tonic] + (mode === 'minor' ? 'm' : '') }
    }
  }
  return best ? { root: best.root, mode: best.mode, label: best.label } : null
}

// ── The mode of a progression, from its chords (Modal Chords, genre files, "Both") ─────────────

/** The scales a mode can be detected as — named as the Sequencer's SCALES. */
export const MODE_SCALES: Record<string, readonly number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'Harmonic Min': [0, 2, 3, 5, 7, 8, 11],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
}
// a tie (a degree no chord touches: Minor ↔ Dorian without the 6th) goes to the plainer scale
const MODE_BIAS: Record<string, number> = { Major: 0.3, Minor: 0.3, Dorian: 0.15, Mixolydian: 0.15, 'Harmonic Min': 0.05, Phrygian: 0.05, Lydian: 0.05, Locrian: 0 }

export interface DetectedScale { root: number; scale: string; mode: 'major' | 'minor'; label: string }

/**
 * The tonic and mode (Major, Minor, Dorian, Phrygian, Lydian, Mixolydian, Harmonic Min, Locrian) the
 * chords sit in best — scored as detectKey: notes in the scale +1 / outside −2, roots on its degrees,
 * the tonic chord, a progression starting / ending on it. `tonic` (Modal Chords' Root) is the tonic
 * when given. null when there are no chords.
 */
export function detectScale(chords: readonly KeyChord[], tonic: number | null = null): DetectedScale | null {
  const parsed = chords
    .map(c => {
      const root = rootOf(c)
      const pcs = new Set((c.notes ?? []).map(n => m12(n + (c.transpose ?? 0))))
      if (root !== null) pcs.add(root)
      return root === null ? null : { root, pcs }
    })
    .filter((c): c is { root: number; pcs: Set<number> } => c !== null)
  if (!parsed.length) return null
  let best: (DetectedScale & { score: number }) | null = null
  const tonics = tonic !== null ? [m12(tonic)] : [...Array(12).keys()]
  for (const [scale, iv] of Object.entries(MODE_SCALES)) {
    const set = new Set(iv)
    for (const t of tonics) {
      let score = MODE_BIAS[scale] ?? 0
      parsed.forEach((c, i) => {
        for (const pc of c.pcs) score += set.has(m12(pc - t)) ? 1 : -2
        if (set.has(m12(c.root - t))) score += 1
        if (c.root === t) {
          score += 2
          if (i === 0) score += 2
          if (i === parsed.length - 1) score += 1.5
        }
      })
      if (!best || score > best.score) {
        const mode = set.has(3) ? 'minor' : 'major'
        best = { root: t, scale, mode, score, label: `${NOTE_NAMES[t]} ${scale}` }
      }
    }
  }
  return best ? { root: best.root, scale: best.scale, mode: best.mode, label: best.label } : null
}

// ── The progression's key, as the Sequencer uses it (Key: CP, the Rig's GEN, AUTO SEQ) ────────

/** The library index of Modal Chords (useProgressionLoader's KEY_FILE_NAMES). */
export const MODAL_KEY_INDEX = 12

export interface ProgressionKey {
  root: number
  mode: 'major' | 'minor'
  /** a mode detected (Dorian, Mixolydian…): the Sequencer takes exactly that scale; null = an exact
   *  Major / Minor key (the Sequencer keeps a scale of the same family, e.g. Pentatonic Min) */
  scale: string | null
  label: string
}

/**
 * The key the Chord Prog's chords sit in: with an exact key (Major / Minor on a key file) detectKey,
 * hinted by it; otherwise (Modal Chords, a genre file, Both) the mode too (detectScale, Modal Chords'
 * Root as the tonic when set). null without chords.
 */
export function progressionKey(chords: readonly KeyChord[], o: { selectedKey: number; keyMode: KeyMode; modalRoot?: number | null }): ProgressionKey | null {
  if (o.keyMode && keyRoot(o.selectedKey, o.keyMode) !== null) {
    const k = detectKey(chords, { selectedKey: o.selectedKey, keyMode: o.keyMode })
    return k ? { root: k.root, mode: k.mode, scale: null, label: k.label } : null
  }
  const s = detectScale(chords, o.selectedKey === MODAL_KEY_INDEX ? o.modalRoot ?? null : null)
  return s ? { root: s.root, mode: s.mode, scale: s.scale, label: s.label } : null
}

/** The detail of a Sequencer generate event for that key ({ root, mode } or { root, scale }). */
export const progressionKeyDetail = (k: ProgressionKey) => (k.scale ? { root: k.root, scale: k.scale } : { root: k.root, mode: k.mode })
