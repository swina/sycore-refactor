/**
 * drum-perform.ts — the Drum Machine's performance controls, made for MIDI OUT (the drums played by
 * Live's Drum Rack or an external machine), each MIDI-learnable:
 *
 * - **Drum CC 1–4**: knobs that send a CC on the Drum Machine's MIDI channel, through its MIDI Flow
 *   cables (Live: map them to the Drum Rack's Macros — cutoff, resonance, decay, a send). Name and CC
 *   number are the user's. The value is the knob's, not the sequence's: a switch doesn't snap it back.
 * - **Dyn** (dynamics, 0–200 %): the velocities squeezed toward 64 (< 100) or spread from it (> 100);
 *   100 plays them as written. Ghost notes come up or go down, accents with them.
 * - **Density** (0–127): the weakest steps of the bar go first (rig-density.ts's rule); 127 all. With
 *   the Rig's own Density (LIVE) the lower of the two plays.
 * - **Humanize** (0–100): each hit a little off in time (up to ±8 ms) and velocity (up to ±12).
 *
 * Swing is the Drum Machine's own (drumStore.swing), MIDI-learnable as `dm_swing`.
 * Saved per browser (the knobs' setup and the last values).
 */
import { reactive, watch } from 'vue'

export interface DrumCcKnob { name: string; cc: number; value: number }

export const DRUM_CC_COUNT = 4
const KEY = 'SYCORE_DRUM_PERFORM'
const DEFAULT_KNOBS: DrumCcKnob[] = [
  { name: 'Cutoff', cc: 74, value: 64 },
  { name: 'Reso', cc: 71, value: 0 },
  { name: 'Decay', cc: 75, value: 64 },
  { name: 'Send', cc: 91, value: 0 },
]

interface DrumPerformState { knobs: DrumCcKnob[]; dynamics: number; density: number; humanize: number }

function read(): DrumPerformState {
  const base: DrumPerformState = { knobs: DEFAULT_KNOBS.map(k => ({ ...k })), dynamics: 100, density: 127, humanize: 0 }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || typeof raw !== 'object') return base
    if (Array.isArray(raw.knobs)) {
      base.knobs = base.knobs.map((d, i) => {
        const k = raw.knobs[i] ?? {}
        return {
          name: typeof k.name === 'string' && k.name.trim() ? k.name.slice(0, 12) : d.name,
          cc: clamp(Math.round(Number(k.cc)), 0, 127, d.cc),
          value: clamp(Math.round(Number(k.value)), 0, 127, d.value),
        }
      })
    }
    base.dynamics = clamp(Number(raw.dynamics), 0, 200, 100)
    base.density = clamp(Number(raw.density), 0, 127, 127)
    base.humanize = clamp(Number(raw.humanize), 0, 100, 0)
  } catch {}
  return base
}
function clamp(v: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
}

export const drumPerform = reactive<DrumPerformState>(read())
watch(drumPerform, (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }, { deep: true })

/** Re-read from storage (tests). */
export function reloadDrumPerform() { Object.assign(drumPerform, read()) }

/** A velocity through Dyn: squeezed toward / spread from 64; 1–127. */
export function applyDynamics(velocity: number, dynamics: number): number {
  const v = 64 + (velocity - 64) * (dynamics / 100)
  return Math.max(1, Math.min(127, Math.round(v)))
}

/** Humanize's offsets for one hit: time in seconds (±8 ms at 100), velocity (±12 at 100). */
export function humanizeOffsets(amount: number, rng: () => number = Math.random): { time: number; velocity: number } {
  if (!(amount > 0)) return { time: 0, velocity: 0 }
  const a = Math.min(100, amount) / 100
  return { time: (rng() * 2 - 1) * 0.008 * a, velocity: Math.round((rng() * 2 - 1) * 12 * a) }
}
