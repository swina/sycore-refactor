/**
 * rig-controller.ts — Rig Controller prototype: a simulated rig state, the
 * Rig Actions that change it, and the Launchpad Mini MK1 layout / LED colors.
 *
 * UI prototype only (branch feat/rig-controller-ui): no MIDI is sent and the
 * SY.CORE apps are not driven yet. The model is the one in the plan
 * (sycore-ableton/PIANO_INTEGRAZIONE_ABLETON.md, Fase 9): SY.CORE holds the
 * state, a controller only shows it.
 *
 * Each app row is a "track" and each slot A–H a "clip" of a given length in
 * bars. Per track, four performance options decide how a slot reacts:
 *   press         — Retrigger / Hold & stop / Hold & motion / Latch
 *   motion        — what plays when a slot ends: Stay, One shot, March…, Random…
 *   triggerSync   — when a triggered slot starts (Off, ¼–4 beats, Auto, Queue, Tolerant)
 *   positionSync  — where inside the slot it starts (Off, ¼–4 beats, Auto)
 * The simulated clock runs in 16ths, 4/4: 16 steps = 1 bar.
 */

export const RIG_APPS = [
  { id: 'chord', label: 'Chord' },
  { id: 'drum', label: 'Drum' },
  { id: 'bass', label: 'Bass' },
  { id: 'seq', label: 'Seq' },
  { id: 'arp', label: 'Arp' },
] as const

export type RigAppId = typeof RIG_APPS[number]['id']
export const SLOT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const SLOT_COUNT = SLOT_LABELS.length
export const SECTION_COUNT = 8
export const SPLIT_COUNT = 4
export const LANE_COUNT = 16
export const STEPS_PER_BEAT = 4
export const STEPS_PER_BAR = 16
export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// ── Track performance options ─────────────────────────────────────────────
export type PressMode = 'retrigger' | 'holdStop' | 'holdMotion' | 'latch'
export type MotionMode = 'stay' | 'oneShot' | 'marchWrap' | 'marchStay' | 'marchStop' | 'random' | 'exclusiveRandom'
export type GridSync = 'off' | '1/4' | '1/2' | '1' | '2' | '4'
export type TriggerSync = GridSync | 'auto' | 'queue' | 'tolerant'
export type PositionSync = GridSync | 'auto'

export interface TrackOptions {
  press: PressMode
  motion: MotionMode
  triggerSync: TriggerSync
  positionSync: PositionSync
}

export const PRESS_OPTIONS: { value: PressMode; label: string; hint: string }[] = [
  { value: 'retrigger', label: 'Retrigger', hint: 'Every press (re)starts the slot; Shift + press stops the app' },
  { value: 'holdStop', label: 'Hold & stop', hint: 'Plays while held, stops on release' },
  { value: 'holdMotion', label: 'Hold & motion', hint: 'Plays while held; on release stops and the next press of that pad plays the next slot (per Motion)' },
  { value: 'latch', label: 'Latch', hint: 'Each press toggles play / stop' },
]
export const MOTION_OPTIONS: { value: MotionMode; label: string; hint: string }[] = [
  { value: 'stay', label: 'Stay', hint: 'Loops the slot' },
  { value: 'oneShot', label: 'One shot', hint: 'Plays once, then stops' },
  { value: 'marchWrap', label: 'March & wrap', hint: 'Moves to the next slot, back to the first after the last' },
  { value: 'marchStay', label: 'March & stay', hint: 'Moves to the next slot, loops the last' },
  { value: 'marchStop', label: 'March & stop', hint: 'Moves to the next slot, stops after the last' },
  { value: 'random', label: 'Random', hint: 'A random slot each time (repeats allowed)' },
  { value: 'exclusiveRandom', label: 'Exclusive random', hint: 'A random slot, never the same twice in a row' },
]
const GRID_OPTIONS: { value: GridSync; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '1/4', label: '1/4 beat' },
  { value: '1/2', label: '1/2 beat' },
  { value: '1', label: '1 beat' },
  { value: '2', label: '2 beats' },
  { value: '4', label: '4 beats (bar)' },
]
export const TRIGGER_SYNC_OPTIONS: { value: TriggerSync; label: string; hint: string }[] = [
  // ¼ and ½ beat left out: too short a wait to launch a part (they still work as stored values in SIM).
  ...GRID_OPTIONS.filter(o => o.value !== '1/4' && o.value !== '1/2')
    .map(o => ({ ...o, hint: o.value === 'off' ? 'Starts at once' : `Starts on the next ${o.label}` })),
  { value: 'auto', label: 'Auto', hint: "From the slot's length, up to 4 beats" },
  { value: 'queue', label: 'Queue', hint: 'Slots pressed while one plays are queued and play in that order' },
  { value: 'tolerant', label: 'Tolerant', hint: 'A press just after the bar line (within 1 beat) starts at once, cutting the beginning' },
]
export const POSITION_SYNC_OPTIONS: { value: PositionSync; label: string; hint: string }[] = [
  ...GRID_OPTIONS.map(o => ({ ...o, hint: o.value === 'off' ? 'From the start of the slot' : `From the nearest ${o.label} point inside the slot` })),
  { value: 'auto', label: 'Auto', hint: 'From the current song position' },
]

export const DEFAULT_TRACK_OPTIONS: TrackOptions = { press: 'latch', motion: 'stay', triggerSync: '4', positionSync: 'off' }

const GRID_STEPS: Record<GridSync, number> = { off: 0, '1/4': 1, '1/2': 2, '1': 4, '2': 8, '4': 16 }

let rng: () => number = Math.random
/** Test hook: replace the random source used by the Random motions. */
export function setRng(fn: () => number): void { rng = fn }

// ── State ─────────────────────────────────────────────────────────────────
export type SlotState = 'empty' | 'filled' | 'queued' | 'playing'

export interface RigAppState {
  id: RigAppId
  label: string
  filled: boolean[]
  /** Slot lengths in bars */
  lengths: number[]
  playing: number | null
  /** Step inside the playing slot (16ths) */
  pos: number
  queued: number | null
  /** Queue sync: slots waiting, in order */
  queue: number[]
  /** Hold modes: the slot held down */
  held: number | null
  /** Hold & motion: pad released last, and the slot its next press plays */
  lastPad: number | null
  cursor: number | null
  opts: TrackOptions
  muted: boolean
  solo: boolean
  density: number
  swing: number
  gate: number
  intensity: number
}

export interface RigState {
  apps: RigAppState[]
  section: number | null
  queuedSection: number | null
  split: number
  laneMutes: boolean[]
  laneLatch: boolean[]
  /** total = 16ths since Play; bar / beat / step derived from it */
  clock: { source: 'EXT' | 'INT'; bpm: number; total: number; bar: number; beat: number; step: number; running: boolean }
  fill: boolean
  repeater: boolean
  latch: boolean
  key: number
  generateMode: 'builtin' | 'ai'
  shift: boolean
  lanePage: 0 | 1
  globalIntensity: number
  display: string
  warnings: string[]
  undo: { app: RigAppId; slot: number; wasFilled: boolean; prevQueued: number | null } | null
}

/** A demo rig: a few slots already filled (some 2 bars long), everything stopped. */
export function createRigState(): RigState {
  const seeded: Record<RigAppId, number[]> = {
    chord: [0, 1, 2], drum: [0, 1, 2, 3], bass: [0, 1], seq: [0, 2], arp: [0],
  }
  const twoBars: Record<RigAppId, number[]> = { chord: [1, 2], drum: [], bass: [1], seq: [2], arp: [] }
  return {
    apps: RIG_APPS.map(a => ({
      id: a.id,
      label: a.label,
      filled: SLOT_LABELS.map((_, i) => seeded[a.id].includes(i)),
      lengths: SLOT_LABELS.map((_, i) => (twoBars[a.id].includes(i) ? 2 : 1)),
      playing: null,
      pos: 0,
      queued: null,
      queue: [],
      held: null,
      lastPad: null,
      cursor: null,
      opts: { ...DEFAULT_TRACK_OPTIONS },
      muted: false,
      solo: false,
      density: 64,
      swing: 0,
      gate: 80,
      intensity: 127, // 127 = notes as the app plays them (LIVE: velocity scale)
    })),
    section: null,
    queuedSection: null,
    split: 0,
    laneMutes: Array(LANE_COUNT).fill(false),
    laneLatch: Array(LANE_COUNT).fill(false),
    clock: { source: 'EXT', bpm: 124, total: 0, bar: 1, beat: 1, step: 0, running: false },
    fill: false,
    repeater: false,
    latch: false,
    key: 0,
    generateMode: 'builtin',
    shift: false,
    lanePage: 0,
    globalIntensity: 127,
    display: 'Ready · waiting for Live',
    warnings: [],
    undo: null,
  }
}

function app(s: RigState, id: RigAppId): RigAppState {
  const a = s.apps.find(x => x.id === id)
  if (!a) throw new Error(`unknown rig app "${id}"`)
  return a
}

export function slotState(a: RigAppState, slot: number): SlotState {
  if (a.queued === slot || a.queue.includes(slot)) return 'queued'
  if (a.playing === slot) return 'playing'
  return a.filled[slot] ? 'filled' : 'empty'
}

/** Playback progress of the playing slot, 0–1 (for the pad's progress bar). */
export function slotProgress(a: RigAppState, slot: number): number {
  if (a.playing !== slot) return 0
  return a.pos / (a.lengths[slot] * STEPS_PER_BAR)
}

const slotSteps = (a: RigAppState, slot: number) => a.lengths[slot] * STEPS_PER_BAR

/** 16ths between two possible start points for this track (0 = at once). */
export function triggerSyncSteps(a: RigAppState, slot: number): number {
  const t = a.opts.triggerSync
  if (t === 'auto') return Math.min(slotSteps(a, slot), STEPS_PER_BAR)
  if (t === 'queue' || t === 'tolerant') return STEPS_PER_BAR
  return GRID_STEPS[t]
}

function syncLabel(a: RigAppState): string {
  const o = TRIGGER_SYNC_OPTIONS.find(x => x.value === a.opts.triggerSync)
  return o ? o.label : a.opts.triggerSync
}

const whenText = (s: RigState, a: RigAppState) =>
  (!s.clock.running ? 'at Play' : a.opts.triggerSync === 'off' ? 'now' : `on the next ${syncLabel(a)}`)

/** Where inside the slot it starts (Position sync). */
function startPos(s: RigState, a: RigAppState, slot: number): number {
  const len = slotSteps(a, slot)
  const songPos = s.clock.total % len
  const p = a.opts.positionSync
  if (p === 'off') return 0
  if (p === 'auto') return songPos
  const grid = GRID_STEPS[p]
  return Math.floor(songPos / grid) * grid
}

function startSlot(s: RigState, a: RigAppState, slot: number, pos?: number): void {
  a.playing = slot
  a.queued = null
  a.pos = pos ?? startPos(s, a, slot)
}

function stopApp(a: RigAppState): void {
  a.playing = null
  a.queued = null
  a.queue = []
  a.pos = 0
}

/** Trigger a slot following the track's Trigger sync. */
function trigger(s: RigState, a: RigAppState, slot: number): void {
  const t = a.opts.triggerSync
  if (t === 'queue') {
    if (a.playing === null && a.queued === null) a.queued = slot
    else a.queue.push(slot)
    s.display = `${a.label} → ${SLOT_LABELS[slot]} queued (${a.queue.length + (a.queued !== null ? 1 : 0)} waiting)`
    return
  }
  if (s.clock.running && t === 'off') {
    startSlot(s, a, slot)
    s.display = `${a.label} → ${SLOT_LABELS[slot]} now`
    return
  }
  if (s.clock.running && t === 'tolerant' && s.clock.step < STEPS_PER_BEAT) {
    startSlot(s, a, slot, s.clock.step % slotSteps(a, slot))
    s.display = `${a.label} → ${SLOT_LABELS[slot]} now (tolerant, cut by ${s.clock.step}/16)`
    return
  }
  a.queued = slot
  s.display = `${a.label} → ${SLOT_LABELS[slot]} ${whenText(s, a)}`
}

/** The slot Motion moves to after `from` (null = stop). */
export function motionNext(a: RigAppState, from: number): number | null {
  const filled = a.filled.map((f, i) => (f ? i : -1)).filter(i => i >= 0)
  if (filled.length === 0) return null
  const after = filled.find(i => i > from)
  switch (a.opts.motion) {
    case 'stay': return from
    case 'oneShot': return null
    case 'marchWrap': return after ?? filled[0]
    case 'marchStay': return after ?? from
    case 'marchStop': return after ?? null
    case 'random': return filled[Math.floor(rng() * filled.length)]
    case 'exclusiveRandom': {
      const others = filled.filter(i => i !== from)
      return others.length ? others[Math.floor(rng() * others.length)] : from
    }
  }
}

/** A slot reached its end: the queue first, else Motion. */
function slotEnded(a: RigAppState): void {
  const from = a.playing as number
  if (a.queue.length) {
    a.playing = a.queue.shift() as number
    a.pos = 0
    return
  }
  const next = motionNext(a, from)
  if (next === null) { a.playing = null; a.pos = 0; return }
  a.playing = next
  a.pos = 0
}

// ── Rig Actions ───────────────────────────────────────────────────────────

/** A slot pad pressed (pointer down), according to the track's Press mode. */
export function pressSlot(s: RigState, id: RigAppId, slot: number): void {
  const a = app(s, id)
  if (!a.filled[slot]) { s.display = `${a.label} ${SLOT_LABELS[slot]}: empty slot`; return }
  switch (a.opts.press) {
    case 'latch':
      if (a.playing === slot && a.queued === null && a.queue.length === 0) {
        stopApp(a)
        s.display = `${a.label} stopped`
        return
      }
      trigger(s, a, slot)
      return
    case 'retrigger':
      if (s.shift) { stopApp(a); s.display = `${a.label} stopped`; return }
      trigger(s, a, slot)
      return
    case 'holdStop':
      a.held = slot
      trigger(s, a, slot)
      return
    case 'holdMotion': {
      const target = a.lastPad === slot && a.cursor !== null ? a.cursor : slot
      a.held = target
      trigger(s, a, target)
    }
  }
}

/** A slot pad released (pointer up): only the Hold modes react. */
export function releaseSlot(s: RigState, id: RigAppId, slot: number): void {
  const a = app(s, id)
  if (a.held === null) return
  if (a.opts.press !== 'holdStop' && a.opts.press !== 'holdMotion') { a.held = null; return }
  const held = a.held
  stopApp(a)
  a.held = null
  if (a.opts.press === 'holdMotion') {
    a.lastPad = slot
    a.cursor = motionNext(a, held)
    s.display = a.cursor === null
      ? `${a.label} stopped · end of Motion`
      : `${a.label} stopped · next press: ${SLOT_LABELS[a.cursor]}`
  } else {
    s.display = `${a.label} released`
  }
}

export function setTrackOption<K extends keyof TrackOptions>(s: RigState, id: RigAppId, key: K, value: TrackOptions[K]): void {
  const a = app(s, id)
  a.opts[key] = value
  if (key === 'triggerSync' && value !== 'queue') a.queue = []
  if (key === 'press') { a.cursor = null; a.lastPad = null; a.held = null }
  s.display = `${a.label}: ${key} = ${value}`
}

/** Generate (or Mutate) into a slot of the app, then trigger it. Builtin or AI per s.generateMode. */
export function generate(s: RigState, id: RigAppId, mutate = false): void {
  const a = app(s, id)
  const from = a.queued ?? a.playing
  let target: number
  if (mutate && from !== null) {
    target = a.filled.findIndex((f, i) => !f && i !== from)
    if (target === -1) target = (from + 1) % SLOT_COUNT
  } else {
    target = a.filled.findIndex(f => !f)
    if (target === -1) target = ((from ?? -1) + 1) % SLOT_COUNT
  }
  s.undo = { app: id, slot: target, wasFilled: a.filled[target], prevQueued: a.queued }
  a.filled[target] = true
  trigger(s, a, target)
  const how = s.generateMode === 'ai' ? 'AI' : 'built-in'
  const what = mutate && from !== null ? `mutated ${SLOT_LABELS[from]} →` : 'generated'
  s.display = `${a.label}: ${what} ${SLOT_LABELS[target]} (${how}) ${whenText(s, a)}`
}

/** Undo the last Generate / Mutate. */
export function undo(s: RigState): void {
  const u = s.undo
  if (!u) { s.display = 'Nothing to undo'; return }
  const a = app(s, u.app)
  a.filled[u.slot] = u.wasFilled
  a.queued = u.prevQueued
  a.queue = a.queue.filter(i => i !== u.slot || u.wasFilled)
  if (!u.wasFilled && a.playing === u.slot) { a.playing = null; a.pos = 0 }
  s.undo = null
  s.display = `${a.label}: undo slot ${SLOT_LABELS[u.slot]}`
}

/** Select a song section: every app with that slot filled switches to it on the next bar. */
export function selectSection(s: RigState, section: number): void {
  s.queuedSection = section
  s.display = `Section ${section + 1} ${s.clock.running ? 'on the next bar' : 'at Play'}`
}

function applySection(s: RigState): void {
  if (s.queuedSection === null) return
  const sec = s.queuedSection
  for (const a of s.apps) if (a.filled[sec]) { a.queue = []; startSlot(s, a, sec, 0) }
  s.section = sec
  s.queuedSection = null
}

export function toggleMute(s: RigState, id: RigAppId): void {
  const a = app(s, id)
  a.muted = !a.muted
  s.display = `${a.label} ${a.muted ? 'muted' : 'unmuted'}`
}

export function toggleSolo(s: RigState, id: RigAppId): void {
  const a = app(s, id)
  const on = !a.solo
  for (const x of s.apps) x.solo = false
  a.solo = on
  s.display = on ? `${a.label} solo` : 'Solo off'
}

export function toggleLaneMute(s: RigState, lane: number): void {
  s.laneMutes[lane] = !s.laneMutes[lane]
  s.display = `Lane ${lane + 1} ${s.laneMutes[lane] ? 'muted' : 'unmuted'}`
}

export function selectSplit(s: RigState, split: number): void {
  s.split = split
  s.display = `Split preset ${split + 1}`
}

export function shiftKey(s: RigState, delta: number): void {
  s.key = (s.key + delta + 12) % 12
  s.display = `Key ${KEY_NAMES[s.key]}`
}

/** Panic: every app stops, nothing queued, latch released. */
export function panic(s: RigState): void {
  for (const a of s.apps) { stopApp(a); a.held = null; a.cursor = null }
  s.queuedSection = null
  s.latch = false
  s.fill = false
  s.repeater = false
  s.display = 'PANIC · All Notes Off'
}

export function toggleClockSource(s: RigState): void {
  s.clock.source = s.clock.source === 'EXT' ? 'INT' : 'EXT'
  s.display = `Clock ${s.clock.source}`
}

function updateClockFields(s: RigState): void {
  const c = s.clock
  c.step = c.total % STEPS_PER_BAR
  c.bar = Math.floor(c.total / STEPS_PER_BAR) + 1
  c.beat = Math.floor(c.step / STEPS_PER_BEAT) + 1
}

/** One 16th of the (simulated) clock: slots advance, end (Motion / queue), queued slots start on their sync point. */
export function tick(s: RigState): void {
  if (!s.clock.running) return
  s.clock.total += 1
  updateClockFields(s)
  for (const a of s.apps) {
    if (a.playing !== null) {
      a.pos += 1
      if (a.pos >= slotSteps(a, a.playing)) slotEnded(a)
    }
  }
  if (s.clock.step === 0) {
    applySection(s)
    s.fill = false
  }
  for (const a of s.apps) {
    if (a.queued === null) continue
    const n = triggerSyncSteps(a, a.queued)
    if (n === 0 || s.clock.total % n === 0) startSlot(s, a, a.queued)
  }
}

export function startClock(s: RigState): void {
  s.clock.running = true
  s.clock.total = 0
  updateClockFields(s)
  applySection(s)
  for (const a of s.apps) if (a.queued !== null) startSlot(s, a, a.queued, 0)
  s.display = `Play · ${s.clock.source} ${s.clock.bpm.toFixed(1)} BPM`
}

export function stopClock(s: RigState): void {
  s.clock.running = false
  s.display = 'Stop'
}

// ── Launchpad Mini MK1 ─────────────────────────────────────────────────────
// XY layout (same as LaunchpadMiniMK1 profile's init): grid note = 16·row + col,
// right-side round buttons = 16·row + 8, top round buttons = CC 104–111.
// Colors as velocity = 16·green + red + flags (Launchpad MK1 Programmer's
// Reference): flags 12 (Copy + Clear) = steady, 8 (Clear) = flashing with
// automatic flashing on (B0 00 28, sent by Rig mode, rig-launchpad.ts).

export const LP_COLOR = { off: 12, amber: 63, amberFlash: 59, green: 60, red: 15 } as const
export type LpColor = keyof typeof LP_COLOR

export const lpGridNote = (row: number, col: number) => 16 * row + col
export const lpSideNote = (row: number) => 16 * row + 8
export const lpTopCc = (i: number) => 104 + i

export function slotColor(st: SlotState): LpColor {
  return st === 'playing' ? 'green' : st === 'queued' ? 'amberFlash' : st === 'filled' ? 'amber' : 'off'
}

/** Labels of the Launchpad's top row (CC 104–111) and right column (rows 5–7). */
export const LP_TOP_LABELS = ['Beat', 'EXT/INT', 'Shift', 'Gen AI', 'Sync', 'Rig', '—', 'Panic'] as const
export const LP_ROW6_LABELS = ['Split 1', 'Split 2', 'Split 3', 'Split 4', 'Fill', 'Repeat', 'Latch', 'Rel all'] as const
export const LP_SIDE_LOW_LABELS = ['Undo', 'Key −', 'Key +'] as const
