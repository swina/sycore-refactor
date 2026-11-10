/**
 * rig-density.ts — the Rig Controller's Density on the real apps (LIVE).
 *
 * Density only thins a pattern out: 127 plays it as written; lower, the weakest
 * steps of the bar go first — off-beat 16ths, then 8ths, then beats 2 and 4,
 * then beat 3 — down to the downbeat alone at 0. An accented step holds one level
 * longer. Deterministic (no dice): the groove stays the same pass after pass,
 * only sparser. Live crescendos and breaks without preparing other patterns.
 *
 * Set by the Rig Controller panel (LIVE) or a MIDI-learned encoder
 * (`rig_density_drum`, `rig_density_seq`); read by the Drum Machine and the
 * Sequencer for each step. Only while the panel is open in LIVE (`active`).
 */
import { reactive } from 'vue'

export type DensityApp = 'drum' | 'seq'
export const DENSITY_APPS: readonly DensityApp[] = ['drum', 'seq']

export const rigDensity = reactive({ active: false, drum: 127, seq: 127 })

/** Metric weight of a 16th in the bar: 4 downbeat, 3 beat 3, 2 beats 2/4, 1 8ths, 0 off-beat 16ths (+1 accent). */
export function stepWeight(pos16: number, accent = false): number {
  const p = ((Math.round(pos16) % 16) + 16) % 16
  const w = p === 0 ? 4 : p === 8 ? 3 : p % 4 === 0 ? 2 : p % 2 === 0 ? 1 : 0
  return w + (accent ? 1 : 0)
}

/** Whether a step at song 16th `pos16` plays at `density` (0–127). */
export function densityKeeps(pos16: number, accent: boolean, density: number): boolean {
  if (density >= 127) return true
  const threshold = Math.floor(((127 - Math.max(0, density)) * 5) / 128) // 0 (all) … 4 (downbeat)
  return stepWeight(pos16, accent) >= threshold
}

/** The Density an app plays with now: 127 unless the Rig panel is open in LIVE. */
export const densityFor = (id: DensityApp): number => (rigDensity.active ? rigDensity[id] : 127)
