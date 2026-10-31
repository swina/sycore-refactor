// AI Song Composer — the song plan (docs/plans/ai-song-composer.md): what the AI returns for
// key + style + tempo, parsed and validated here before anything is loaded into Chord Prog /
// Drum Machine / Step Sequencer. Pure: no stores, no AI calls.
//
// validateSongPlan() repairs what it safely can (clamps, defaults, renamed drum tracks, padded
// grids, roman numerals → chord symbols) and reports every change as an issue; it gives up
// (plan null) only when nothing playable is left (no key, no section with chords).

import { DRUM_TRACK_LABELS, DRUM_STYLE_LIST, type DrumTrackLabel, type DrumStyleName } from '@/types/drum-machine'
import { NOTE_NAMES, parsePitchClass, parseMode, resolveChord, nonDiatonicTones, type ModeName } from './music-theory'
import { ARP_MODES, type ArpMode } from './arp-patterns'

export const SONG_MAX_SECTIONS = 8        // Chord Prog slots / Drum Machine sequences A–H
export const SONG_MAX_FORM = 16           // Chord Prog chain length (CHAIN_MAX)
export const SONG_MAX_CHORDS = 16         // Chord Prog steps per slot
export const SONG_GRID_STEPS = 16
export const SONG_SEQ_MAX_STEPS = 64      // Sequencer bank: up to 4 bars of 16ths
export const SONG_SEQ_NOTE_MIN = 24
export const SONG_SEQ_NOTE_MAX = 96
export const SONG_BPM_MIN = 40
export const SONG_BPM_MAX = 240
export const SECTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export type SectionId = typeof SECTION_IDS[number]

export type BassTone = 'root' | 'third' | 'fifth' | 'seventh' | 'octave'
const BASS_TONES: BassTone[] = ['root', 'third', 'fifth', 'seventh', 'octave']

export type ChordStrum = 'up' | 'down' | 'up-down' | 'down-up'
const CHORD_STRUMS: ChordStrum[] = ['up', 'down', 'up-down', 'down-up']
export const SONG_ARP_RATES = ['4n', '8n', '8t', '16n', '16t', '32n'] as const
export type SongArpRate = typeof SONG_ARP_RATES[number]

/**
 * One chord of a section's cycle. Besides its length, each chord may carry its own dynamics:
 * velocity (unset = the section's energy), chord / arp (unset = the section's playMode), strum
 * direction for a block chord, arp pattern and rate for an arpeggiated one.
 */
export interface SongChord {
  symbol: string
  beats: number
  velocity?: number
  mode?: 'chord' | 'arp'
  strum?: ChordStrum
  arpMode?: ArpMode
  arpRate?: SongArpRate
}

export type SeqRole = 'bass' | 'riff' | 'lead' | 'arp' | 'counter' | 'pad'
const SEQ_ROLES: SeqRole[] = ['bass', 'riff', 'lead', 'arp', 'counter', 'pad']

/** One Sequencer step: the MIDI notes (empty = rest), accented, how many following steps it holds. */
export interface SeqStep { notes: number[]; accent: boolean; hold: number }

/** A section's Sequencer part: one cycle (16–64 sixteenths), looped over the section. */
export interface SongSequence { role: SeqRole; steps: SeqStep[] }

export interface SongSection {
  id: SectionId
  name: string
  bars: number                                   // 4/4 bars
  energy: number                                 // 1 (sparse) .. 5 (full)
  chords: SongChord[]
  drums: Partial<Record<DrumTrackLabel, string>> // 16-step grids, see DRUM_GRID_CHARS
  bass?: { pattern: string; tones: BassTone[] }  // 16-step grid + the chord tones it cycles through (older plans; becomes a sequence)
  sequence?: SongSequence                        // the Sequencer's part (bass line, riff, lead…)
  sounds?: PartSounds                            // preset categories of this section (preset changes per section)
  playMode: 'chord' | 'arp'
}

export interface SongPlan {
  title: string
  key: { root: string; rootPc: number; mode: ModeName }
  bpm: number
  style: { summary: string; drumStyle?: DrumStyleName; swing?: number }   // swing 0-80 (Drum Machine's)
  sections: SongSection[]
  form: SectionId[]                              // play order (Chord Prog / Drum Machine chain)
  sounds: PartSounds & { bass?: string; lead?: string }     // preset categories for the whole song
}

/** Preset categories per part: chords = Chord Prog, seq = Sequencer */
export interface PartSounds { chords?: string; seq?: string }

export interface PlanIssue {
  path: string                                   // e.g. 'sections[1].chords[2]'
  message: string
  level: 'repaired' | 'warning' | 'error'        // error: that part was dropped
}

export interface ValidationResult { plan: SongPlan | null; issues: PlanIssue[] }

/** The JSON object in an AI answer (markdown fences and chatter around it are ignored). */
export function parseSongPlan(raw: string): { value: unknown; error?: string } {
  const text = raw.replace(/```(?:json)?/gi, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return { value: null, error: 'No JSON object in the answer' }
  try {
    return { value: JSON.parse(text.slice(start, end + 1)) }
  } catch (e: any) {
    return { value: null, error: `Invalid JSON: ${e?.message ?? e}` }
  }
}

// ── Drum track names: the model's wording → the Drum Machine's tracks ──────
const DRUM_ALIASES: Record<string, DrumTrackLabel> = {
  kick: 'Kick', bd: 'Kick', 'bass drum': 'Kick', 'kick drum': 'Kick',
  snare: 'Snare', sd: 'Snare', 'snare drum': 'Snare',
  'closed hh': 'Closed HH', hh: 'Closed HH', hihat: 'Closed HH', 'hi hat': 'Closed HH', 'closed hihat': 'Closed HH',
  'closed hi hat': 'Closed HH', 'closed hat': 'Closed HH', ch: 'Closed HH', hat: 'Closed HH', hats: 'Closed HH',
  'open hh': 'Open HH', 'open hihat': 'Open HH', 'open hi hat': 'Open HH', 'open hat': 'Open HH', oh: 'Open HH',
  clap: 'Clap', handclap: 'Clap', 'hand clap': 'Clap', cp: 'Clap',
  'tom 1': 'Tom 1', tom1: 'Tom 1', tom: 'Tom 1', 'high tom': 'Tom 1', 'low tom': 'Tom 1',
  'tom 2': 'Tom 2', tom2: 'Tom 2', 'floor tom': 'Tom 2',
  cymbal: 'Cymbal', crash: 'Cymbal', ride: 'Cymbal', 'crash cymbal': 'Cymbal',
  'rim shot': 'Rim Shot', rimshot: 'Rim Shot', rim: 'Rim Shot', 'side stick': 'Rim Shot',
  cowbell: 'Cowbell', tambourine: 'Tambourine', tamb: 'Tambourine',
}

export function drumLabelFor(name: string): DrumTrackLabel | null {
  const k = name.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ')
  return (DRUM_TRACK_LABELS as readonly string[]).find(l => l.toLowerCase() === k) as DrumTrackLabel | undefined
    ?? DRUM_ALIASES[k] ?? null
}

/**
 * A 16-step grid from a string ('x..x' / 'X' accent / '1' / '0' / '-'; spaces and bar lines
 * ignored) or an array (1 / 0 / true / 'x' / 'X'). Shorter grids repeat, longer ones are cut.
 * null when there's no step at all.
 */
export function normalizeGrid(v: unknown): { grid: string; changed: boolean } | null {
  let cells: string[]
  if (typeof v === 'string') cells = [...v.replace(/[\s|]/g, '')]
  else if (Array.isArray(v)) cells = v.map(c => (c === 'X' || c === 2 ? 'X' : c === true || c === 1 || c === 'x' || c === '1' ? 'x' : '.'))
  else return null
  cells = cells.map(c => (c === 'X' ? 'X' : c === 'x' || c === '1' || c === 'o' || c === '*' ? 'x' : '.'))
  if (!cells.length) return null
  const original = cells.join('')
  let out = cells
  if (out.length < SONG_GRID_STEPS && SONG_GRID_STEPS % out.length === 0) {
    out = Array.from({ length: SONG_GRID_STEPS }, (_, i) => cells[i % cells.length])
  } else if (out.length !== SONG_GRID_STEPS) {
    out = Array.from({ length: SONG_GRID_STEPS }, (_, i) => cells[i] ?? '.')
  }
  const grid = out.join('')
  return { grid, changed: grid !== original || (typeof v !== 'string') }
}

/**
 * A drum grid's cells (one per 16th), mapped onto the Drum Machine's step parameters:
 * 'X' accent · 'x' hit · 'o' soft hit · 'g' ghost note · '2' '3' '4' ratchet (that many quick
 * hits in the step) · '-' tie (holds the hit before it one more step) · '.' rest.
 */
export const DRUM_GRID_CHARS = 'Xxog234-.'
export const SONG_SWING_MAX = 80

/**
 * A drum grid, keeping its dynamics (see DRUM_GRID_CHARS); other hit marks ('1', '*', 'O'…) are
 * read as 'x'. Arrays: 0 / false rest, 1 / true hit, 2 accent, or the characters. Shorter grids
 * repeat, longer ones are cut; a tie with no hit before it is a rest.
 */
export function normalizeDrumGrid(v: unknown): { grid: string; changed: boolean } | null {
  let cells: string[]
  if (typeof v === 'string') cells = [...v.replace(/[\s|]/g, '')]
  else if (Array.isArray(v)) cells = v.map(c => (c === 2 ? 'X' : c === true || c === 1 ? 'x' : c === 0 || c === false || c == null ? '.' : String(c)))
  else return null
  if (!cells.length) return null
  const original = cells.join('')
  cells = cells.map(c => (DRUM_GRID_CHARS.includes(c) ? c : c === '_' || c === '~' ? '-' : c === '0' || c === ' ' ? '.' : c === 'G' ? 'g' : 'x'))
  let out = cells
  if (out.length < SONG_GRID_STEPS && SONG_GRID_STEPS % out.length === 0) {
    out = Array.from({ length: SONG_GRID_STEPS }, (_, i) => cells[i % cells.length])
  } else if (out.length !== SONG_GRID_STEPS) {
    out = Array.from({ length: SONG_GRID_STEPS }, (_, i) => cells[i] ?? '.')
  }
  for (let i = 0; i < out.length; i++) if (out[i] === '-' && (i === 0 || out[i - 1] === '.')) out[i] = '.'
  const grid = out.join('')
  return { grid, changed: grid !== original }
}

// ── Validation ────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The key from { root, mode }, 'A minor', 'Am', 'F#'… */
function readKey(v: unknown, issues: PlanIssue[]): SongPlan['key'] | null {
  let rootText: string | null = null
  let modeText: string | null = null
  if (isObj(v)) { rootText = typeof v.root === 'string' ? v.root : null; modeText = typeof v.mode === 'string' ? v.mode : null }
  else if (typeof v === 'string') {
    const m = /^\s*([A-Ga-g][#♯b♭]?)\s*(.*)$/.exec(v)
    if (m) { rootText = m[1]; modeText = m[2] || null }
  }
  if (!rootText) { issues.push({ path: 'key', message: 'Missing key root', level: 'error' }); return null }
  // 'Am' as the root: minor
  const rm = /^([A-Ga-g][#♯b♭]?)(m|min)?$/.exec(rootText.trim())
  const rootPc = rm ? parsePitchClass(rm[1]) : null
  if (rootPc == null) { issues.push({ path: 'key.root', message: `Unknown key root "${rootText}"`, level: 'error' }); return null }
  let mode: ModeName | null = modeText ? parseMode(modeText) : null
  if (!mode && rm?.[2]) mode = 'minor'
  if (!mode) {
    issues.push({ path: 'key.mode', message: modeText ? `Unknown mode "${modeText}": major used` : 'No mode: major used', level: 'repaired' })
    mode = 'major'
  }
  return { root: NOTE_NAMES[rootPc], rootPc, mode }
}

function readChords(v: unknown, path: string, key: SongPlan['key'], issues: PlanIssue[]): SongChord[] {
  if (!Array.isArray(v)) { issues.push({ path, message: 'No chords', level: 'error' }); return [] }
  const out: SongChord[] = []
  v.forEach((c, i) => {
    const p = `${path}[${i}]`
    const text = typeof c === 'string' ? c : isObj(c) ? (c.symbol ?? c.chord ?? c.name ?? c.roman) : null
    if (typeof text !== 'string') { issues.push({ path: p, message: 'Chord without a symbol: dropped', level: 'error' }); return }
    const chord = resolveChord(text, key.rootPc, key.mode)
    if (!chord) { issues.push({ path: p, message: `Unknown chord "${text}": dropped`, level: 'error' }); return }
    if (chord.symbol !== text.trim()) issues.push({ path: p, message: `"${text}" read as ${chord.symbol}`, level: 'repaired' })
    const out_of_key = nonDiatonicTones(chord, key.rootPc, key.mode)
    if (out_of_key.length) {
      issues.push({ path: p, message: `${chord.symbol} has notes outside ${key.root} ${key.mode} (${out_of_key.map(pc => NOTE_NAMES[pc]).join(', ')})`, level: 'warning' })
    }
    let beats = isObj(c) ? num(c.beats ?? c.duration) : null
    if (beats == null || beats <= 0) {
      if (isObj(c) && (c.beats ?? c.duration) != null) issues.push({ path: `${p}.beats`, message: 'Invalid beats: 4 used', level: 'repaired' })
      beats = 4
    }
    if (beats > 32) { issues.push({ path: `${p}.beats`, message: `${beats} beats: clamped to 32`, level: 'repaired' }); beats = 32 }
    const sc: SongChord = { symbol: chord.symbol, beats }
    if (isObj(c)) readChordDynamics(c, p, sc, issues)
    out.push(sc)
  })
  if (out.length > SONG_MAX_CHORDS) {
    issues.push({ path, message: `${out.length} chords: only the first ${SONG_MAX_CHORDS} kept`, level: 'repaired' })
    out.length = SONG_MAX_CHORDS
  }
  return out
}

function readChordDynamics(c: Record<string, any>, p: string, out: SongChord, issues: PlanIssue[]) {
  const vel = num(c.velocity ?? c.vel)
  if (vel != null) {
    // 0..1 is read as a fraction of 127
    const v = Math.round(clamp(vel > 0 && vel <= 1 ? vel * 127 : vel, 1, 127))
    if (v !== vel && !(vel > 0 && vel <= 1)) issues.push({ path: `${p}.velocity`, message: `Velocity ${vel} → ${v}`, level: 'repaired' })
    out.velocity = v
  }
  const mode = typeof c.mode === 'string' ? c.mode.trim().toLowerCase() : typeof c.playMode === 'string' ? c.playMode.trim().toLowerCase() : null
  if (mode === 'chord' || mode === 'arp') out.mode = mode
  else if (mode === 'arpeggio' || mode === 'arpeggiated') out.mode = 'arp'
  else if (mode != null) issues.push({ path: `${p}.mode`, message: `Unknown mode "${mode}": the section's used`, level: 'repaired' })
  const strum = typeof c.strum === 'string' ? c.strum.trim().toLowerCase() : null
  if (strum != null) {
    if ((CHORD_STRUMS as string[]).includes(strum)) out.strum = strum as ChordStrum
    else if (strum !== 'none' && strum !== 'off') issues.push({ path: `${p}.strum`, message: `Unknown strum "${strum}": ignored`, level: 'repaired' })
  }
  const am = typeof c.arpMode === 'string' ? c.arpMode.trim().toLowerCase() : null
  if (am != null) {
    if ((ARP_MODES as readonly string[]).includes(am)) out.arpMode = am as ArpMode
    else issues.push({ path: `${p}.arpMode`, message: `Unknown arp mode "${am}": ignored`, level: 'repaired' })
  }
  const ar = typeof c.arpRate === 'string' ? c.arpRate.trim() : null
  if (ar != null) {
    if ((SONG_ARP_RATES as readonly string[]).includes(ar)) out.arpRate = ar as SongArpRate
    else issues.push({ path: `${p}.arpRate`, message: `Unknown arp rate "${ar}": ignored`, level: 'repaired' })
  }
}

/** 'C4' = 60, 'F#2', 'Bb3'; null when not a note name with an octave. */
export function parseNoteName(text: string): number | null {
  const m = /^([A-Ga-g][#♯b♭]?)(-?\d)$/.exec(text.trim())
  if (!m) return null
  const pc = parsePitchClass(m[1])
  if (pc == null) return null
  return (Number(m[2]) + 1) * 12 + pc
}

/**
 * A Sequencer part: { role, steps: [ 'A2' | 'A2!' (accent) | 'C3+E3' (several notes) | '.' rest |
 * '-' hold the previous note ] }, one item per 16th (a string with spaces between items works too).
 * The length is padded to a multiple of 16 (max 64); notes are clamped to a playable range.
 */
function readSequence(v: unknown, path: string, issues: PlanIssue[]): SongSequence | undefined {
  if (v == null) return undefined
  if (!isObj(v)) { issues.push({ path, message: 'Sequence is not an object: ignored', level: 'error' }); return undefined }
  const roleText = typeof v.role === 'string' ? v.role.trim().toLowerCase() : ''
  const role: SeqRole = (SEQ_ROLES as string[]).includes(roleText) ? roleText as SeqRole : 'riff'
  if (roleText && role !== roleText) issues.push({ path: `${path}.role`, message: `Unknown role "${roleText}": riff`, level: 'repaired' })
  const raw = v.steps ?? v.notes ?? v.pattern
  const items: string[] = Array.isArray(raw) ? raw.map(x => (x == null ? '.' : String(x))) : typeof raw === 'string' ? raw.trim().split(/[\s|,]+/) : []
  if (!items.length) { issues.push({ path: `${path}.steps`, message: 'No steps: sequence dropped', level: 'error' }); return undefined }
  let bad = 0
  let clamped = false
  const steps: SeqStep[] = []
  for (const item of items.slice(0, SONG_SEQ_MAX_STEPS)) {
    const t = item.trim()
    if (t === '-' || t === '~' || t === '_') {
      const prev = [...steps].reverse().find(s => s.notes.length)
      const last = steps[steps.length - 1]
      // a hold extends the note it follows (through earlier holds); after a rest it's a rest
      if (prev && last && (last.notes.length || last.hold < 0)) { prev.hold++; steps.push({ notes: [], accent: false, hold: -1 }); continue }
      steps.push({ notes: [], accent: false, hold: 0 }); continue
    }
    if (t === '.' || t === '' || t === '0' || t.toLowerCase() === 'rest' || t.toLowerCase() === 'r') { steps.push({ notes: [], accent: false, hold: 0 }); continue }
    const accent = t.endsWith('!')
    const notes: number[] = []
    for (const part of t.replace(/!$/, '').split('+')) {
      let n = parseNoteName(part)
      if (n == null) { bad++; continue }
      if (n < SONG_SEQ_NOTE_MIN || n > SONG_SEQ_NOTE_MAX) { clamped = true; while (n < SONG_SEQ_NOTE_MIN) n += 12; while (n > SONG_SEQ_NOTE_MAX) n -= 12 }
      if (!notes.includes(n)) notes.push(n)
    }
    steps.push({ notes, accent: accent && notes.length > 0, hold: 0 })
  }
  // hold markers were placeholders (-1): plain rests from here on
  steps.forEach(s => { if (s.hold < 0) s.hold = 0 })
  if (bad) issues.push({ path: `${path}.steps`, message: `${bad} unreadable note(s) played as rests`, level: 'repaired' })
  if (clamped) issues.push({ path: `${path}.steps`, message: 'Notes moved by octaves into range', level: 'repaired' })
  if (items.length > SONG_SEQ_MAX_STEPS) issues.push({ path: `${path}.steps`, message: `${items.length} steps: only the first ${SONG_SEQ_MAX_STEPS} kept`, level: 'repaired' })
  if (!steps.some(s => s.notes.length)) { issues.push({ path: `${path}.steps`, message: 'No notes: sequence dropped', level: 'error' }); return undefined }
  const len = Math.min(SONG_SEQ_MAX_STEPS, Math.ceil(steps.length / SONG_GRID_STEPS) * SONG_GRID_STEPS)
  if (len !== steps.length) {
    issues.push({ path: `${path}.steps`, message: `${steps.length} steps padded to ${len}`, level: 'repaired' })
    while (steps.length < len) steps.push({ notes: [], accent: false, hold: 0 })
  }
  // a hold can't run past the end of the cycle
  steps.forEach((s, i) => { s.hold = Math.min(s.hold, steps.length - 1 - i) })
  return { role, steps }
}

function readPartSounds(v: unknown): PartSounds | undefined {
  if (!isObj(v)) return undefined
  const out: PartSounds = {}
  const pick = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined)
  const chords = pick(v.chords ?? v.chord)
  const seq = pick(v.seq ?? v.sequence ?? v.sequencer)
  if (chords) out.chords = chords
  if (seq) out.seq = seq
  return chords || seq ? out : undefined
}

function readDrums(v: unknown, path: string, issues: PlanIssue[]): SongSection['drums'] {
  const drums: SongSection['drums'] = {}
  if (v == null) return drums
  if (!isObj(v)) { issues.push({ path, message: 'Drums are not an object: ignored', level: 'error' }); return drums }
  for (const [name, grid] of Object.entries(v)) {
    const p = `${path}.${name}`
    const label = drumLabelFor(name)
    if (!label) { issues.push({ path: p, message: `Unknown drum track "${name}": dropped`, level: 'error' }); continue }
    if (label !== name) issues.push({ path: p, message: `"${name}" → ${label}`, level: 'repaired' })
    const g = normalizeDrumGrid(grid)
    if (!g || !/[Xxog234]/.test(g.grid)) { issues.push({ path: p, message: 'No hits: dropped', level: 'error' }); continue }
    if (g.changed) issues.push({ path: p, message: `Grid normalized to ${SONG_GRID_STEPS} steps`, level: 'repaired' })
    if (drums[label]) issues.push({ path: p, message: `${label} given twice: the last one kept`, level: 'repaired' })
    drums[label] = g.grid
  }
  return drums
}

function readBass(v: unknown, path: string, issues: PlanIssue[]): SongSection['bass'] | undefined {
  if (v == null) return undefined
  if (!isObj(v)) { issues.push({ path, message: 'Bass is not an object: ignored', level: 'error' }); return undefined }
  const g = normalizeGrid(v.pattern)
  if (!g) { issues.push({ path: `${path}.pattern`, message: 'No bass pattern: bass dropped', level: 'error' }); return undefined }
  if (g.changed) issues.push({ path: `${path}.pattern`, message: `Grid normalized to ${SONG_GRID_STEPS} steps`, level: 'repaired' })
  const raw = v.tones ?? v.notes
  const words: string[] = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[|,\s/]+/) : []
  const tones = words.map(w => w.trim().toLowerCase()).filter((w): w is BassTone => (BASS_TONES as string[]).includes(w))
  if (words.length && tones.length !== words.length) issues.push({ path: `${path}.tones`, message: 'Unknown bass tones dropped', level: 'repaired' })
  return { pattern: g.grid, tones: tones.length ? tones : ['root'] }
}

/**
 * Checks and repairs an AI song plan. Sections keep their order and get the ids A–H by position;
 * the form may name them by their original id or their name. See PlanIssue for what's reported.
 */
export function validateSongPlan(input: unknown): ValidationResult {
  const issues: PlanIssue[] = []
  if (!isObj(input)) return { plan: null, issues: [{ path: '', message: 'The plan is not an object', level: 'error' }] }

  const key = readKey(input.key, issues)
  if (!key) return { plan: null, issues }

  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Untitled'

  let bpm = num(input.bpm ?? input.tempo)
  if (bpm == null) { issues.push({ path: 'bpm', message: 'No tempo: 120 BPM used', level: 'repaired' }); bpm = 120 }
  const bpmOk = Math.round(clamp(bpm, SONG_BPM_MIN, SONG_BPM_MAX))
  if (bpmOk !== bpm) issues.push({ path: 'bpm', message: `${bpm} BPM → ${bpmOk}`, level: 'repaired' })

  const styleIn = isObj(input.style) ? input.style : { summary: typeof input.style === 'string' ? input.style : '' }
  const style: SongPlan['style'] = { summary: typeof styleIn.summary === 'string' ? styleIn.summary : '' }
  if (styleIn.drumStyle != null) {
    const ds = DRUM_STYLE_LIST.find(s => s.toLowerCase().replace(/[^a-z]/g, '') === String(styleIn.drumStyle).toLowerCase().replace(/[^a-z]/g, ''))
    if (ds) style.drumStyle = ds
    else issues.push({ path: 'style.drumStyle', message: `Unknown drum style "${styleIn.drumStyle}": ignored`, level: 'repaired' })
  }
  const swing = num(styleIn.swing ?? input.swing)
  if (swing != null) {
    // 0..1 read as a fraction of the maximum
    const sw = Math.round(clamp(swing > 0 && swing < 1 ? swing * SONG_SWING_MAX : swing, 0, SONG_SWING_MAX))
    if (sw !== swing && !(swing > 0 && swing < 1)) issues.push({ path: 'style.swing', message: `Swing ${swing} → ${sw}`, level: 'repaired' })
    style.swing = sw
  }

  // sections
  const rawSections: unknown[] = Array.isArray(input.sections) ? input.sections : []
  if (rawSections.length > SONG_MAX_SECTIONS) {
    issues.push({ path: 'sections', message: `${rawSections.length} sections: only the first ${SONG_MAX_SECTIONS} kept`, level: 'repaired' })
  }
  const sections: SongSection[] = []
  const refToId = new Map<string, SectionId>()      // original id / name (lower case) → new id
  rawSections.slice(0, SONG_MAX_SECTIONS).forEach((s, i) => {
    const p = `sections[${i}]`
    if (!isObj(s)) { issues.push({ path: p, message: 'Not an object: dropped', level: 'error' }); return }
    const chords = readChords(s.chords, `${p}.chords`, key, issues)
    if (!chords.length) { issues.push({ path: p, message: 'No usable chords: section dropped', level: 'error' }); return }
    const id = SECTION_IDS[sections.length]
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `Section ${id}`
    let bars = num(s.bars)
    if (bars == null || bars < 1) { bars = Math.max(1, Math.ceil(chords.reduce((t, c) => t + c.beats, 0) / 4)); issues.push({ path: `${p}.bars`, message: `No bars: ${bars} (from the chords)`, level: 'repaired' }) }
    bars = Math.round(clamp(bars, 1, 64))
    let energy = num(s.energy)
    if (energy == null) energy = 3
    energy = Math.round(clamp(energy, 1, 5))
    const playMode = s.playMode === 'arp' ? 'arp' : 'chord'
    const beats = chords.reduce((t, c) => t + c.beats, 0)
    if (beats > bars * 4) issues.push({ path: `${p}.chords`, message: `Chords last ${beats} beats, the section ${bars * 4}`, level: 'warning' })
    const section: SongSection = {
      id, name, bars, energy, chords, playMode,
      drums: readDrums(s.drums, `${p}.drums`, issues),
    }
    const bass = readBass(s.bass, `${p}.bass`, issues)
    if (bass) section.bass = bass
    const sequence = readSequence(s.sequence ?? s.seq, `${p}.sequence`, issues)
    if (sequence) section.sequence = sequence
    const ps = readPartSounds(s.sounds)
    if (ps) section.sounds = ps
    sections.push(section)
    if (typeof s.id === 'string' && s.id.trim()) refToId.set(s.id.trim().toLowerCase(), id)
    refToId.set(name.toLowerCase(), id)
    refToId.set(id.toLowerCase(), refToId.get(id.toLowerCase()) ?? id)
  })
  if (!sections.length) {
    issues.push({ path: 'sections', message: 'No playable section', level: 'error' })
    return { plan: null, issues }
  }

  // form
  const rawForm: unknown[] = Array.isArray(input.form) ? input.form : []
  const form: SectionId[] = []
  rawForm.forEach((ref, i) => {
    const id = typeof ref === 'string' ? refToId.get(ref.trim().toLowerCase()) : undefined
    if (!id) { issues.push({ path: `form[${i}]`, message: `Unknown section "${String(ref)}": dropped`, level: 'repaired' }); return }
    form.push(id)
  })
  if (form.length > SONG_MAX_FORM) {
    issues.push({ path: 'form', message: `${form.length} parts: only the first ${SONG_MAX_FORM} kept`, level: 'repaired' })
    form.length = SONG_MAX_FORM
  }
  if (!form.length) {
    issues.push({ path: 'form', message: 'No form: the sections in order', level: 'repaired' })
    form.push(...sections.map(s => s.id))
  }

  const soundsIn = isObj(input.sounds) ? input.sounds : {}
  const sounds: SongPlan['sounds'] = {}
  for (const part of ['chords', 'seq', 'bass', 'lead'] as const) {
    if (typeof soundsIn[part] === 'string' && soundsIn[part].trim()) sounds[part] = soundsIn[part].trim()
  }

  return { plan: { title, key, bpm: bpmOk, style, sections, form, sounds }, issues }
}
