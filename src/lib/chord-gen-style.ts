/**
 * chord-gen-style.ts — the Chord Prog's Generate by style.
 *
 * The progression comes from the library chosen (Modal Chords by default, or a key / genre file),
 * filtered on Modal Chords by its root (the names start with it: "A Mysterious Dark"). The style —
 * the Sequencer's styles, without its bassline ones — then decides:
 * - the harmonic rhythm: each chord's duration (a pattern of whole bars, e.g. Ambient 4 bars,
 *   Funk pushed chords), its gate and velocity;
 * - the mood: on Modal Chords, progressions whose name carries one of the style's moods first;
 * - the voicing: triads as written, sevenths, stabs (no bass), power chords, open / spread;
 * - Arpeggio / Berlin School: the chords are arpeggiated (the step's Arp mode, 16ths).
 */
import { NOTE_NAMES, generateMajor, keyRoot, MODAL_KEY_INDEX, type KeyMode } from './chord-key'
import { detectChord } from './chord-detector'

export type ChordVoicing = 'triad' | 'seventh' | 'stab' | 'power' | 'open'

export interface ChordGenStyle {
  /** Duration patterns (DURATION_OPTIONS values), one per chord, cycled; each sums to whole bars. */
  rhythms: string[][]
  moods: string[]
  voicing: ChordVoicing
  gate: number
  velocity: number
  /** Arpeggiated: the steps in Arp mode at this rate. */
  arp?: string
}

export const CHORD_GEN_STYLES: Record<string, ChordGenStyle> = {
  House: { rhythms: [['1m'], ['2m'], ['2n.', '4n', '2n.', '4n']], moods: ['Joyful', 'Hopeful', 'Excited', 'Romantic'], voicing: 'seventh', gate: 50, velocity: 100 },
  Techno: { rhythms: [['2m'], ['4m'], ['1m']], moods: ['Dark', 'Mysterious', 'Rebellious'], voicing: 'stab', gate: 40, velocity: 110 },
  HipHop: { rhythms: [['1m'], ['2m'], ['2n', '2n', '1m', '1m']], moods: ['Nostalgic', 'Romantic', 'Tender', 'Dark'], voicing: 'seventh', gate: 85, velocity: 90 },
  Acid: { rhythms: [['1m'], ['2m'], ['4m']], moods: ['Mysterious', 'Rebellious', 'Dark', 'Surprised'], voicing: 'stab', gate: 45, velocity: 105 },
  Funk: { rhythms: [['2n', '2n'], ['4n.', '4n.', '4n', '1m'], ['1m']], moods: ['Excited', 'Joyful', 'Rebellious'], voicing: 'seventh', gate: 35, velocity: 105 },
  Jazz: { rhythms: [['2n', '2n'], ['1m'], ['1m', '1m', '2n', '2n']], moods: ['Romantic', 'Nostalgic', 'Tender', 'Relaxed'], voicing: 'seventh', gate: 85, velocity: 80 },
  Ambient: { rhythms: [['4m'], ['2m'], ['8m']], moods: ['Peaceful', 'Tender', 'Spiritual', 'Relaxed', 'Hopeful'], voicing: 'open', gate: 100, velocity: 60 },
  'Drum&Bass': { rhythms: [['2m'], ['1m'], ['4m']], moods: ['Dark', 'Mysterious', 'Triumphant', 'Nostalgic'], voicing: 'seventh', gate: 90, velocity: 95 },
  Minimal: { rhythms: [['4m'], ['2m']], moods: ['Mysterious', 'Dark', 'Relaxed'], voicing: 'stab', gate: 40, velocity: 85 },
  Latin: { rhythms: [['2n', '2n'], ['4n.', '4n.', '4n', '1m'], ['1m']], moods: ['Joyful', 'Romantic', 'Excited'], voicing: 'triad', gate: 50, velocity: 100 },
  Industrial: { rhythms: [['2m'], ['4m'], ['1m']], moods: ['Dark', 'Fearful', 'Rebellious'], voicing: 'power', gate: 70, velocity: 120 },
  Reggae: { rhythms: [['1m'], ['2n', '2n']], moods: ['Relaxed', 'Peaceful', 'Joyful', 'Hopeful'], voicing: 'triad', gate: 25, velocity: 90 },
  Pop: { rhythms: [['1m'], ['2n', '2n', '1m', '1m'], ['2m']], moods: ['Hopeful', 'Joyful', 'Romantic', 'Triumphant'], voicing: 'triad', gate: 90, velocity: 100 },
  Rock: { rhythms: [['1m'], ['2n', '2n'], ['2m']], moods: ['Triumphant', 'Rebellious', 'Excited'], voicing: 'power', gate: 90, velocity: 115 },
  Electronic: { rhythms: [['1m'], ['2m'], ['2n.', '4n', '2n.', '4n']], moods: ['Hopeful', 'Mysterious', 'Triumphant', 'Excited'], voicing: 'triad', gate: 70, velocity: 100 },
  Trap: { rhythms: [['2m'], ['1m'], ['4m']], moods: ['Dark', 'Mysterious', 'Nostalgic'], voicing: 'open', gate: 100, velocity: 85 },
  EDM: { rhythms: [['1m'], ['2m'], ['2n.', '4n', '2n.', '4n']], moods: ['Triumphant', 'Hopeful', 'Excited', 'Joyful'], voicing: 'triad', gate: 90, velocity: 110 },
  Urban: { rhythms: [['1m'], ['2n', '2n'], ['2m']], moods: ['Romantic', 'Tender', 'Nostalgic', 'Relaxed'], voicing: 'seventh', gate: 85, velocity: 85 },
  Arpeggio: { rhythms: [['1m'], ['2m']], moods: ['Hopeful', 'Mysterious', 'Triumphant'], voicing: 'open', gate: 100, velocity: 95, arp: '16n' },
  'Berlin School': { rhythms: [['2m'], ['4m']], moods: ['Mysterious', 'Spiritual', 'Nostalgic'], voicing: 'open', gate: 100, velocity: 90, arp: '16n' },
}
export const CHORD_GEN_STYLE_NAMES = Object.keys(CHORD_GEN_STYLES)
export const DEFAULT_CHORD_GEN_STYLE = 'House'
export const isChordGenStyle = (v: unknown): v is string => typeof v === 'string' && v in CHORD_GEN_STYLES

export { MODAL_KEY_INDEX } from './chord-key'

const m12 = (n: number) => ((n % 12) + 12) % 12
const DUR_16THS: Record<string, number> = {
  '8m': 128, '4m': 64, '2m': 32, '1m': 16, '2n.': 12, '2n': 8, '4n.': 6, '4n': 4, '4t': 8 / 3,
  '8n.': 3, '8n': 2, '8t': 4 / 3, '16n.': 1.5, '16n': 1, '16t': 2 / 3,
}
/** A duration in sixteenths (0 when unknown). */
export const durSixteenths = (d: string) => DUR_16THS[d] ?? 0

/** The root (0–11) a Modal Chords name starts with ("Gb Surprised…" → 6), or null. */
export function modalRoot(name: string): number | null {
  const tok = String(name).split(/\s+/)[0]
  const i = (NOTE_NAMES as readonly string[]).indexOf(tok)
  return i >= 0 ? i : null
}

/** A progression's name for the style: on its root (null = any), the style's moods first. */
export function pickProgression(names: readonly string[], opts: { root?: number | null; moods?: readonly string[]; rnd?: () => number } = {}): string | null {
  const rnd = opts.rnd ?? Math.random
  const onRoot = opts.root == null ? [...names] : names.filter(n => modalRoot(n) === opts.root)
  const pool = onRoot.length ? onRoot : [...names]
  if (!pool.length) return null
  const moods = opts.moods ?? []
  const moody = moods.length ? pool.filter(n => n.split(/\s+/).some(w => moods.includes(w))) : []
  // mostly the style's moods; now and then any (a surprise)
  const from = moody.length && rnd() < 0.85 ? moody : pool
  return from[Math.floor(rnd() * from.length)] ?? null
}

export interface GenChord { chordName: string; notes: number[] }

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function nameRoot(name: string): number | null {
  const m = /^\s*([A-G])([#b]?)/.exec(name)
  if (!m) return null
  return m12(LETTER_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0))
}

/** The chord voiced for the style; its name follows the notes. */
export function voiceChord(chord: GenChord, voicing: ChordVoicing): GenChord {
  const notes = [...chord.notes].sort((a, b) => a - b)
  if (voicing === 'triad' || notes.length < 2) return { chordName: chord.chordName, notes: chord.notes.slice() }
  const root = nameRoot(chord.chordName) ?? m12(notes[0])
  // a bass note under the chord (the library's: the root, well below the others)
  const hasBass = notes.length >= 3 && m12(notes[0]) === root && notes[1] - notes[0] >= 7
  const upper = hasBass ? notes.slice(1) : notes
  const rel = new Set(upper.map(n => m12(n - root)))
  const third = rel.has(3) ? 3 : rel.has(4) ? 4 : rel.has(2) ? 2 : rel.has(5) ? 5 : 4
  const fifth = rel.has(7) ? 7 : rel.has(6) ? 6 : rel.has(8) ? 8 : 7
  const bass = hasBass ? notes[0] : 36 + root
  const name = (ns: number[], fallback: string) => detectChord(ns)?.name ?? fallback
  const base = NOTE_NAMES[root]

  if (voicing === 'power') {
    const r = 48 + root
    return { chordName: `${base}5`, notes: [bass, r, r + 7, r + 12] }
  }
  if (voicing === 'stab') {
    // close triad, root position, in 60–71, no bass
    const r = 60 + root
    const ns = [r, r + third, r + fifth]
    return { chordName: name(ns, chord.chordName), notes: ns }
  }
  if (voicing === 'open') {
    // root low, fifth and third spread up, a ninth on top
    const r = 36 + root
    const ns = [r, r + 7 + 12, r + third + 24, r + 2 + 24]
    return { chordName: name(ns, chord.chordName), notes: ns }
  }
  // seventh: the chord as written plus its seventh (minor → b7, major → maj7, dim → b7), if missing
  if (rel.has(10) || rel.has(11) || rel.has(9)) return { chordName: chord.chordName, notes: chord.notes.slice() }
  const sev = third === 3 || fifth === 6 ? 10 : 11
  const low = upper[0]
  let n = low
  while (m12(n - root) !== sev) n++
  const ns = [...upper, n].sort((a, b) => a - b)
  const out = hasBass ? [...ns, bass] : ns
  return { chordName: name(ns, chord.chordName), notes: out }
}

export interface StyledStep {
  chordName: string
  notes: number[]
  duration: string
  gate: number
  velocity: number
  stepMode?: 'arp'
  arpRate?: string
}

export interface StyledGenOpts {
  /** The loaded library: name → chords. */
  data: Record<string, GenChord[]>
  selectedKey: number
  keyMode: KeyMode
  /** Modal Chords: the root to stay on (null = any). */
  root: number | null
  style: string
  numSteps: number
  rnd?: () => number
}

/** The steps of a new progression in the style (null when the library has nothing). */
export function generateStyled(o: StyledGenOpts): { name: string; steps: StyledStep[] } | null {
  const rnd = o.rnd ?? Math.random
  const st = CHORD_GEN_STYLES[o.style] ?? CHORD_GEN_STYLES[DEFAULT_CHORD_GEN_STYLE]
  let name: string
  let chords: GenChord[]
  if (o.keyMode === 'major' && o.selectedKey >= 0 && o.selectedKey < 12) {
    // a major key: the library has none (its progressions are minor), from the major templates
    chords = generateMajor(keyRoot(o.selectedKey, 'major') ?? 0, o.numSteps, rnd)
    name = `${NOTE_NAMES[o.selectedKey]} major`
  } else {
    const picked = pickProgression(Object.keys(o.data), { root: o.selectedKey === MODAL_KEY_INDEX ? o.root : null, moods: st.moods, rnd })
    if (!picked || !o.data[picked]?.length) return null
    name = picked
    chords = o.data[picked]
  }
  const rhythm = st.rhythms[Math.floor(rnd() * st.rhythms.length)]
  const steps: StyledStep[] = []
  for (let i = 0; i < o.numSteps; i++) {
    const c = voiceChord(chords[i % chords.length], st.voicing)
    steps.push({
      chordName: c.chordName,
      notes: c.notes,
      duration: rhythm[i % rhythm.length],
      gate: st.gate,
      velocity: st.velocity,
      ...(st.arp ? { stepMode: 'arp' as const, arpRate: st.arp } : {}),
    })
  }
  return { name, steps }
}
