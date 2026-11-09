/**
 * rig-live.ts — connects the Rig Controller to the real apps (P9 step 1).
 *
 * The Rig Controller's model (rig-controller.ts) simulates every row. In LIVE
 * mode the Chord, Drum and Seq rows mirror the real Chord Prog, Drum Machine
 * and Sequencer instead: which slots hold something, which one plays, which
 * one is queued. A pad press sends the same command as the Control Map
 * (control-map.ts), so a clip in Live and a pad do exactly the same thing:
 * the slot starts on the next bar (Sequencer: at the end of its pattern).
 *
 * The Bass row is the Drum Machine's bassline: it shows the sequences A–H that hold one, and
 * its pads switch the Drum Machine's sequence like the Drum row; its Mute / Solo / Intensity act
 * on the bassline only (`rigParts`, read by the Drum Machine). The Arp row's pads A–H pick an
 * arp mode and switch the Arpeggiator on; the mode playing again switches it off.
 *
 * The apps keep their queued slot and (the Sequencer) their play state in
 * component locals: they report them into `rigReports`.
 */
import { reactive } from 'vue'
import { controlActionEvent, type ControlAction } from '@/lib/control-map'
import type { RigAppState, RigState } from '@/lib/rig-controller'
import { STEPS_PER_BAR, STEPS_PER_BEAT } from '@/lib/rig-controller'

export type LiveAppId = 'chord' | 'drum' | 'seq'
export const LIVE_APPS: readonly LiveAppId[] = ['chord', 'drum', 'seq']
export const isLiveApp = (id: string): id is LiveAppId => (LIVE_APPS as readonly string[]).includes(id)

/** Every row connected in LIVE: the apps above plus Bass (the Drum Machine's bassline) and Arp. */
export type LiveRowId = LiveAppId | 'bass' | 'arp'
export const LIVE_ROWS: readonly LiveRowId[] = ['chord', 'drum', 'seq', 'bass', 'arp']
export const isLiveRow = (id: string): id is LiveRowId => (LIVE_ROWS as readonly string[]).includes(id)
/** The app a row's pads drive: Bass switches the Drum Machine's sequence. */
export const padApp = (id: LiveRowId): LiveAppId | null => (id === 'bass' ? 'drum' : id === 'arp' ? null : id)

/** Inside the Drum Machine: its drums and its bassline muted, and their velocity factors (0–1),
 *  from the rig's Drum and Bass rows (Drum: when its Mute / Intensity act on the whole app). */
export const rigParts = reactive({ drumMuted: false, bassMuted: false, drumVelocity: 1, bassVelocity: 1 })

/** The Arp row's pads A–H: arp modes. */
export const RIG_ARP_MODES = ['up', 'down', 'up-down', 'down-up', 'converge', 'diverge', 'pinky-up', 'random'] as const

const LETTERS = 'ABCDEFGH'

/** Reported by the apps: the slot queued (null = none), and the Sequencer's play state. */
export const rigReports = reactive({
  queued: { chord: null, drum: null, seq: null } as Record<LiveAppId, number | null>,
  seqPlaying: false,
})

export interface LiveSnapshot {
  filled: boolean[]
  playing: number | null
  queued: number | null
}

interface StepLike { active?: boolean; notes?: number[] }

const anyActive = (steps: StepLike[] | undefined, n = steps?.length ?? 0) =>
  !!steps && steps.slice(0, n).some(st => !!st?.active)

/** Drum Machine: sequences A–H (drums and bass line), the active one plays. */
export function drumSnapshot(
  sequences: Record<string, { steps: StepLike[] }[]>,
  bassline: Record<string, { steps: StepLike[] }[]> | undefined,
  active: string, isPlaying: boolean, queued: number | null,
): LiveSnapshot {
  const filled = [...LETTERS].map(k =>
    (sequences[k] ?? []).some(t => anyActive(t.steps)) || (bassline?.[k] ?? []).some(t => anyActive(t.steps)))
  const idx = LETTERS.indexOf(active)
  return { filled, playing: isPlaying && idx >= 0 ? idx : null, queued }
}

/** Bass: the Drum Machine's sequences A–H holding a bassline (none while the bassline is off). */
export function bassSnapshot(
  bassline: Record<string, { steps: StepLike[] }[]> | undefined, enabled: boolean,
  active: string, isPlaying: boolean, queued: number | null,
): LiveSnapshot {
  const filled = [...LETTERS].map(k => enabled && (bassline?.[k] ?? []).some(t => anyActive(t.steps)))
  const idx = LETTERS.indexOf(active)
  return { filled, playing: isPlaying && idx >= 0 && filled[idx] ? idx : null, queued }
}

/** Arp: every pad holds a mode; the one playing is the Arpeggiator's mode while it's on. */
export function arpSnapshot(enabled: boolean, mode: string): LiveSnapshot {
  const i = (RIG_ARP_MODES as readonly string[]).indexOf(mode)
  return { filled: RIG_ARP_MODES.map(() => true), playing: enabled && i >= 0 ? i : null, queued: null }
}

/** An Arp pad: the mode playing switches the Arpeggiator off, another one picks it and switches it on. */
export const arpPress = (playing: number | null, slot: number): { enabled: boolean; mode?: string } =>
  playing === slot ? { enabled: false } : { enabled: true, mode: RIG_ARP_MODES[slot] }

/** Chord Prog: slots A–H; the one sounding is playingSlotIndex. */
export function chordSnapshot(
  slots: { steps: StepLike[]; numSteps: number }[],
  activeIdx: number, playingIdx: number | null, isPlaying: boolean, queued: number | null,
): LiveSnapshot {
  const filled = Array.from({ length: 8 }, (_, i) => {
    const sl = slots[i]
    return !!sl && sl.steps.slice(0, sl.numSteps).some(st => !!st?.active && (st.notes?.length ?? 0) > 0)
  })
  return { filled, playing: isPlaying ? (playingIdx ?? activeIdx) : null, queued }
}

/** Sequencer: banks A–H, the active one plays. */
export function seqSnapshot(
  banks: { steps: StepLike[]; numSteps: number }[],
  activeIdx: number, isPlaying: boolean, queued: number | null,
): LiveSnapshot {
  const filled = Array.from({ length: 8 }, (_, i) => anyActive(banks[i]?.steps, banks[i]?.numSteps))
  return { filled, playing: isPlaying ? activeIdx : null, queued }
}

/** Mirror a snapshot into a rig row (options, mute… are kept). */
export function applySnapshot(a: RigAppState, snap: LiveSnapshot): void {
  for (let i = 0; i < a.filled.length; i++) a.filled[i] = !!snap.filled[i]
  a.playing = snap.playing
  a.queued = snap.queued !== null && snap.queued !== snap.playing ? snap.queued : null
  a.queue = []
  a.lengths.fill(1)
}

/** Mirror the real clock: EXT (a MIDI source selected, not fallen back to INT) from Live, else the internal transport. */
export function applyClock(
  s: RigState, ext: { following: boolean; playing: boolean; bpm: number; position: string },
  int: { running: boolean; bpm: number; bar: number; beat: number; sixteenth: number },
): void {
  const c = s.clock
  let bar = 1, beat = 1, six = 1
  if (ext.following) {
    c.source = 'EXT'
    c.bpm = ext.bpm || c.bpm
    c.running = ext.playing
    if (ext.playing) {
      const [b, bt, sx] = ext.position.split('.').map(n => parseInt(n, 10))
      bar = b || 1; beat = bt || 1; six = sx || 1
    }
  } else {
    c.source = 'INT'
    c.bpm = int.bpm || c.bpm
    c.running = int.running
    if (int.running) { bar = int.bar; beat = int.beat; six = int.sixteenth }
  }
  c.bar = bar
  c.beat = beat
  c.step = (beat - 1) * STEPS_PER_BEAT + (six - 1)
  c.total = (bar - 1) * STEPS_PER_BAR + c.step
}

/** The window event a pad press sends for a live row (same as the Control Map's). */
export function slotEvent(id: LiveAppId, slot: number) {
  const action: ControlAction = { app: id, type: 'slot', index: slot }
  return controlActionEvent(action)
}

/** Trigger sync in LIVE, as sixteenths of Live's song grid: Off = at once, 1 / 2 beats, Bar. */
export const LIVE_SYNC_STEPS: Record<string, number> = { off: 0, '1': 4, '2': 8, '4': 16 }

/** A track's Trigger sync for the real apps: its sixteenths (other values, SIM only, act as Bar);
 *  0 with Live stopped (nothing to sync to). */
export function liveSyncSteps(triggerSync: string, clockRunning: boolean): number {
  if (!clockRunning) return 0
  return LIVE_SYNC_STEPS[triggerSync] ?? 16
}

type RigEvent = { name: string; detail?: Record<string, unknown> }

/**
 * The commands of a pad press on a real app's slot (Latch, with its Trigger sync `sync`):
 *  - the slot playing → stop the app on the sync point;
 *  - another slot while it plays → switch on the sync point (the Sequencer: at the end of its pattern);
 *  - stopped → select the slot, then start on the sync point.
 */
export function padEvents(id: LiveAppId, slot: number, playing: number | null, sync: number): RigEvent[] {
  if (playing === slot) {
    if (id === 'chord') return [{ name: 'cp-stop', detail: { sync } }]
    if (id === 'drum') return [{ name: 'dm-play-stop', detail: { play: false, sync } }]
    return [{ name: 'toggle-sequencer2', detail: { play: false, sync } }]
  }
  const select: RigEvent =
    id === 'chord' ? { name: 'cp-slot-cue', detail: { idx: slot, sync } }
    : id === 'drum' ? { name: 'dm-seq-switch', detail: { seq: LETTERS[slot], quantize: true, sync } }
    : { name: 'seq-bank-cue', detail: { idx: slot } }
  if (playing !== null) return [select]
  const start: RigEvent =
    id === 'chord' ? { name: 'cp-start', detail: { sync } }
    : id === 'drum' ? { name: 'dm-play-stop', detail: { play: true, sync } }
    : { name: 'toggle-sequencer2', detail: { play: true, sync } }
  return [select, start]
}

/** Slots armed with Live stopped (following Live): each app starts from its armed slot on Live's
 *  Start. A second press of the armed pad disarms it. */
export const rigArmed = reactive({ chord: null, drum: null, seq: null } as Record<LiveAppId, number | null>)

/** The armed slot after a press on `slot`: the same pad disarms, another pad arms that slot. */
export const armPress = (armed: number | null, slot: number): number | null => (armed === slot ? null : slot)

/** The commands that stop a real app at once (Live's Stop). */
export function stopEvents(id: LiveAppId): RigEvent[] {
  if (id === 'chord') return [{ name: 'cp-stop' }]
  if (id === 'drum') return [{ name: 'dm-play-stop', detail: { play: false, sync: 0 } }]
  return [{ name: 'toggle-sequencer2', detail: { play: false, sync: 0 } }]
}

/** What a pad press does, for the panel's display. */
export function padWhen(id: LiveAppId, playing: number | null, slot: number, sync: number): string {
  const at = sync === 0 ? 'now' : sync === 16 ? 'on the next bar' : `on the next ${sync / 4 === 1 ? 'beat' : '2 beats'}`
  if (playing === slot) return `stops ${at}`
  if (playing === null) return `starts ${at}`
  return id === 'seq' ? 'at the end of its pattern' : at
}

export function dispatchRig(ev: { name: string; detail?: Record<string, unknown> }): void {
  window.dispatchEvent(new CustomEvent(ev.name, ev.detail ? { detail: ev.detail } : undefined))
}

/** The MidiSource each real app sends its notes with. */
export const LIVE_APP_SOURCE = { chord: 'CHORD_PROG', drum: 'DRUM_MACHINE', seq: 'SEQUENCER2', bass: 'DRUM_MACHINE', arp: 'ARP' } as const

/** Which cables a real app's Mute/Solo acts on: [] = the whole app, else these devices only.
 *  Bass has none (it shares the Drum Machine's cables): it acts on the bassline. */
export type MuteScopes = Partial<Record<LiveRowId, string[]>>
const scopeOf = (scopes: MuteScopes, id: LiveRowId): string[] => (id === 'bass' ? [] : scopes[id] ?? [])

/** The rows the rig's Mute/Solo silences: with a Solo on among the connected rows, all but the soloed ones; otherwise the muted ones. */
function silencedApps(apps: readonly { id: string; muted: boolean; solo: boolean }[]): LiveRowId[] {
  const live = apps.filter(a => isLiveRow(a.id))
  const solo = live.some(a => a.solo)
  return live.filter(a => (solo ? !a.solo : a.muted)).map(a => a.id as LiveRowId)
}

/** Drum (whole app) and Bass act inside the Drum Machine (rigParts), so each leaves the other playing. */
const inDrumMachine = (id: LiveRowId, scopes: MuteScopes) => id === 'bass' || (id === 'drum' && !scopeOf(scopes, id).length)

/** The sources to mute (whole apps) for the rig's Mute/Solo. */
export function mutedLiveSources(apps: readonly { id: string; muted: boolean; solo: boolean }[]): string[] {
  return rigMutes(apps).sources
}

/**
 * Mute/Solo with scopes: an app whose scope lists devices mutes only its cables
 * to them (`cables`, as [source, device] pairs); one with no scope, the whole app (`sources`).
 */
export function rigMutes(apps: readonly { id: string; muted: boolean; solo: boolean }[], scopes: MuteScopes = {}):
  { sources: string[]; cables: [string, string][]; parts: { drum: boolean; bass: boolean } } {
  const sources: string[] = []
  const cables: [string, string][] = []
  const parts = { drum: false, bass: false }
  for (const id of silencedApps(apps)) {
    const scope = scopeOf(scopes, id)
    if (inDrumMachine(id, scopes)) parts[id as 'drum' | 'bass'] = true
    else if (scope.length) for (const dev of scope) cables.push([LIVE_APP_SOURCE[id], dev])
    else sources.push(LIVE_APP_SOURCE[id])
  }
  return { sources, cables, parts }
}

/**
 * Intensity: each real app's note-on velocity scale = its Intensity × Global (both 0–127,
 * 127 = as played). Same scopes as Mute/Solo: the whole app (`sources`) or its cables
 * (`cables`, [source, device, factor]). Factors of 1 are left out.
 */
export function rigVelocityScales(
  apps: readonly { id: string; intensity: number }[], global: number, scopes: MuteScopes = {}, modes?: IntensityModes, opts: RigIntensityOpts = {},
): { sources: Record<string, number>; cables: [string, string, number][]; parts: { drum: number; bass: number } } {
  const sources: Record<string, number> = {}
  const cables: [string, string, number][] = []
  const parts = { drum: 1, bass: 1 }
  const g = Math.max(0, Math.min(127, global)) / 127
  for (const a of apps) {
    if (!isLiveRow(a.id)) continue
    // `modes` given: only the apps whose Intensity scales velocity (without it: all, as before)
    if (modes && effectiveMode(modes, a.id, opts) === 'cc7') continue
    const f = (Math.max(0, Math.min(127, a.intensity)) / 127) * g
    if (f >= 1) continue
    const scope = scopeOf(scopes, a.id)
    if (inDrumMachine(a.id, scopes)) parts[a.id as 'drum' | 'bass'] = f
    else if (scope.length) for (const dev of scope) cables.push([LIVE_APP_SOURCE[a.id], dev, f])
    else sources[LIVE_APP_SOURCE[a.id]] = f
  }
  return { sources, cables, parts }
}

/** The bassline's own MIDI channel (1–16; 0 = the Drum Machine's): CC 7 for Bass needs one. */
export interface RigIntensityOpts { bassChannel?: number }
/** A row's Intensity mode as it applies: Bass without a channel of its own can only scale velocity. */
const effectiveMode = (modes: IntensityModes, id: LiveRowId, opts: RigIntensityOpts): IntensityMode =>
  id === 'bass' && !(opts.bassChannel && opts.bassChannel >= 1) ? 'velocity' : intensityMode(modes, id)

/** What a real app's Intensity sends: CC 7 (volume, any instrument), Velocity (note-on scale), or both. */
export type IntensityMode = 'cc7' | 'velocity' | 'both'
export type IntensityModes = Partial<Record<LiveRowId, IntensityMode>>
export const DEFAULT_INTENSITY_MODE: IntensityMode = 'cc7'
export const intensityMode = (modes: IntensityModes, id: string): IntensityMode =>
  (modes[id as LiveRowId] ?? DEFAULT_INTENSITY_MODE)

/** The CC 7 value for an app: Intensity × Global, 0–127. */
export const intensityCc7 = (intensity: number, global: number): number =>
  Math.max(0, Math.min(127, Math.round((Math.max(0, Math.min(127, intensity)) * Math.max(0, Math.min(127, global))) / 127)))

/**
 * The CC 7 sends: per real app in a CC mode, its value and where (`targets`: [] = all its cables).
 */
export function rigCc7(
  apps: readonly { id: string; intensity: number }[], global: number, modes: IntensityModes = {}, scopes: MuteScopes = {}, opts: RigIntensityOpts = {},
): { id: LiveRowId; source: string; value: number; targets: string[] }[] {
  return apps
    .filter(a => isLiveRow(a.id) && effectiveMode(modes, a.id, opts) !== 'velocity')
    .map(a => ({ id: a.id as LiveRowId, source: LIVE_APP_SOURCE[a.id as LiveRowId], value: intensityCc7(a.intensity, global), targets: scopeOf(scopes, a.id as LiveRowId) }))
}

const LS_MODES = 'SYCORE_RIG_INTENSITY_MODES'
export function loadIntensityModes(): IntensityModes {
  try {
    const v = JSON.parse(localStorage.getItem(LS_MODES) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
export function saveIntensityModes(v: IntensityModes): void {
  localStorage.setItem(LS_MODES, JSON.stringify(v))
}

const LS_SCOPES = 'SYCORE_RIG_MUTE_SCOPES'
export function loadMuteScopes(): MuteScopes {
  try {
    const v = JSON.parse(localStorage.getItem(LS_SCOPES) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}
export function saveMuteScopes(v: MuteScopes): void {
  localStorage.setItem(LS_SCOPES, JSON.stringify(v))
}
