// AI Song Composer, phase 2 (docs/plans/ai-song-composer.md): key + style + tempo → the AI writes a
// song plan (lib/song-plan.ts) → it is turned into Chord Prog slots + chain, Drum Machine
// sequences and Sequencer banks, and the tempo is set. The Chord Prog chain conducts the song
// form; the Drum Machine and the Sequencer follow it (useChordProgStore.drumFollow → one bar
// before each section ends, 'dm-seq-switch' and 'seq-bank-cue' for the next section).
//
//   composeSong()     prompt → AI → parse → validate (one retry with the problems found)
//   songToModules()   pure: plan → Chord Prog slots / chain, Drum Machine grids
//   applySongPlan()   loads it into the stores; returns a snapshot for undoSongPlan()

import { sendAiPrompt } from '@/lib/ai-service'
import { userKey } from '@/lib/userKey'
import type { AiServiceResult } from '@/types/ai'
import { useAiAgentStore } from '@/stores/useAiAgentStore'
import { useChordProgStore, DEFAULT_CHORD_STEP, type ChordStep, type PlayMode, type DurationOption } from '@/stores/useChordProgStore'
import { useDrumMachineStore } from '@/stores/useDrumMachineStore'
import { useMidiStore } from '@/stores/useMidiStore'
import { useArpStore } from '@/stores/useArpStore'
import { useStepSequencerStore, DEFAULT_STEP } from '@/stores/useStepSequencerStore'
import { MidiSource } from '@/core/midi/midi-service'
import { dispatch } from '@/types/events'
import { knownDeviceCategories } from '@/lib/pc-browse'
import { DRUM_TRACK_LABELS, DRUM_STYLE_LIST, type DrumStep, type DrumStyleName } from '@/types/drum-machine'
import { parseChordSymbol, voiceLead, beatsToDuration, DURATION_BEATS, NOTE_NAMES, type ModeName, type ParsedChord } from './music-theory'
import {
  parseSongPlan, validateSongPlan, SONG_MAX_SECTIONS, SONG_MAX_FORM, SONG_MAX_CHORDS, SONG_GRID_STEPS,
  SONG_BPM_MIN, SONG_BPM_MAX, SONG_SEQ_MAX_STEPS, SONG_SWING_MAX, SECTION_IDS, SONG_ARP_RATES,
  type SongPlan, type SongSection, type SongSequence, type PlanIssue, type SectionId, type BassTone, type PartSounds,
} from './song-plan'

export interface ComposeInput {
  root: string                // 'A', 'F#', 'Bb'
  mode: ModeName
  style: string               // free text: genre, artist, mood
  bpm: number
  bars?: number               // rough song length, default 32
  presets?: PresetMode        // default 'keep'
  chordsMode?: ChordsMode     // default 'chord'
  /** The preset categories of the devices the parts play on (from the Program Change panel) */
  categories?: { chords?: string[]; seq?: string[] }
}

/**
 * What the song does to the instruments' presets: 'keep' leaves them alone; 'once' picks one
 * preset per part (Chord Prog, Sequencer) at Load; 'section' also changes them at each section
 * (Chord Prog chain with Follow on). A preset is the first one of the chosen category in the bank
 * open in the Program Change panel for the device the part plays on.
 */
export type PresetMode = 'keep' | 'once' | 'section'

/**
 * How the Chord Prog plays the song's chords: 'chord' block chords only (strums allowed) — the
 * default, since the Sequencer or an instrument's own arpeggiator often moves already; 'arp' all
 * arpeggiated; 'mixed' as the AI wrote it, per section and per chord.
 */
export type ChordsMode = 'chord' | 'arp' | 'mixed'

export interface ComposeResult {
  plan: SongPlan | null
  issues: PlanIssue[]
  raw: string                 // the last AI answer (for debugging / display)
  error?: string
}

/** (system, user) → AI answer; the default uses the AI Agent settings. Injected in tests. */
export type AiSend = (system: string, user: string) => Promise<AiServiceResult>

const MAX_TOKENS = 6000

export function defaultAiSend(): AiSend | null {
  const ai = useAiAgentStore()
  if (!ai.isConfigured) return null
  return (system, user) => sendAiPrompt(ai.selectedProvider, ai.endpoint, ai.model, ai.apiKey, system, user, undefined, { maxTokens: MAX_TOKENS, temperature: 0.8 })
}

// ── Prompt ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<ModeName, string> = {
  major: 'major', minor: 'natural minor', dorian: 'dorian', phrygian: 'phrygian', lydian: 'lydian',
  mixolydian: 'mixolydian', locrian: 'locrian', harmonicMinor: 'harmonic minor',
}

const catList = (cats: string[] | undefined) => (cats?.length ? `one of ${cats.slice(0, 60).map(c => `"${c}"`).join(', ')}` : 'a preset category like "Pad", "Keys", "Strings", "Bass", "Lead", "Pluck", "Brass"')

function soundsSchema(input: ComposeInput): string[] {
  const mode = input.presets ?? 'keep'
  const chords = catList(input.categories?.chords)
  const seq = catList(input.categories?.seq)
  const lines = [`  "sounds": { "chords": the Chord Prog's sound, ${chords}; "seq": the sequencer part's sound, ${seq} }`]
  if (mode === 'section') {
    lines.push(`  (and in each section, optional "sounds": { "chords": ..., "seq": ... } with the same choices, when that section should sound different — e.g. a sparse intro on a pad, the chorus on strings; a section without it uses the song's "sounds")`)
  }
  return lines
}

function chordsModeRule(mode: ChordsMode): string {
  if (mode === 'chord') return '- The chords are played as block chords only: every section "playMode": "chord" and every chord "mode": "chord" (a "strum" is fine, no arpeggios); the movement comes from the sequence and the chord rhythm.'
  if (mode === 'arp') return '- The chords are played arpeggiated: every section "playMode": "arp"; vary "arpMode" and "arpRate" between chords and sections.'
  return '- Mix block chords and arpeggios where the style allows (per section "playMode", per chord "mode").'
}

export function buildSongPrompt(input: ComposeInput): { system: string; user: string } {
  const system = [
    'You are a songwriter and arranger. You write the plan of a song for a hardware/MIDI studio: harmony, form, drum grooves and a melodic sequencer part, as JSON.',
    'Answer with ONE JSON object only: no markdown fences, no comments, no text before or after it.',
    '',
    'Schema:',
    '{',
    '  "title": string,',
    '  "key": { "root": "C".."B" (sharps or flats), "mode": "major" | "minor" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "locrian" | "harmonic minor" },',
    `  "bpm": number (${SONG_BPM_MIN}-${SONG_BPM_MAX}),`,
    `  "style": { "summary": string (one sentence: the harmony, groove and sound palette you chose), "drumStyle": one of ${DRUM_STYLE_LIST.map(s => `"${s}"`).join(', ')}, "swing": 0 (straight) to ${SONG_SWING_MAX} (heavy shuffle of the 16th offbeats) },`,
    `  "sections": [ up to ${SONG_MAX_SECTIONS} distinct sections, each:`,
    '    {',
    '      "id": short id ("intro", "verse", "chorus"...), "name": string,',
    '      "bars": number of 4/4 bars,',
    '      "energy": 1 (sparse) to 5 (full),',
    `      "chords": [ up to ${SONG_MAX_CHORDS} items — one cycle of the section's progression, repeated to fill the bars:`,
    '        { "symbol": chord symbol like "Am7", "Fmaj7", "G/B", "Dsus4", "E7",',
    '          "beats": quarter notes, one of 0.5, 1, 1.5, 2, 3, 4, 8, 16,',
    '          "velocity": 1-127,',
    '          "mode": "chord" (block) or "arp" (arpeggiated) — may differ from the section\'s playMode,',
    '          "strum": optional, for block chords: "up" | "down" | "up-down" | "down-up",',
    `          "arpMode": optional, for arp chords: ${['up', 'down', 'up-down', 'converge', 'diverge', 'random'].map(m => `"${m}"`).join(' | ')},`,
    `          "arpRate": optional, for arp chords: ${SONG_ARP_RATES.map(r => `"${r}"`).join(' | ')} } ],`,
    `      "drums": { track: ${SONG_GRID_STEPS}-character grid of one 4/4 bar in 16th notes } with tracks among ${DRUM_TRACK_LABELS.map(l => `"${l}"`).join(', ')} — omit tracks that don't play.`,
    '        Grid characters: "X" accent, "x" hit, "o" soft hit, "g" ghost note, "2" / "3" / "4" ratchet (2-4 quick hits in that 16th, e.g. hi-hat rolls, trap hats), "-" holds the previous hit one more 16th (open hats, cymbals), "." rest,',
    `      "sequence": the sequencer part of the section (a bass line, riff, lead, arp or counter-melody): { "role": "bass" | "riff" | "lead" | "arp" | "counter", "steps": [ one item per 16th note, 16 to ${SONG_SEQ_MAX_STEPS} items covering one chord cycle (16 = 1 bar): a note with octave like "A2", "C#4" (C4 = middle C), "A2!" accented, "C3+E3" two notes, "." rest, "-" holds the previous note ] },`,
    '      "playMode": "chord" (block chords) or "arp" (arpeggiated)',
    '    }',
    '  ],',
    `  "form": [ the sections' ids in play order, up to ${SONG_MAX_FORM} entries; a section may repeat ],`,
    ...soundsSchema(input),
    '}',
    '',
    'Rules:',
    '- Stay in the requested key and mode; borrowed or secondary-dominant chords are fine when the style uses them.',
    "- A section's chord beats should add up to its bars × 4, or divide it (the cycle repeats).",
    '- Make sections contrast: intro and breakdown sparser (lower energy, fewer drum tracks), chorus fuller.',
    '- Drum grooves must fit the style and tempo; vary them between sections (fills are not needed).',
    '- Write the grooves like a drummer, not a grid: accents where the style puts them, ghost notes on the snare in funk / hip hop / jazz, softer and louder hats (mix "x", "o", "g"), ratchets for rolls where the style uses them, open hats held with "-"; set "swing" for shuffled styles (house, hip hop, funk, jazz often 10-40, straight techno / rock 0).',
    "- Give the harmony movement and dynamics, it must not sound flat: vary chord lengths (pushes, short passing chords, long held ones), shape velocities (strong downbeats, softer passing chords, crescendos into the chorus).",
    chordsModeRule(input.chordsMode ?? 'chord'),
    "- The sequence follows the section's chords (its notes fit the chord playing at that 16th) and has its own rhythm; its steps should cover the whole chord cycle (up to 4 bars). Bass parts in octaves 1-3, riffs and leads in 3-5.",
    '- When an artist is named, write in their style (harmony, groove, tempo feel, sound palette) without copying their songs.',
  ].join('\n')
  const user = [
    `Key: ${input.root} ${MODE_LABEL[input.mode]}.`,
    `Style: ${input.style.trim() || 'any'}.`,
    `Tempo: ${Math.round(input.bpm)} BPM.`,
    `Length: about ${input.bars ?? 32} bars in total.`,
  ].join('\n')
  return { system, user }
}

/**
 * Asks the AI for a song plan and validates it. If the first answer is unusable (no JSON, or no
 * playable section), asks once more with the problems found.
 */
export async function composeSong(input: ComposeInput, send: AiSend | null = defaultAiSend()): Promise<ComposeResult> {
  if (!send) return { plan: null, issues: [], raw: '', error: 'AI not configured: set a provider and model in AI Settings' }
  const { system, user } = buildSongPrompt(input)

  let raw = ''
  let lastError = ''
  let lastIssues: PlanIssue[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? user : [
      user, '',
      'Your previous answer could not be used:',
      lastError || lastIssues.filter(i => i.level === 'error').map(i => `- ${i.path}: ${i.message}`).join('\n'),
      'Answer again with the complete, corrected JSON object only.',
    ].join('\n')
    const res = await send(system, prompt)
    if (!res.success || !res.data) return { plan: null, issues: lastIssues, raw, error: res.error || 'Empty answer from the AI' }
    raw = res.data
    const parsed = parseSongPlan(raw)
    if (parsed.error) { lastError = parsed.error; lastIssues = []; continue }
    const v = validateSongPlan(parsed.value)
    if (v.plan) return { plan: v.plan, issues: v.issues, raw }
    lastError = ''
    lastIssues = v.issues
  }
  return { plan: null, issues: lastIssues, raw, error: lastError || 'The AI plan has no playable section' }
}

// ── Plan → modules ────────────────────────────────────────────────────────

export interface ChordSlotData { steps: ChordStep[]; numSteps: number; playMode: PlayMode; arpRate: DurationOption }

/** A Sequencer bank's steps (the store's step shape) */
export type SeqBankStep = typeof DEFAULT_STEP & { explicitNotes?: boolean }
export interface SeqBankData { numSteps: number; steps: SeqBankStep[]; role: SongSequence['role'] }

export interface ModulesData {
  chordSlots: ChordSlotData[]                                // one per section, in section order (slot i = section i)
  seqBanks: Partial<Record<SectionId, SeqBankData | null>>   // per section: Sequencer bank with the same letter; null = no part
  chain: number[]                                            // Chord Prog chain (16 entries, -1 empty)
  drums: Partial<Record<SectionId, DrumStep[][] | null>>     // per section: rows in DRUM_TRACK_LABELS order; null = no grid given
  issues: PlanIssue[]
}

const CHORD_CENTER = 60

function emptyDrumStep(): DrumStep { return { active: false, velocity: 100, accent: false, ratchet: 1, tie: 0 } }

/**
 * A drum grid (song-plan DRUM_GRID_CHARS) as Drum Machine steps. The velocity comes from the cell
 * (accent / hit / soft / ghost) and the section's energy, shaped by where the hit falls (on the
 * beat a little louder, on the 16th in between softer) and varied a little, the same way every
 * time (`seed`), so plain 'x' grids don't play like a machine gun.
 */
export function drumGridToSteps(grid: string | undefined, energy: number, seed = 0): DrumStep[] {
  const base = 80 + energy * 8                            // 88..120
  const steps = Array.from({ length: SONG_GRID_STEPS }, () => emptyDrumStep())
  if (!grid) return steps
  let last = -1
  for (let i = 0; i < SONG_GRID_STEPS; i++) {
    const c = grid[i] ?? '.'
    if (c === '.') { last = -1; continue }
    if (c === '-') { if (last >= 0) steps[last].tie++; continue }
    const metric = i % 4 === 0 ? 6 : i % 2 === 0 ? 0 : -8
    const jitter = ((((seed + 1) * 7919 + i * 104729) % 9) - 4)   // -4..4, fixed per track / step
    let vel: number
    if (c === 'X') vel = base + 15
    else if (c === 'o') vel = base * 0.65 + metric / 2
    else if (c === 'g') vel = base * 0.38
    else vel = base + metric
    steps[i] = {
      ...emptyDrumStep(), active: true, accent: c === 'X',
      velocity: Math.round(Math.max(20, Math.min(127, vel + jitter))),
      ratchet: c === '2' || c === '3' || c === '4' ? Number(c) : 1,
    }
    last = i
  }
  return steps
}

const BASS_LOW = 36   // C2: the bass tones are placed in C2..B2

/** The semitones above the root of a bass tone of a chord */
function bassToneInterval(c: ParsedChord, tone: BassTone): number {
  const has = (i: number) => c.intervals.includes(i)
  switch (tone) {
    case 'root': return 0
    case 'third': return has(3) ? 3 : has(4) ? 4 : has(5) ? 5 : has(2) ? 2 : 0
    case 'fifth': return has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7
    case 'seventh': return has(10) ? 10 : has(11) ? 11 : has(9) ? 9 : 12
    case 'octave': return 12
  }
}

/**
 * An older plan's bass ({ pattern, tones }) as a sequence: over one chord cycle (up to 4 bars),
 * each hit of the one-bar pattern plays the next tone of the chord sounding at that 16th.
 */
export function bassToSequence(sec: SongSection, cycle: Array<{ symbol: string; beats: number }>): SongSequence | null {
  if (!sec.bass) return null
  const cycleBeats = cycle.reduce((t, c) => t + c.beats, 0)
  const len = Math.min(SONG_SEQ_MAX_STEPS, Math.max(SONG_GRID_STEPS, Math.ceil((cycleBeats * 4) / SONG_GRID_STEPS) * SONG_GRID_STEPS))
  const chordAt = (beat: number) => {
    let t = 0
    for (const c of cycle) { t += c.beats; if (beat < t) return c }
    return cycle[cycle.length - 1]
  }
  let k = 0
  const steps = Array.from({ length: len }, (_, i) => {
    const cell = sec.bass!.pattern[i % SONG_GRID_STEPS]
    if (cell === '.') return { notes: [], accent: false, hold: 0 }
    const c = parseChordSymbol(chordAt((i / 4) % cycleBeats).symbol)!
    const tone = sec.bass!.tones[k++ % sec.bass!.tones.length]
    const rootPc = tone === 'root' && c.bassPc != null ? c.bassPc : c.rootPc
    const note = BASS_LOW + rootPc + (tone === 'root' && c.bassPc != null ? 0 : bassToneInterval(c, tone))
    return { notes: [note], accent: cell === 'X', hold: 0 }
  })
  return { role: 'bass', steps }
}

/** A sequence as a Sequencer bank (velocity from the section's energy, accents louder). */
export function sequenceToBank(seq: SongSequence, energy: number): SeqBankData {
  const base = 70 + energy * 8
  const steps = seq.steps.map(st => (st.notes.length
    ? { ...DEFAULT_STEP, active: true, notes: [...st.notes], velocity: Math.min(127, st.accent ? base + 20 : base), gate: st.hold ? 95 : 80, tieSteps: st.hold, edited: true, explicitNotes: true }
    : { ...DEFAULT_STEP, notes: [60] }))
  return { numSteps: steps.length, steps, role: seq.role }
}

/** The plan as Chord Prog slots + chain and Drum Machine rows. Pure. */
export function songToModules(plan: SongPlan, opts: { chordsMode?: ChordsMode } = {}): ModulesData {
  const chordsMode = opts.chordsMode ?? 'mixed'
  const issues: PlanIssue[] = []
  const chordSlots: ChordSlotData[] = []
  const drums: ModulesData['drums'] = {}
  const seqBanks: ModulesData['seqBanks'] = {}

  plan.sections.forEach((sec, si) => {
    const path = `sections[${si}]`
    // one chord cycle, repeated to fill the section's bars (as far as 16 steps allow)
    const cycle = sec.chords.map(c => {
      const duration = beatsToDuration(c.beats) as DurationOption
      if (DURATION_BEATS[duration] !== c.beats) {
        issues.push({ path: `${path}.chords`, message: `${c.symbol}: ${c.beats} beats played as ${DURATION_BEATS[duration]}`, level: 'warning' })
      }
      return { ...c, duration, beats: DURATION_BEATS[duration] }
    })
    const cycleBeats = cycle.reduce((t, c) => t + c.beats, 0)
    const target = sec.bars * 4
    const maxReps = Math.max(1, Math.floor(SONG_MAX_CHORDS / cycle.length))
    const reps = Math.max(1, Math.min(maxReps, Math.round(target / cycleBeats)))
    if (reps * cycleBeats !== target) {
      issues.push({ path, message: `${sec.name} plays ${(reps * cycleBeats) / 4} bars instead of ${sec.bars}`, level: 'warning' })
    }
    const velocity = 70 + sec.energy * 10
    let prev: number[] | null = null
    const steps: ChordStep[] = []
    for (let r = 0; r < reps; r++) {
      for (const c of cycle) {
        const parsed = parseChordSymbol(c.symbol)!
        const notes = voiceLead(parsed, prev, CHORD_CENTER)
        prev = notes
        const step: ChordStep = { ...DEFAULT_CHORD_STEP, active: true, chordName: c.symbol, notes, velocity: c.velocity ?? velocity, duration: c.duration, gate: 90 }
        // 'chord' / 'arp' override what the AI wrote: the slot's mode decides, no per-chord mode
        if (chordsMode === 'mixed' && c.mode && c.mode !== sec.playMode) step.stepMode = c.mode
        if (c.strum && chordsMode !== 'arp') step.chordMode = c.strum
        if (c.arpMode && chordsMode !== 'chord') step.arpMode = c.arpMode
        if (c.arpRate && chordsMode !== 'chord') step.arpRate = c.arpRate as DurationOption
        steps.push(step)
      }
    }
    const numSteps = steps.length
    while (steps.length < 16) steps.push({ ...DEFAULT_CHORD_STEP })
    chordSlots.push({ steps, numSteps, playMode: chordsMode === 'mixed' ? sec.playMode : chordsMode, arpRate: '16n' })

    // drums: one bar per section, with its dynamics (drumGridToSteps)
    const rows = DRUM_TRACK_LABELS.map((label, ti) => drumGridToSteps(sec.drums[label], sec.energy, si * 31 + ti))
    drums[sec.id] = Object.keys(sec.drums).length ? rows : null

    // Sequencer: the section's part, else its bass line (older plans)
    const seq = sec.sequence ?? bassToSequence(sec, cycle)
    seqBanks[sec.id] = seq ? sequenceToBank(seq, sec.energy) : null
    // it loops over the section: it lines up when its length divides the section's
    const sectionSteps = Math.round(reps * cycleBeats * 4)
    if (seq && sectionSteps % seq.steps.length !== 0) {
      issues.push({ path: `${path}.sequence`, message: `${sec.name}: the sequence (${seq.steps.length / 16} bars) doesn't divide the section (${sectionSteps / 16} bars)`, level: 'warning' })
    }
  })

  const ids = plan.sections.map(s => s.id)
  const chain = plan.form.map(id => ids.indexOf(id)).filter(i => i >= 0)
  while (chain.length < SONG_MAX_FORM) chain.push(-1)
  return { chordSlots, seqBanks, chain, drums, issues }
}

// ── Apply / undo ──────────────────────────────────────────────────────────

export interface SongSnapshot {
  chord: { slots: string; chain: number[]; chainEnabled: boolean; drumFollow: boolean; activeSlotIndex: number }
  drum: { sequences: string; activeSequence: string; chainEnabled: boolean; swing?: number }
  seq: { banks: string; activeBankIndex: number; chainEnabled: boolean }
  slotPresets: Record<number, PartSounds>
  bpm: number
}

// The Sequencer keeps a working copy of its active bank and writes it back on every edit: after
// its banks are replaced it must reload, or it would put the old steps back.
function reloadSequencer() {
  window.dispatchEvent(new CustomEvent('seq-banks-reloaded'))
}

function snapshot(): SongSnapshot {
  const cp = useChordProgStore()
  const dm = useDrumMachineStore()
  const sq = useStepSequencerStore()
  cp.slotSave(cp.activeSlotIndex)          // the editing buffer is part of what we replace
  return {
    chord: { slots: JSON.stringify(cp.slots), chain: [...cp.chain], chainEnabled: cp.chainEnabled, drumFollow: cp.drumFollow, activeSlotIndex: cp.activeSlotIndex },
    drum: { sequences: JSON.stringify(dm.sequences), activeSequence: dm.activeSequence, chainEnabled: dm.chainEnabled, swing: dm.swing },
    seq: { banks: JSON.stringify(sq.banks), activeBankIndex: sq.activeBankIndex, chainEnabled: sq.chainEnabled },
    slotPresets: JSON.parse(JSON.stringify(cp.slotPresets)),
    bpm: useArpStore().arpBpm,
  }
}

/**
 * Loads a plan: Chord Prog slots A.. (one per section) + chain (the form, enabled, drums
 * following it), Drum Machine sequences A.. (the section's grid, else a pattern of the plan's drum
 * style; the other sequences are left alone), the tempo. Sound settings of the drum tracks are
 * kept. Returns the state before, for undoSongPlan(), and the conversion's issues.
 */
export function applySongPlan(plan: SongPlan, opts: { drumStyleFallback?: (style: DrumStyleName) => DrumStep[][] | null; presets?: PresetMode; chordsMode?: ChordsMode } = {}): { before: SongSnapshot; issues: PlanIssue[] } {
  const before = snapshot()
  const data = songToModules(plan, { chordsMode: opts.chordsMode })
  const issues = [...data.issues]
  const cp = useChordProgStore()
  const dm = useDrumMachineStore()

  // Chord Prog
  data.chordSlots.forEach((slot, i) => { cp.slots[i] = slot })
  cp.persistSlots()
  cp.chain = [...data.chain]
  cp.persistChain()
  cp.chainEnabled = true
  cp.drumFollow = true
  cp.slotLoad(data.chain[0] >= 0 ? data.chain[0] : 0)

  // Drum Machine: the steps of each section's sequence (track sounds untouched)
  const fallback = opts.drumStyleFallback ?? ((s: DrumStyleName) => dm.generateDrumPatternRaw(s))
  for (const sec of plan.sections) {
    let rows = data.drums[sec.id] ?? null
    if (!rows && plan.style.drumStyle) {
      rows = fallback(plan.style.drumStyle)
      if (rows) issues.push({ path: `sections.${sec.id}.drums`, message: `${sec.name}: no drum grid, a ${plan.style.drumStyle} pattern used`, level: 'repaired' })
    }
    const tracks = dm.sequences[sec.id]
    if (!rows || !tracks) continue
    tracks.forEach((t, ti) => {
      const row = rows![ti]
      t.steps = Array.from({ length: SONG_GRID_STEPS }, (_, si) => ({ ...emptyDrumStep(), ...(row?.[si] ?? {}) }))
      t.length = SONG_GRID_STEPS
    })
  }
  dm.chainEnabled = false                   // the Chord Prog chain drives the sequences
  if (plan.style.swing != null) dm.swing = plan.style.swing
  const first = plan.form[0] ?? plan.sections[0].id
  dm.swapSequence(first)

  // Sequencer: bank with the section's letter (the other banks are left alone)
  const sq = useStepSequencerStore()
  const keyName = NOTE_NAMES[plan.key.rootPc]
  for (const sec of plan.sections) {
    const bank = data.seqBanks[sec.id]
    const bi = SECTION_IDS.indexOf(sec.id)
    if (!bank || !sq.banks[bi]) continue
    sq.banks[bi] = { ...sq.banks[bi], numSteps: bank.numSteps, basePatternLength: bank.numSteps, steps: bank.steps.map(st => ({ ...st })), selectedKey: keyName }
  }
  sq.chainEnabled = false                   // the Chord Prog chain drives the banks
  sq.setActiveBank(SECTION_IDS.indexOf(first))
  reloadSequencer()

  // Presets: none / the first section's at Load / also at each section (Chord Prog, Follow on)
  const mode = opts.presets ?? 'keep'
  const changes = planPresetChanges(plan, mode)
  cp.slotPresets = changes.bySlot
  if (mode !== 'keep') issues.push(...sendPartPresets(changes.atLoad))

  useMidiStore().setGlobalBpm(plan.bpm)
  return { before, issues }
}

/** Puts back what applySongPlan() replaced. */
export function undoSongPlan(s: SongSnapshot) {
  const cp = useChordProgStore()
  const dm = useDrumMachineStore()
  cp.slots = JSON.parse(s.chord.slots)
  cp.persistSlots()
  cp.chain = [...s.chord.chain]
  cp.persistChain()
  cp.chainEnabled = s.chord.chainEnabled
  cp.drumFollow = s.chord.drumFollow
  cp.slotLoad(s.chord.activeSlotIndex)
  dm.sequences = JSON.parse(s.drum.sequences)
  dm.chainEnabled = s.drum.chainEnabled
  if (s.drum.swing != null) dm.swing = s.drum.swing
  dm.swapSequence(s.drum.activeSequence)
  const sq = useStepSequencerStore()
  sq.banks = JSON.parse(s.seq.banks)
  sq.chainEnabled = s.seq.chainEnabled
  sq.setActiveBank(s.seq.activeBankIndex)
  reloadSequencer()
  cp.slotPresets = s.slotPresets ?? {}      // the presets already sent stay: they can't be taken back
  useMidiStore().setGlobalBpm(s.bpm)
}

// ── Presets ───────────────────────────────────────────────────────────────

export type SongPart = keyof PartSounds   // 'chords' (Chord Prog) | 'seq' (Sequencer)
const PART_SOURCE: Record<SongPart, string> = { chords: MidiSource.CHORD_PROG, seq: MidiSource.SEQUENCER2 }
const PART_LABEL: Record<SongPart, string> = { chords: 'Chord Prog', seq: 'Sequencer' }

/** A section's sounds: its own over the song's (the Sequencer's from its role when not given). */
export function sectionSounds(plan: SongPlan, sec: SongSection): PartSounds {
  const songSeq = plan.sounds.seq ?? (sec.sequence?.role === 'bass' || (!sec.sequence && sec.bass) ? plan.sounds.bass : plan.sounds.lead)
  const out: PartSounds = {}
  const chords = sec.sounds?.chords ?? plan.sounds.chords
  const seq = sec.sounds?.seq ?? songSeq
  if (chords) out.chords = chords
  if (seq) out.seq = seq
  return out
}

/**
 * The preset changes of a plan: what to send at Load (the first section of the form) and, in
 * 'section' mode, the sounds of each Chord Prog slot (sent at its start during chain playback).
 */
export function planPresetChanges(plan: SongPlan, mode: PresetMode): { atLoad: PartSounds; bySlot: Record<number, PartSounds> } {
  if (mode === 'keep') return { atLoad: {}, bySlot: {} }
  const firstId = plan.form[0] ?? plan.sections[0].id
  const first = plan.sections.find(s => s.id === firstId) ?? plan.sections[0]
  const atLoad = sectionSounds(plan, first)
  const bySlot: Record<number, PartSounds> = {}
  if (mode === 'section') plan.sections.forEach((sec, i) => { const ps = sectionSounds(plan, sec); if (ps.chords || ps.seq) bySlot[i] = ps })
  return { atLoad, bySlot }
}

/**
 * The device and channel (0-based) a part plays on: the first device it's wired to in MIDI Flow,
 * on that device's output channel (else the global MIDI channel). null when not wired to a device.
 */
export function partTarget(part: SongPart): { deviceName: string; channel: number } | null {
  const midi = useMidiStore()
  const regs = midi.routingConfig?.registrations ?? {}
  for (const name of midi.routingMatrix[PART_SOURCE[part]] ?? []) {
    const reg = regs[name]
    if (!reg) continue
    const channel = reg.outChannels?.length ? reg.outChannels[0] : reg.outChannel >= 0 ? reg.outChannel : midi.midiChannel - 1
    return { deviceName: name, channel }
  }
  return null
}

/** The preset categories known for each part's device (empty when unknown). */
export function partCategories(): { chords?: string[]; seq?: string[] } {
  const out: { chords?: string[]; seq?: string[] } = {}
  for (const part of ['chords', 'seq'] as SongPart[]) {
    const t = partTarget(part)
    const cats = t ? knownDeviceCategories(t.deviceName) : []
    if (cats.length) out[part] = cats
  }
  return out
}

/** Asks the Program Change panel for the first preset of each part's category. */
export function sendPartPresets(sounds: PartSounds): PlanIssue[] {
  const issues: PlanIssue[] = []
  for (const part of ['chords', 'seq'] as SongPart[]) {
    const category = sounds[part]
    if (!category) continue
    const t = partTarget(part)
    if (!t) { issues.push({ path: `sounds.${part}`, message: `${PART_LABEL[part]} isn't wired to a device in MIDI Flow: no preset change`, level: 'warning' }); continue }
    dispatch('device-pc-category-select', { ...t, category })
  }
  return issues
}

/** A one-line description of a plan's key ("A minor"). */
export function keyLabel(plan: SongPlan): string {
  return `${plan.key.root} ${MODE_LABEL[plan.key.mode]}`
}


// ── Last generation ───────────────────────────────────────────────────────
// The last composed plan is kept (per user) so it can be looked at again after the dialog is closed
// or the app reloaded: what was asked, what the AI answered (raw), the plan, its issues, and when
// it was loaded. The undo snapshot lives for the session only (it holds whole module states).

export interface LastGeneration {
  at: string                   // ISO date of the composition
  input: ComposeInput
  plan: SongPlan | null
  issues: PlanIssue[]
  raw: string
  error?: string
  appliedAt?: string           // when it was loaded into the modules
}

const LS_LAST = 'SYCORE_SONG_COMPOSER_LAST'

export function saveLastGeneration(g: LastGeneration) {
  try { localStorage.setItem(userKey(LS_LAST), JSON.stringify(g)) } catch {}
}

export function loadLastGeneration(): LastGeneration | null {
  try {
    const g = JSON.parse(localStorage.getItem(userKey(LS_LAST)) || 'null')
    return g && typeof g.at === 'string' && g.input ? g : null
  } catch { return null }
}

export function markLastGenerationApplied(applied: boolean) {
  const g = loadLastGeneration()
  if (!g) return
  if (applied) g.appliedAt = new Date().toISOString()
  else delete g.appliedAt
  saveLastGeneration(g)
}

let _sessionUndo: SongSnapshot | null = null
/** The state before the last load, while the app stays open (survives closing the dialog). */
export const sessionUndo = {
  get: () => _sessionUndo,
  set: (s: SongSnapshot | null) => { _sessionUndo = s },
}
