/**
 * theme-extract.ts — a recorded theme (MIDI Capture's Tema: notes timed from its first note, the bar's
 * "1") split into chords and melody, and the patterns made from them:
 *   chords → Chord Prog steps: one per bar, two (½ bar each) when the harmony changes inside the bar;
 *            the same chord on consecutive steps merged while the length is one Chord Prog has
 *            (1 / 2 / 4 / 8 bars); bars with no chord before the first one are rests.
 *   melody → Sequencer banks: one bar (16 sixteenths) per bank, a note per step (the highest), its
 *            length as tied steps.
 * Split: notes struck together (≥ 3 within `clusterMs`) are chord notes, the rest melody; or, with a
 * split note, below it chords and from it up melody (two hands).
 */
import { detectChord, noteLabel } from '@/lib/chord-detector'

export interface ThemeNote {
  pitch: number
  velocity: number
  startTime: number
  duration: number
}

export interface ThemeChord {
  /** In beats from the theme's start. */
  start: number
  beats: number
  /** '' for a rest. */
  name: string
  notes: number[]
}

export interface SeqStepOut {
  active: boolean
  notes: number[]
  velocity: number
  gate: number
  tieSteps: number
  param1Value: number
  param2Value: number
  edited: boolean
  explicitNotes?: boolean
}

export const BEATS_PER_BAR = 4
const CLUSTER_MS = 50

export function splitTheme(notes: ThemeNote[], opts: { split?: number | null; clusterMs?: number } = {}) {
  const chord: ThemeNote[] = []
  const melody: ThemeNote[] = []
  if (opts.split != null) {
    for (const n of notes) (n.pitch < opts.split ? chord : melody).push(n)
    return { chord, melody }
  }
  const win = opts.clusterMs ?? CLUSTER_MS
  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime)
  for (let i = 0; i < sorted.length;) {
    let j = i + 1
    while (j < sorted.length && sorted[j].startTime - sorted[i].startTime <= win) j++
    const group = sorted.slice(i, j)
    ;(new Set(group.map(n => n.pitch)).size >= 3 ? chord : melody).push(...group)
    i = j
  }
  return { chord, melody }
}

/** The chord sounding in [a, b): notes struck in it, or held over a quarter of it. */
function chordIn(notes: ThemeNote[], a: number, b: number): { name: string; notes: number[] } | null {
  const minOverlap = (b - a) / 4
  const pitches = [...new Set(notes
    .filter(n => {
      const end = n.startTime + Math.max(n.duration, 1)
      if (n.startTime >= a && n.startTime < b) return true
      return Math.min(end, b) - Math.max(n.startTime, a) >= minOverlap
    })
    .map(n => n.pitch))].sort((x, y) => x - y)
  if (pitches.length < 2) return null
  return { name: detectChord(pitches)?.name ?? pitches.map(noteLabel).join(' '), notes: pitches }
}

const MERGE_BEATS = [4, 8, 16, 32]

export function extractChords(notes: ThemeNote[], opts: { t0: number; bpm: number; bars: number }): ThemeChord[] {
  const beatMs = 60000 / (opts.bpm > 0 ? opts.bpm : 120)
  const barMs = beatMs * BEATS_PER_BAR
  const out: ThemeChord[] = []
  for (let bar = 0; bar < opts.bars; bar++) {
    const a = opts.t0 + bar * barMs
    const mid = a + barMs / 2
    const b = a + barMs
    const h1 = chordIn(notes, a, mid)
    const h2 = chordIn(notes, mid, b)
    const start = bar * BEATS_PER_BAR
    if (h1 && h2 && h1.name !== h2.name) {
      out.push({ start, beats: 2, ...h1 }, { start: start + 2, beats: 2, ...h2 })
      continue
    }
    const whole = chordIn(notes, a, b) ?? h1 ?? h2
    if (whole) { out.push({ start, beats: BEATS_PER_BAR, ...whole }); continue }
    // no chord: the one before holds on; before the first chord, a rest
    const prev = out[out.length - 1]
    out.push(prev?.name ? { ...prev, start, beats: BEATS_PER_BAR } : { start, beats: BEATS_PER_BAR, name: '', notes: [] })
  }
  // merge the same chord (or rests) into the lengths a Chord Prog step has
  const merged: ThemeChord[] = []
  for (const c of out) {
    const prev = merged[merged.length - 1]
    if (prev && prev.name === c.name && prev.beats === c.beats && MERGE_BEATS.includes(prev.beats + c.beats)) {
      merged[merged.length - 1] = { ...prev, beats: prev.beats + c.beats }
    } else merged.push({ ...c })
  }
  return merged
}

/** A Chord Prog step's duration for a length in beats. */
export function beatsToDuration(beats: number): string {
  return ({ 2: '2n', 4: '1m', 8: '2m', 16: '4m', 32: '8m' } as Record<number, string>)[beats] ?? '1m'
}

/** The melody as Sequencer banks: one bar each (16 sixteenths), from the theme's first bar. */
export function extractMelody(notes: ThemeNote[], opts: { t0: number; bpm: number; bars: number }): SeqStepOut[][] {
  const sixteenth = 60000 / (opts.bpm > 0 ? opts.bpm : 120) / 4
  const total = opts.bars * 16
  const cells: (ThemeNote | null)[] = Array(total).fill(null)
  for (const n of notes) {
    const i = Math.round((n.startTime - opts.t0) / sixteenth)
    if (i < 0 || i >= total) continue
    if (!cells[i] || n.pitch > cells[i]!.pitch) cells[i] = n
  }
  const banks: SeqStepOut[][] = []
  for (let bar = 0; bar < opts.bars; bar++) {
    banks.push(Array.from({ length: 16 }, (_, k) => {
      const n = cells[bar * 16 + k]
      if (!n) return { active: false, notes: [60], velocity: 100, gate: 75, tieSteps: 0, param1Value: 64, param2Value: 64, edited: false }
      const len = Math.max(1, Math.round(n.duration / sixteenth))
      return {
        active: true, notes: [n.pitch], velocity: n.velocity, gate: len > 1 ? 90 : Math.min(100, Math.max(10, Math.round(n.duration / sixteenth * 100))),
        tieSteps: Math.min(len - 1, 15 - k), param1Value: 64, param2Value: 64, edited: true, explicitNotes: true,
      }
    }))
  }
  return banks
}

/** Bars the theme spans from its first note (at least 1). */
export function themeBars(notes: ThemeNote[], t0: number, bpm: number): number {
  if (!notes.length) return 0
  const barMs = 60000 / (bpm > 0 ? bpm : 120) * BEATS_PER_BAR
  const end = Math.max(...notes.map(n => n.startTime + Math.max(n.duration, 1)))
  // a note ending just past a bar line (released late) doesn't add a bar
  return Math.max(1, Math.ceil((end - t0 - barMs * 0.1) / barMs))
}
