const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

interface QualityEntry {
  intervals: number[]
  quality: string
}

// Ordered by specificity (more specific / longer first) so subset chords don't shadow extended ones.
const QUALITIES: QualityEntry[] = [
  // Extended / 9ths
  { intervals: [0, 2, 4, 7, 10], quality: '9' },
  // Seventh chords
  { intervals: [0, 4, 7, 11],    quality: 'maj7' },
  { intervals: [0, 4, 7, 10],    quality: '7' },
  { intervals: [0, 3, 7, 11],    quality: 'mMaj7' },
  { intervals: [0, 3, 7, 10],    quality: 'm7' },
  { intervals: [0, 3, 6, 9],     quality: 'dim7' },
  { intervals: [0, 3, 6, 10],    quality: 'ø7' },
  { intervals: [0, 4, 8, 10],    quality: 'aug7' },
  // Add / Sixth
  { intervals: [0, 2, 4, 7],     quality: 'add9' },
  { intervals: [0, 2, 3, 7],     quality: 'm(add9)' },
  { intervals: [0, 4, 7, 9],     quality: '6' },
  { intervals: [0, 3, 7, 9],     quality: 'm6' },
  // Triads
  { intervals: [0, 4, 7],        quality: 'Major' },
  { intervals: [0, 3, 7],        quality: 'Minor' },
  { intervals: [0, 3, 6],        quality: 'dim' },
  { intervals: [0, 4, 8],        quality: 'aug' },
  { intervals: [0, 2, 7],        quality: 'sus2' },
  { intervals: [0, 5, 7],        quality: 'sus4' },
]

export interface ChordInfo {
  name: string
  root: string
  quality: string
}

export function detectChord(notes: number[]): ChordInfo | null {
  if (notes.length < 2) return null

  // Unique pitch classes, sorted
  const pcs = [...new Set(notes.map(n => ((n % 12) + 12) % 12))].sort((a, b) => a - b)

  for (const rootPc of pcs) {
    const intervals = pcs
      .map(pc => ((pc - rootPc + 12) % 12))
      .sort((a, b) => a - b)

    for (const { intervals: qi, quality } of QUALITIES) {
      if (intervals.length !== qi.length) continue
      if (intervals.every((v, i) => v === qi[i])) {
        const root = NOTE_NAMES[rootPc]
        const name = formatChordName(root, quality)
        return { name, root, quality }
      }
    }
  }

  return null
}

function formatChordName(root: string, quality: string): string {
  if (quality === 'Major') return root
  if (quality === 'Minor') return `${root}m`
  return `${root}${quality}`
}

export function noteLabel(midiNote: number): string {
  const pc = ((midiNote % 12) + 12) % 12
  const oct = Math.floor(midiNote / 12) - 1
  return `${NOTE_NAMES[pc]}${oct}`
}
