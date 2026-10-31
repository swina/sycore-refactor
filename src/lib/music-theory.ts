// Music theory helpers for the AI Song Composer (docs/plans/ai-song-composer.md): keys and modes,
// chord symbols and roman numerals → pitch classes, voicings near a register with simple voice
// leading, scale checks, beats → Chord Prog durations. Pure functions, no stores.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** 'C', 'c#', 'Db', 'B♭' → pitch class 0..11, null if not a note name. */
export function parsePitchClass(name: string): number | null {
  const m = /^([A-Ga-g])([#♯b♭]*)$/.exec(name.trim())
  if (!m) return null
  let pc = LETTER_PC[m[1].toUpperCase()]
  for (const a of m[2]) pc += a === '#' || a === '♯' ? 1 : -1
  return ((pc % 12) + 12) % 12
}

export const MODES = {
  major:          [0, 2, 4, 5, 7, 9, 11],
  minor:          [0, 2, 3, 5, 7, 8, 10],
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  phrygian:       [0, 1, 3, 5, 7, 8, 10],
  lydian:         [0, 2, 4, 6, 7, 9, 11],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  locrian:        [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor:  [0, 2, 3, 5, 7, 8, 11],
} as const
export type ModeName = keyof typeof MODES

const MODE_ALIASES: Record<string, ModeName> = {
  major: 'major', maj: 'major', ionian: 'major',
  minor: 'minor', min: 'minor', m: 'minor', aeolian: 'minor', 'natural minor': 'minor',
  dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian',
  'harmonic minor': 'harmonicMinor', harmonicminor: 'harmonicMinor',
}

/** 'Minor', 'aeolian', 'harmonic minor' → a ModeName, null if unknown. */
export function parseMode(name: string): ModeName | null {
  return MODE_ALIASES[name.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ')] ?? null
}

/** Pitch classes of the scale of `rootPc` in `mode`, scale order from the root. */
export function scalePitchClasses(rootPc: number, mode: ModeName): number[] {
  return MODES[mode].map(i => (rootPc + i) % 12)
}

// ── Chord symbols ─────────────────────────────────────────────────────────
// Quality suffix → intervals from the root. Matched whole (after the root and before a /bass).
const CHORD_QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7], maj: [0, 4, 7], M: [0, 4, 7],
  m: [0, 3, 7], min: [0, 3, 7], '-': [0, 3, 7],
  dim: [0, 3, 6], '°': [0, 3, 6], o: [0, 3, 6],
  aug: [0, 4, 8], '+': [0, 4, 8],
  sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], 'Δ': [0, 4, 7, 11], 'Δ7': [0, 4, 7, 11],
  m7: [0, 3, 7, 10], min7: [0, 3, 7, 10], '-7': [0, 3, 7, 10],
  mMaj7: [0, 3, 7, 11], mmaj7: [0, 3, 7, 11], 'm(maj7)': [0, 3, 7, 11],
  dim7: [0, 3, 6, 9], '°7': [0, 3, 6, 9], o7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10], 'ø': [0, 3, 6, 10], 'ø7': [0, 3, 6, 10],
  aug7: [0, 4, 8, 10], '7#5': [0, 4, 8, 10], '+7': [0, 4, 8, 10],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 2, 4, 7], madd9: [0, 2, 3, 7], 'm(add9)': [0, 2, 3, 7],
  '9': [0, 2, 4, 7, 10], maj9: [0, 2, 4, 7, 11], m9: [0, 2, 3, 7, 10],
  '11': [0, 2, 4, 5, 7, 10], m11: [0, 2, 3, 5, 7, 10],
  '13': [0, 2, 4, 7, 9, 10],
}

export interface ParsedChord {
  symbol: string        // normalized: root name (sharps) + the quality as written + /bass
  rootPc: number
  intervals: number[]   // from the root, ascending
  bassPc?: number       // slash chord bass
}

/** 'Am7', 'F#m7b5', 'Bbmaj7', 'C/E', 'Dsus4' → its root and intervals; null when not understood. */
export function parseChordSymbol(symbol: string): ParsedChord | null {
  const m = /^\s*([A-Ga-g][#♯b♭]?)([^/\s]*)(?:\/([A-Ga-g][#♯b♭]?))?\s*$/.exec(symbol)
  if (!m) return null
  const rootPc = parsePitchClass(m[1])
  if (rootPc == null) return null
  const quality = m[2]
  const intervals = CHORD_QUALITIES[quality] ?? CHORD_QUALITIES[quality.toLowerCase()]
  if (!intervals) return null
  const bassPc = m[3] != null ? parsePitchClass(m[3]) : null
  if (m[3] != null && bassPc == null) return null
  const symbolOut = NOTE_NAMES[rootPc] + quality + (bassPc != null ? '/' + NOTE_NAMES[bassPc] : '')
  return { symbol: symbolOut, rootPc, intervals: [...intervals], ...(bassPc != null ? { bassPc } : {}) }
}

/** The chord's pitch classes (bass included). */
export function chordPitchClasses(c: ParsedChord): number[] {
  const pcs = c.intervals.map(i => (c.rootPc + i) % 12)
  if (c.bassPc != null && !pcs.includes(c.bassPc)) pcs.push(c.bassPc)
  return pcs
}

// ── Roman numerals ────────────────────────────────────────────────────────
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

/**
 * A roman numeral in a key → chord symbol: 'ii7' in C major → 'Dm7', 'bVII' in A minor → 'G'.
 * Upper case = major, lower case = minor; suffixes °, +, ø, 7, maj7, 9, sus2, sus4, add9.
 * The degree is taken from the key's scale; a b / # prefix moves it a semitone. null if not one.
 */
export function romanToSymbol(numeral: string, keyRootPc: number, mode: ModeName): string | null {
  const m = /^\s*([b#♭♯]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|\+|ø)?(maj7|7|9|sus2|sus4|add9)?\s*$/.exec(numeral)
  if (!m) return null
  const [, acc, rn, mark, ext] = m
  const degree = ROMAN.indexOf(rn.toUpperCase())
  const minor = rn === rn.toLowerCase()
  let pc = (keyRootPc + MODES[mode][degree]) % 12
  if (acc === 'b' || acc === '♭') pc = (pc + 11) % 12
  if (acc === '#' || acc === '♯') pc = (pc + 1) % 12
  let q: string
  if (mark === '°' || mark === 'o') q = ext === '7' ? 'dim7' : 'dim'
  else if (mark === 'ø') q = 'm7b5'
  else if (mark === '+') q = ext === '7' ? 'aug7' : 'aug'
  else if (ext === 'maj7') q = minor ? 'mMaj7' : 'maj7'
  else if (ext === '7') q = minor ? 'm7' : '7'
  else if (ext === '9') q = minor ? 'm9' : '9'
  else if (ext === 'sus2' || ext === 'sus4') q = ext
  else if (ext === 'add9') q = minor ? 'madd9' : 'add9'
  else q = minor ? 'm' : ''
  return NOTE_NAMES[pc] + q
}

/** A chord symbol or a roman numeral in the key → ParsedChord, null if neither. */
export function resolveChord(text: string, keyRootPc: number, mode: ModeName): ParsedChord | null {
  return parseChordSymbol(text) ?? (() => {
    const s = romanToSymbol(text, keyRootPc, mode)
    return s ? parseChordSymbol(s) : null
  })()
}

/** Chord tones outside the key's scale (pitch classes); [] = diatonic. */
export function nonDiatonicTones(c: ParsedChord, keyRootPc: number, mode: ModeName): number[] {
  const scale = new Set(scalePitchClasses(keyRootPc, mode))
  return chordPitchClasses(c).filter(pc => !scale.has(pc))
}

/** The MIDI note of `midi` moved to the nearest tone of the scale (down on a tie). */
export function snapToScale(midi: number, keyRootPc: number, mode: ModeName): number {
  const scale = new Set(scalePitchClasses(keyRootPc, mode))
  for (let d = 0; d <= 6; d++) {
    if (scale.has((((midi - d) % 12) + 12) % 12)) return midi - d
    if (scale.has((((midi + d) % 12) + 12) % 12)) return midi + d
  }
  return midi
}

// ── Voicing ───────────────────────────────────────────────────────────────

/** Root-position voicing with the root as near as possible to `center` (a slash bass goes below). */
export function voiceChord(c: ParsedChord, center = 60): number[] {
  const root = center + ((((c.rootPc - center) % 12) + 18) % 12) - 6   // within [center-6, center+5]
  const notes = c.intervals.map(i => root + i)
  if (c.bassPc != null) {
    let bass = root - 12 + ((c.bassPc - c.rootPc + 12) % 12)
    if (bass >= notes[0]) bass -= 12
    notes.unshift(bass)
  }
  return notes
}

/**
 * The inversion of `c` (upper voices; a slash bass stays below) closest to `prev`, kept around
 * `center` — simple voice leading for a progression. Without `prev`, voiceChord().
 */
export function voiceLead(c: ParsedChord, prev: number[] | null, center = 60): number[] {
  if (!prev?.length) return voiceChord(c, center)
  const base = voiceChord({ ...c, bassPc: undefined }, center)
  const candidates: number[][] = []
  for (let inv = 0; inv < base.length; inv++) {
    const v = [...base.slice(inv), ...base.slice(0, inv).map(n => n + 12)]
    for (const shift of [-12, 0, 12]) candidates.push(v.map(n => n + shift))
  }
  const prevUpper = c.bassPc != null && prev.length > 1 ? prev.slice(1) : prev
  const cost = (v: number[]) =>
    v.reduce((s, n) => s + Math.min(...prevUpper.map(p => Math.abs(p - n))), 0) +
    Math.max(0, Math.abs((v[0] + v[v.length - 1]) / 2 - center) - 6)  // don't drift more than half an octave
  const best = candidates.reduce((a, b) => (cost(b) < cost(a) ? b : a))
  if (c.bassPc == null) return best
  let bass = best[0] - ((best[0] - c.bassPc) % 12 + 12) % 12
  if (bass >= best[0]) bass -= 12
  return [bass, ...best]
}

// ── Durations ─────────────────────────────────────────────────────────────
// Chord Prog step durations (stores/useChordProgStore.ts DURATION_OPTIONS) in quarter-note beats.
export const DURATION_BEATS = {
  '8m': 32, '4m': 16, '2m': 8, '1m': 4,
  '2n.': 3, '2n': 2,
  '4n.': 1.5, '4n': 1, '4t': 2 / 3,
  '8n.': 0.75, '8n': 0.5, '8t': 1 / 3,
  '16n.': 0.375, '16n': 0.25, '16t': 1 / 6,
  '32n': 0.125, '64n': 0.0625, '128n': 0.03125,
} as const
export type DurationName = keyof typeof DURATION_BEATS

/** The Chord Prog duration nearest to `beats` quarter notes (straight values preferred on a tie). */
export function beatsToDuration(beats: number): DurationName {
  let best: DurationName = '4n'
  for (const [name, b] of Object.entries(DURATION_BEATS) as [DurationName, number][]) {
    if (Math.abs(b - beats) < Math.abs(DURATION_BEATS[best] - beats)) best = name
  }
  return best
}
