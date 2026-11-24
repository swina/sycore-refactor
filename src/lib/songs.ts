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
import { reactive, ref } from 'vue'
import { userKey } from './userKey'
import type { SongPlan } from './song-plan'
import type { PcChannelState } from '@/types/midi'

export const SONG_LANES = ['drum', 'chord', 'seq', 'bass', 'arp', 'track', 'capture', 'sample'] as const
export type SongLane = typeof SONG_LANES[number]
export const SONG_LANE_LABELS: Record<SongLane, string> = { drum: 'Drum', chord: 'Chord', seq: 'Seq', bass: 'Bass', arp: 'Arp', track: 'Tracks', capture: 'Capture', sample: 'Samples' }
/** The lanes the Rig plays (its apps' slots A–H). */
export const RIG_SONG_LANES = ['drum', 'chord', 'seq', 'bass', 'arp'] as const
/** The song's audio lanes (core/engines/song-audio.js): their 8 slots are the song's own (song.audio). */
export const AUDIO_SONG_LANES = ['track', 'sample'] as const
export type AudioSongLane = typeof AUDIO_SONG_LANES[number]
/** A Track slot: a backing track of the Tracks library (users/<uid>/backing_tracks). */
/** retrigger: from its start at every clip (else it runs on while the same slot follows; the song starting over restarts it). */
/** fit: 'varispeed' — its speed follows the song's tempo (song BPM ÷ its BPM; the pitch moves too), else at its own speed. */
export interface SongTrackRef { id: string; label: string; bpm?: number | null; duration?: number | null; retrigger?: boolean; fit?: 'off' | 'varispeed' }
/** A Sample slot: a sound file picked in the Sound Folder Browser, kept in IndexedDB (lib/song-samples.ts) —
 *  One-shot (once from the clip's bar line) or Loop (again and again until the clip ends). */
export interface SongSampleRef { id: string; name: string; mode: 'oneshot' | 'loop' }
export interface SongAudio { track: (SongTrackRef | null)[]; sample: (SongSampleRef | null)[] }
export const emptyAudio = (): SongAudio => ({ track: Array(8).fill(null), sample: Array(8).fill(null) })
export const SONG_SLOTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const SECTION_BAR_OPTIONS = [1, 2, 4, 8, 12, 16, 24, 32] as const
export const MAX_SECTIONS = 16
/** a section's volume ramp, in bars (as the Rig's fades) */
export const VOL_BAR_OPTIONS = [0, 0.5, 1, 2, 4] as const

/** stop: the lanes stop after the last section · loop: from the first again · stay:
 *  the last section's lanes stay on, the Chord holding the chord of its last bar (the song's Latch), until Stop song / Stop */
/** staySection: the last section loops (as on Hold) until Stop song / Stop · next: the session's next song
 *  starts on the bar line (the last one stops) */
export type SongEnd = 'stop' | 'loop' | 'stay' | 'staySection' | 'next'

/** The song's Fade Out (Stop song, End Stop): 'rig' = the Rig's Fade Out (Performance), else bars (0 = Cut: none). */
export type SongFadeOut = 'rig' | number
export const SONG_FADE_OPTIONS: readonly SongFadeOut[] = ['rig', 0, 0.5, 1, 2, 4]
/** A tempo the song can set (20–999 BPM, 0.1), else null. */
export const okBpm = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 20 && v <= 999 ? Math.round(v * 10) / 10 : null)
/** The tempo of a section: its own, else the song's; null: the tempo as it is. */
export const sectionBpm = (song: Song | null | undefined, sec: SongSection | null | undefined): number | null => okBpm(sec?.bpm) ?? okBpm(song?.bpm)
/** A Track's playback rate at `bpm`: varispeed, its BPM known: bpm ÷ its BPM (within 0.5–2), else 1. */
export function trackRate(ref: SongTrackRef | null | undefined, bpm: number | null | undefined): number {
  if (!ref || ref.fit !== 'varispeed' || !(Number(ref.bpm) > 0) || !(Number(bpm) > 0)) return 1
  return Math.max(0.5, Math.min(2, Number(bpm) / Number(ref.bpm)))
}
const okFadeOut = (v: unknown): SongFadeOut => (typeof v === 'number' && SONG_FADE_OPTIONS.includes(v) ? v : 'rig')

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
  /** its tempo, from its first bar line (null / absent: the song's) */
  bpm?: number | null
  /** Chord lane: the slot loops on its first N chords in this section (null = all) */
  chordSteps: number | null
  /** Drum lane: the Rig's Density 0–127 in this section (null: 127 if another section sets it, else left alone) */
  drumDensity: number | null
  /**
   * The clips of a lane placed in the section (bars `start`…`start+len-1`, 1-based): each plays its
   * slot from the pattern's start (looping if shorter), silent between them. A lane with none listed
   * here: one clip of `lanes[l]` over the whole section. `lanes[l]` = the slot of its first clip.
   */
  clips?: Partial<Record<SongLane, SongClip[]>>
}

/** A clip's sounds (the Session Browser's Save presets): per MIDI channel of its lane ('device|ch'), the preset as the
 *  Virtual Device sent it — sent before the clip's bar line when that channel plays another one. */
export type ClipPresets = Record<string, PcChannelState>
export interface SongClip { slot: number; start: number; len: number; presets?: ClipPresets }

export interface Song {
  id: string
  name: string
  sections: SongSection[]
  end: SongEnd
  /** Stop song / End Stop: the fade-out before the lanes stop */
  fadeOut: SongFadeOut
  /** Another song coming in (End Next, a song picked while one plays): its fade-in after the gap — 'rig' = the Rig's
   *  Fade In, else bars (0 = Cut). Absent: 'rig'. */
  fadeIn?: SongFadeOut
  /** SG4: the song has its own material (its slots A–H, lib/song-material.ts); false = the session's slots */
  own: boolean
  /** Its Tracks / Samples lanes' slots A–H (always the song's own). Absent: none. */
  audio?: SongAudio
  /** The song sets the tempo: its BPM (a section can have its own); null / absent: the tempo as it is. */
  bpm?: number | null
}

/** currentId: the song open · loadedId: the song whose own material is in the apps (null: the session's) */
export interface SongLibrary { songs: Song[]; currentId: string | null; loadedId: string | null }

const uid = () => Math.random().toString(36).slice(2, 10)

export const emptyLanes = (): Record<SongLane, number | null> => ({ drum: null, chord: null, seq: null, bass: null, arp: null, track: null, capture: null, sample: null })

export function newSection(name = 'Section', bars = 8, lanes: Partial<Record<SongLane, number | null>> = {}): SongSection {
  return { id: uid(), name, bars, lanes: { ...emptyLanes(), ...lanes }, vol: {}, volBars: 0, chordSteps: null, drumDensity: null }
}

export function newSong(name = 'New song'): Song {
  return { id: uid(), name, end: 'stop', fadeOut: 'rig', own: false, sections: [newSection('Intro', 8, { chord: 0 })] }
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
    fadeOut: 'rig',
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

// ── Clips in a section (pure) ────────────────────────────────────────────
/** The lane's clips in the section, in order, inside its bars (none listed: one over the whole section). */
export function laneClips(sec: SongSection, l: SongLane): SongClip[] {
  const own = sec.clips?.[l]
  if (!own) return sec.lanes[l] !== null ? [{ slot: sec.lanes[l] as number, start: 1, len: sec.bars }] : []
  return own
    .filter(c => c.start >= 1 && c.start <= sec.bars)
    .map(c => ({ ...c, len: Math.max(1, Math.min(c.len, sec.bars - c.start + 1)) }))
    .sort((a, b) => a.start - b.start)
}
/** The lane's clips placed by hand (not one over the whole section). */
export const hasOwnClips = (sec: SongSection, l: SongLane): boolean => !!sec.clips?.[l]
/** The clip playing on `bar` (1-based) and whether it starts there. */
export function clipAt(sec: SongSection, l: SongLane, bar: number): { clip: SongClip; starts: boolean } | null {
  for (const c of laneClips(sec, l)) if (bar >= c.start && bar < c.start + c.len) return { clip: c, starts: bar === c.start }
  return null
}
/** Each lane's slot on `bar` (null: silent) and the lanes whose clip starts there. */
export function lanesAt(sec: SongSection, bar: number): { lanes: Record<SongLane, number | null>; starts: SongLane[] } {
  const lanes = emptyLanes()
  const starts: SongLane[] = []
  for (const l of SONG_LANES) {
    const at = clipAt(sec, l, bar)
    lanes[l] = at ? at.clip.slot : null
    if (at?.starts) starts.push(l)
  }
  return { lanes, starts }
}
/** No two clips on the same bars: in order, each cut where the next starts; inside the section. */
export function normalizeClips(clips: SongClip[], bars: number): SongClip[] {
  const out: SongClip[] = []
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    const start = Math.max(1, Math.min(bars, Math.round(c.start)))
    let len = Math.max(1, Math.min(Math.round(c.len), bars - start + 1))
    const prev = out[out.length - 1]
    if (prev && prev.start + prev.len > start) {
      if (prev.start === start) continue
      prev.len = start - prev.start
    }
    out.push(c.presets && Object.keys(c.presets).length ? { slot: c.slot, start, len, presets: c.presets } : { slot: c.slot, start, len })
  }
  return out
}
/** Sets a lane's clips: one over the whole section (or none) goes back to the plain slot. */
export function setLaneClips(sec: SongSection, l: SongLane, clips: SongClip[]): void {
  const n = normalizeClips(clips, sec.bars)
  sec.lanes[l] = n[0]?.slot ?? null
  const plain = n.length === 0 || (n.length === 1 && n[0].start === 1 && n[0].len === sec.bars && !n[0].presets)
  if (plain) { if (sec.clips) { delete sec.clips[l]; if (!Object.keys(sec.clips).length) delete sec.clips } return }
  sec.clips = { ...(sec.clips ?? {}), [l]: n }
}
/** A section's length changed: its clips cut to it (those past its end gone). */
export function setSectionBars(sec: SongSection, bars: number): void {
  const before = Object.fromEntries(SONG_LANES.filter(l => sec.clips?.[l]).map(l => [l, laneClips({ ...sec, bars }, l)]))
  sec.bars = bars
  for (const [l, cs] of Object.entries(before)) setLaneClips(sec, l as SongLane, cs)
}
/** Would a clip at `start` for `len` bars fit on the lane (no other clip on those bars, but `skip`)? */
export function clipFits(sec: SongSection, l: SongLane, start: number, len: number, skip = -1): boolean {
  if (start < 1 || len < 1 || start + len - 1 > sec.bars) return false
  return laneClips(sec, l).every((c, i) => i === skip || start + len <= c.start || c.start + c.len <= start)
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

function parseAudio(raw: any): SongAudio {
  const a = emptyAudio()
  for (let i = 0; i < 8; i++) {
    const t = raw?.track?.[i]
    if (t && typeof t.id === 'string') a.track[i] = { id: t.id, label: String(t.label ?? 'Track'), bpm: Number.isFinite(t.bpm) ? t.bpm : null, duration: Number.isFinite(t.duration) ? t.duration : null, ...(t.retrigger === true ? { retrigger: true } : {}), ...(t.fit === 'varispeed' ? { fit: 'varispeed' } : {}) }
    const s = raw?.sample?.[i]
    if (s && typeof s.id === 'string') a.sample[i] = { id: s.id, name: String(s.name ?? 'Sample'), mode: s.mode === 'loop' ? 'loop' : 'oneshot' }
  }
  return a
}
/** A song's audio slots, made when first needed. */
export function songAudioOf(song: Song): SongAudio {
  if (!song.audio) song.audio = emptyAudio()
  return song.audio
}

function parsePresets(raw: unknown): ClipPresets | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: ClipPresets = {}
  for (const [k, v] of Object.entries(raw as Record<string, any>)) {
    if (!/\|\d+$/.test(k) || !v || typeof v !== 'object') continue
    if (!Number.isInteger(v.program) && !Array.isArray(v.msgs)) continue
    out[k] = v as PcChannelState
  }
  return Object.keys(out).length ? out : undefined
}

/** The same sound (what is sent for it): program, bank select, the messages. */
export function samePreset(a: PcChannelState | null | undefined, b: PcChannelState | null | undefined): boolean {
  if (!a || !b) return !a && !b
  const sig = (x: PcChannelState) => JSON.stringify([x.program ?? null, x.msb ?? 0, x.lsb ?? 0, x.engine ?? null, (x.msgs ?? []).map(m => m.slice(1))])
  return sig(a) === sig(b)
}

/** Save presets: `state` becomes the sound of the lane's clip starting on `start`, on channel `key` ('device|ch'). */
export function setClipPreset(sec: SongSection, l: SongLane, start: number, key: string, state: PcChannelState): boolean {
  const cs = laneClips(sec, l).map(c => ({ ...c }))
  const c = cs.find(x => x.start === start)
  if (!c) return false
  const { soundName, category, program, bank, msb, lsb, msgs, engine } = state
  c.presets = { ...(c.presets ?? {}), [key]: JSON.parse(JSON.stringify({ program, bank, soundName, category, msb, lsb, msgs, engine })) }
  setLaneClips(sec, l, cs)
  return true
}
/** The clip's preset (all of them) taken off. */
export function clearClipPresets(sec: SongSection, l: SongLane, start: number): void {
  const cs = laneClips(sec, l).map(c => ({ ...c }))
  const c = cs.find(x => x.start === start)
  if (!c?.presets) return
  delete c.presets
  setLaneClips(sec, l, cs)
}

/** The presets the song player just sent (so Save presets does not take them for the user's). */
const presetEcho = new Map<string, string>()
export function markPresetSent(key: string, state: PcChannelState): void { presetEcho.set(key, JSON.stringify(state)) }
export function isPresetEcho(key: string, state: PcChannelState | null | undefined): boolean {
  const e = presetEcho.get(key)
  if (e === undefined || !state) return false
  presetEcho.delete(key)
  return samePreset(JSON.parse(e), state)
}

function parseClips(raw: unknown, bars: number): SongSection['clips'] {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Partial<Record<SongLane, SongClip[]>> = {}
  for (const l of SONG_LANES) {
    const arr = (raw as any)[l]
    if (!Array.isArray(arr)) continue
    const ok = arr.filter((c: any) => slotOrNull(c?.slot) !== null && Number.isFinite(Number(c?.start)) && Number.isFinite(Number(c?.len)))
      .map((c: any) => ({ slot: c.slot, start: Number(c.start), len: Number(c.len), presets: parsePresets(c.presets) }))
    out[l] = normalizeClips(ok, bars)
  }
  return Object.keys(out).length ? out : undefined
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
    clips: parseClips(s?.clips, clampBars(s?.bars)),
    ...(okBpm(s?.bpm) ? { bpm: okBpm(s.bpm) } : {}),
  }))
  for (const sec of sections) {
    if (!sec.clips) { delete sec.clips; continue }
    for (const l of SONG_LANES) if (sec.clips[l]) sec.lanes[l] = sec.clips[l]![0]?.slot ?? null
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 40) : 'Song',
    end: raw.end === 'loop' || raw.end === 'stay' || raw.end === 'staySection' || raw.end === 'next' ? raw.end : 'stop',
    fadeOut: okFadeOut(raw.fadeOut),
    fadeIn: okFadeOut(raw.fadeIn),
    own: raw.own === true,
    ...(okBpm(raw.bpm) ? { bpm: okBpm(raw.bpm) } : {}),
    ...(raw.audio ? { audio: parseAudio(raw.audio) } : {}),
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

/** The library, one for the page: the Rig panel's Songs view and the AI Song Composer share it. */
let _lib: SongLibrary | null = null
export function songLibrary(): SongLibrary {
  return (_lib ??= reactive(loadSongs()) as SongLibrary)
}
/** A song added to the library (saved) and opened. */
export function addSong(song: Song): void {
  const lib = songLibrary()
  lib.songs.push(song)
  lib.currentId = song.id
  saveSongs(lib)
}

// ── From the AI Song Composer's plan ──────────────────────────────────────
/**
 * The song of an AI Song Composer plan, once loaded into the apps (applySongPlan): its sections
 * are slots A–H of the Chord Prog, the Drum Machine and the Sequencer (the letter of the plan's
 * section); the song plays them in the plan's form, each for its bars. A lane with nothing for that
 * section (no drum grid nor drum style, no sequence nor bass line) is silent there. Bass / Arp:
 * silent (the Sequencer's part goes to its Main lane). The caller gives it its own material (adoptApps).
 */
export function planToSong(plan: SongPlan): Song {
  const LETTERS = SONG_SLOTS as readonly string[]
  const byId = new Map(plan.sections.map(s => [s.id, s]))
  const sections = plan.form.map(id => byId.get(id)).filter(Boolean).slice(0, MAX_SECTIONS).map(sec => {
    const slot = LETTERS.indexOf(sec!.id)
    const drums = Object.keys(sec!.drums ?? {}).length > 0 || !!plan.style.drumStyle
    const seq = !!sec!.sequence || !!sec!.bass
    return newSection(sec!.name.slice(0, 24), clampBars(sec!.bars), { chord: slot, drum: drums ? slot : null, seq: seq ? slot : null })
  })
  if (!sections.length) sections.push(newSection('Intro', 8, { chord: 0 }))
  return { id: uid(), name: (plan.title || 'AI song').slice(0, 40), end: 'stop', fadeOut: 'rig', own: false, sections }
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
  /** Stop song with a fade-out: the lanes stop on this bar line (performance.now() ms); the section loops till then */
  outAt?: number | null
  /** the fade-out to the song's end has started */
  fading?: boolean
  /** End Next / a song picked while it plays: the song after it (its fade-out, the gap, then that one) */
  nextSongId?: string | null
  nextIndex?: number
  /** came in after another song: its fade-in on its first bar line */
  fadeInPending?: boolean
}

export type SongStep =
  | { kind: 'launch'; index: number } // launch that section now, to start on the next bar line
  | { kind: 'stop' }                  // stop every lane on the next bar line
  | { kind: 'stay' }                  // End Stay: the lanes stay on, the Chord holds its last chord
  | { kind: 'next' }                  // End Next: the session's next song, on the next bar line
  | { kind: 'done' }                  // the song is over
  | null

/** The song playing (the Rig panel's player runs it; the Session Browser shows it). */
export const songRun = ref<SongRun | null>(null)
/** A command for the Rig panel's player (the Session Browser's buttons): it takes it and clears it. */
export type SongCommand = { cmd: 'play'; index: number } | { cmd: 'stop' } | { cmd: 'pause' } | { cmd: 'resume' } | { cmd: 'preview'; index: number; lane: SongLane; start: number } | { cmd: 'previewStop' } | { cmd: 'hold'; on: boolean } | { cmd: 'jump'; index: number }
  | { cmd: 'mute'; lane: SongLane } | { cmd: 'solo'; lane: SongLane }
export const songCommand = ref<SongCommand | null>(null)
/** A clip playing on its own (the Session Browser's Preview, EDIT): its section, lane and start; null none. */
export const songPreview = ref<{ songId: string; index: number; lane: SongLane; start: number } | null>(null)
/** A song paused (Pause: the transport stopped, the song kept): Play goes on from its section. A Stop rewinds. */
export const songPaused = ref<{ songId: string; index: number } | null>(null)

/** Song gap (every song, not part of a song / session): between two songs (End Next, a song picked while one
 *  plays) — the song before fades out (its Out), these bars of silence, then the new one fades in (its In).
 *  0: the new one starts on the bar line the one before ends on. */
export const SONG_XFADE_OPTIONS = [0, 1, 2, 4] as const
const LS_XFADE = 'SYCORE_SONG_XFADE'
export const songXfadeBars = ref<number>((() => {
  try { const v = Number(localStorage.getItem(LS_XFADE) ?? 2); return (SONG_XFADE_OPTIONS as readonly number[]).includes(v) ? v : 2 } catch { return 2 }
})())
export function setSongXfade(bars: number): void {
  songXfadeBars.value = bars
  try { localStorage.setItem(LS_XFADE, String(bars)) } catch {}
}
/** The Rig's Mute / Solo per lane (live, not part of the song), as the Rig panel has them; {} while it is closed. */
export const rigLaneMutes = ref<Partial<Record<SongLane, { muted: boolean; solo: boolean }>>>({})

/** The MIDI channels each lane reaches ({ id, label, rows: [{ key: 'device|ch0', device, ch }] }), as the Rig
 *  last saw them (it is mounted only while open): the Session Browser sets the volumes per channel on them. */
export interface SongChannelRow { key: string; device: string; ch: number }
export interface SongChannelLane { id: string; label: string; rows: SongChannelRow[] }
const LS_CHANNELS = 'SYCORE_SONG_CHANNELS'
export const songChannels = ref<SongChannelLane[]>((() => {
  try { const v = JSON.parse(localStorage.getItem(LS_CHANNELS) ?? 'null'); return Array.isArray(v) ? v : [] } catch { return [] }
})())
export function setSongChannels(lanes: SongChannelLane[]): void {
  const next = lanes.map(l => ({ id: l.id, label: l.label, rows: l.rows.map(r => ({ key: r.key, device: r.device, ch: r.ch })) }))
  if (JSON.stringify(next) === JSON.stringify(songChannels.value)) return
  songChannels.value = next
  try { localStorage.setItem(LS_CHANNELS, JSON.stringify(next)) } catch {}
}

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
  if (!sec || run.hold || run.outAt || run.queued !== null || run.bar !== sec.bars) return null
  const next = nextSectionIndex(song, run.index)
  if (next === null && song.end === 'staySection') return null // the last section again, until stopped
  if (next === null && song.end === 'next') return { kind: 'next' } // the player picks the next song (or stops)
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
  run.outAt = null
  run.fading = false
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
/** The bars to the song's own end (End Stop), counting the bar now: only in its last section, not held; else null. */
export function barsToEnd(run: SongRun, song: Song): number | null {
  const sec = song.sections[run.index]
  if (!sec || (song.end !== 'stop' && song.end !== 'next') || run.hold || run.outAt || run.stopping || run.queued !== null || run.bar < 1) return null
  if (nextSectionIndex(song, run.index) !== null) return null
  return Math.max(0, sec.bars - run.bar + 1)
}

/** The fade-out bars of a song: its own, else the Rig's (the longest Out set there). */
export const songFadeBars = (song: Song, rigOut: number): number => (song.fadeOut === 'rig' ? Math.max(0, rigOut) : song.fadeOut)

/** Stop song with `bars` of fade: the bar line the lanes stop on, at least `bars` from `now` (the next one, at least). */
export function fadeStopLine(now: number, nextLine: number, barMs: number, bars: number): number {
  if (!(barMs > 0) || !(bars > 0)) return nextLine
  return nextLine + Math.max(0, Math.ceil((now + bars * barMs - nextLine) / barMs - 1e-6)) * barMs
}

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
