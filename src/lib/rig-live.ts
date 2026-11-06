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

export function dispatchRig(ev: { name: string; detail?: Record<string, unknown> }): void {
  window.dispatchEvent(new CustomEvent(ev.name, ev.detail ? { detail: ev.detail } : undefined))
}
