/**
 * songs.ts — Session > Songs: a song is the arrangement across the Rig's lanes.
 *
 * A song is an ordered list of sections; each says, per lane (Drum, Chord, Seq, Bass, Arp), which
 * slot A–H plays (null = the lane is silent) and for how many bars. The slots are the session's
 * material (a song points to them, it doesn't copy them: decision SG1); the song says when each
 * one plays, for every lane at once, instead of each app's own chain.
 *
 * Playing (the Rig panel drives the apps): the next section is launched during the last bar of the
 * one playing, so every lane switches on the bar line (SG2: a section ends by itself after its bars;
 * Hold keeps it looping). Several songs per session (SG3), saved per user.
 */
import { userKey } from './userKey'

export const SONG_LANES = ['drum', 'chord', 'seq', 'bass', 'arp'] as const
export type SongLane = typeof SONG_LANES[number]
export const SONG_LANE_LABELS: Record<SongLane, string> = { drum: 'Drum', chord: 'Chord', seq: 'Seq', bass: 'Bass', arp: 'Arp' }
export const SONG_SLOTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const SECTION_BAR_OPTIONS = [1, 2, 4, 8, 12, 16, 24, 32] as const
export const MAX_SECTIONS = 16
/** a section's volume ramp, in bars (as the Rig's fades) */
export const VOL_BAR_OPTIONS = [0, 0.5, 1, 2, 4] as const

/** stop: the lanes stop after the last section · loop: from the first again · stay:
 *  the last section's lanes stay on, the Chord holding the chord of its last bar (the song's Latch), until Stop song / Stop */
/** staySection: the last section loops (as on Hold) until Stop song / Stop */
export type SongEnd = 'stop' | 'loop' | 'stay' | 'staySection'

export interface SongSection {
  id: string
  name: string
  bars: number
  /** slot index 0–7 per lane, null = silent */
  lanes: Record<SongLane, number | null>
  /**
   * Volume per MIDI channel (key `device|ch0`, as the Rig's Fade modal): % of the channel's Max
   * (0–100). A channel set in any section of the song is the song's: in a section without it, 100.
   * Channels set nowhere are left alone.
   */
  vol: Record<string, number>
  /** the volumes reach their level over these bars from the section's first bar line (0 = on it) */
  volBars: number
  /** Chord lane: the slot loops on its first N chords in this section (null = all) */
  chordSteps: number | null
  /** Drum lane: the Rig's Density 0–127 in this section (null: 127 if another section sets it, else left alone) */
  drumDensity: number | null
}

export interface Song {
  id: string
  name: string
  sections: SongSection[]
  end: SongEnd
  /** SG4: the song has its own material (its slots A–H, lib/song-material.ts); false = the session's slots */
  own: boolean
}

/** currentId: the song open · loadedId: the song whose own material is in the apps (null: the session's) */
export interface SongLibrary { songs: Song[]; currentId: string | null; loadedId: string | null }

const uid = () => Math.random().toString(36).slice(2, 10)

export const emptyLanes = (): Record<SongLane, number | null> => ({ drum: null, chord: null, seq: null, bass: null, arp: null })

export function newSection(name = 'Section', bars = 8, lanes: Partial<Record<SongLane, number | null>> = {}): SongSection {
  return { id: uid(), name, bars, lanes: { ...emptyLanes(), ...lanes }, vol: {}, volBars: 0, chordSteps: null, drumDensity: null }
}

export function newSong(name = 'New song'): Song {
  return { id: uid(), name, end: 'stop', own: false, sections: [newSection('Intro', 8, { chord: 0 })] }
}

/** The example song (Session > Songs plan): six sections over the lanes' slots. */
export function exampleSong(): Song {
  const L = (s: string) => {
    // "D C S B A" letters, '-' = silent
    const v = s.split(' ').map(c => (c === '-' ? null : SONG_SLOTS.indexOf(c as typeof SONG_SLOTS[number])))
    return { drum: v[0], chord: v[1], seq: v[2], bass: v[3], arp: v[4] }
  }
  return {
    id: uid(),
    name: 'Nightline',
    end: 'stop',
    own: false,
    sections: [
      newSection('Intro', 8, L('- A - - A')),
      newSection('Build', 16, L('B A B B -')),
      newSection('Theme', 16, L('C C C B -')),
      newSection('Bridge', 8, L('- D - D -')),
      newSection('Theme II', 16, L('C C E B E')),
      newSection('Outro', 8, L('- A - - A')),
    ],
  }
}

export const songBars = (song: Song): number => song.sections.reduce((n, s) => n + s.bars, 0)
/** Bar (1-based, of the whole song) where section `i` starts. */
export const sectionStartBar = (song: Song, i: number): number => 1 + song.sections.slice(0, i).reduce((n, s) => n + s.bars, 0)
/** The lanes playing in a section. */
export const activeLanes = (sec: SongSection): SongLane[] => SONG_LANES.filter(l => sec.lanes[l] !== null)
/** Where the material of a song is: its own key, or the session's. */
export const SESSION_MATERIAL = '__session'
export const materialKey = (song: Song | null | undefined): string => (song?.own ? song.id : SESSION_MATERIAL)

/** The section after `i` (null: the song ends). */
export function nextSectionIndex(song: Song, i: number): number | null {
  if (i + 1 < song.sections.length) return i + 1
  return song.end === 'loop' && song.sections.length ? 0 : null
}

// ── Validation / storage ─────────────────────────────────────────────────
const clampBars = (b: unknown) => {
  const n = Math.round(Number(b))
  return Number.isFinite(n) ? Math.min(64, Math.max(1, n)) : 8
}
const slotOrNull = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < SONG_SLOTS.length ? v : null)

function parseVol(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Math.round(Number(v))
    if (/\|\d+$/.test(k) && Number.isFinite(n)) out[k] = Math.max(0, Math.min(100, n))
  }
  return out
}

export function parseSong(raw: any): Song | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return null
  const sections = raw.sections.slice(0, MAX_SECTIONS).map((s: any) => ({
    id: typeof s?.id === 'string' && s.id ? s.id : uid(),
    name: typeof s?.name === 'string' ? s.name.slice(0, 24) : 'Section',
    bars: clampBars(s?.bars),
    lanes: Object.fromEntries(SONG_LANES.map(l => [l, slotOrNull(s?.lanes?.[l])])) as Record<SongLane, number | null>,
    vol: parseVol(s?.vol),
    volBars: (VOL_BAR_OPTIONS as readonly number[]).includes(Number(s?.volBars)) ? Number(s.volBars) : 0,
    chordSteps: Number.isInteger(s?.chordSteps) && s.chordSteps >= 1 && s.chordSteps <= 16 ? s.chordSteps : null,
    drumDensity: typeof s?.drumDensity === 'number' && Number.isFinite(s.drumDensity) ? Math.max(0, Math.min(127, Math.round(s.drumDensity))) : null,
  }))
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 40) : 'Song',
    end: raw.end === 'loop' || raw.end === 'stay' || raw.end === 'staySection' ? raw.end : 'stop',
    own: raw.own === true,
    sections,
  }
}

export function parseLibrary(raw: any): SongLibrary {
  const songs = Array.isArray(raw?.songs) ? raw.songs.map(parseSong).filter(Boolean) as Song[] : []
  if (!songs.length) songs.push(exampleSong())
  const currentId = songs.some(s => s.id === raw?.currentId) ? raw.currentId : songs[0].id
  const loadedId = songs.some(s => s.id === raw?.loadedId && s.own) ? raw.loadedId : null
  return { songs, currentId, loadedId }
}

export const LS_SONGS = 'SYCORE_SESSION_SONGS'
export function loadSongs(): SongLibrary {
  try { return parseLibrary(JSON.parse(localStorage.getItem(userKey(LS_SONGS)) || 'null')) } catch { return parseLibrary(null) }
}
export function saveSongs(lib: SongLibrary): void {
  try { localStorage.setItem(userKey(LS_SONGS), JSON.stringify(lib)) } catch {}
}

// ── Player (pure): what to do at each bar line ───────────────────────────
export interface SongRun {
  songId: string
  /** the section playing (or about to start) */
  index: number
  /** bar inside the section, 1-based; 0 = not started yet (waiting for its first bar line / Play) */
  bar: number
  /** the section launched to start on the next bar line */
  queued: number | null
  /** keep looping the section playing */
  hold: boolean
  /** the end of the song: the lanes stop on the next bar line */
  stopping: boolean
  /** End Stay: the song is over but holds (the Chord on its last chord) until stopped */
  stay?: boolean
}

export type SongStep =
  | { kind: 'launch'; index: number } // launch that section now, to start on the next bar line
  | { kind: 'stop' }                  // stop every lane on the next bar line
  | { kind: 'stay' }                  // End Stay: the lanes stay on, the Chord holds its last chord
  | { kind: 'done' }                  // the song is over
  | null

export function startRun(song: Song, from = 0): SongRun {
  return { songId: song.id, index: Math.max(0, Math.min(from, song.sections.length - 1)), bar: 0, queued: null, hold: false, stopping: false }
}

/** A bar line went by: the bar now starting. Changes `run`, returns what the panel does. */
export function songBarLine(run: SongRun, song: Song): SongStep {
  if (run.stopping && run.stay) { run.bar = (song.sections[run.index]?.bars ?? 0) + 1; return null } // Stay: it holds until stopped
  if (run.stopping) return { kind: 'done' }
  if (run.queued !== null) { run.index = run.queued; run.queued = null; run.bar = 1 }
  else {
    run.bar += 1
    const len = song.sections[run.index]?.bars ?? 1
    if (run.bar > len) run.bar = 1 // Hold (or nothing launched): the section again
  }
  return lastBarStep(run, song)
}

/** In the section's last bar (not held): the next section, or the end. */
function lastBarStep(run: SongRun, song: Song): SongStep {
  const sec = song.sections[run.index]
  if (!sec || run.hold || run.queued !== null || run.bar !== sec.bars) return null
  const next = nextSectionIndex(song, run.index)
  if (next === null && song.end === 'staySection') return null // the last section again, until stopped
  if (next === null) {
    run.stopping = true
    if (song.end === 'stay') { run.stay = true; return { kind: 'stay' } }
    return { kind: 'stop' }
  }
  run.queued = next
  return { kind: 'launch', index: next }
}

/** A section picked while the song plays: it starts on the next bar line. */
export function jumpTo(run: SongRun, song: Song, index: number): SongStep {
  if (index < 0 || index >= song.sections.length) return null
  run.stopping = false
  run.stay = false
  if (run.bar === 0) { run.index = index; return { kind: 'launch', index } }
  run.queued = index
  return { kind: 'launch', index }
}

/** Hold on / off. Turned off in the last bar: the next section is launched now. */
export function setHold(run: SongRun, song: Song, on: boolean): SongStep {
  run.hold = on
  return on ? null : lastBarStep(run, song)
}

/** Bars left in the section playing (for the display). */
export const barsLeft = (run: SongRun, song: Song): number => Math.max(0, (song.sections[run.index]?.bars ?? 0) - run.bar)

// ── Volumes per channel (pure): what a section sends as CC 7 ─────────────
/** The channels the song sets the volume of (set in any of its sections). */
export const songVolKeys = (song: Song): string[] => [...new Set(song.sections.flatMap(s => Object.keys(s.vol ?? {})))]

/** A section's CC 7 per song channel: its % (else 100) of the channel's Max. */
export function sectionVolTargets(song: Song, sec: SongSection, maxOf: (key: string) => number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of songVolKeys(song)) out[k] = Math.round(maxOf(k) * (sec.vol?.[k] ?? 100) / 100)
  return out
}

export interface VolRamp { key: string; from: number; to: number; t0: number; t1: number }
/** The ramps to the targets from `t0` (the section's first bar line) over its volBars; from the value now. */
export function sectionVolRamps(targets: Record<string, number>, current: Record<string, number>, t0: number, barMs: number, bars: number): VolRamp[] {
  const len = bars > 0 && barMs > 0 ? bars * barMs : 0
  return Object.entries(targets).map(([key, to]) => ({ key, from: current[key] ?? to, to, t0, t1: t0 + len }))
}

/** The Drum Density of a section: its own, else 127 when the song sets it in another section, else null (left alone). */
export function sectionDrumDensity(song: Song, sec: SongSection): number | null {
  if (sec.drumDensity != null) return sec.drumDensity
  return song.sections.some(s => s.drumDensity != null) ? 127 : null
}
