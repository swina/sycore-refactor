import { shallowRef } from 'vue'

/**
 * Drum Machine play position shown in the toolbar (bar.beat).
 * A plain module ref, not a Pinia store field: DrumMachine.vue writes it once per beat
 * (never per 16th) and only the small toolbar badge reads it, so nothing else re-renders.
 * bar = 0 means "not playing / not started yet".
 */
export interface DrumPosition { bar: number; beat: number }

export const drumPosition = shallowRef<DrumPosition>({ bar: 0, beat: 0 })

/** Position of a 16th step (0–15) in the given 1-based measure, or null when it's not on a beat. */
export function beatPosition(measure: number, globalStep: number): DrumPosition | null {
  if (measure < 1 || globalStep < 0 || globalStep % 4 !== 0) return null
  return { bar: measure, beat: globalStep / 4 + 1 }
}

export function setDrumPosition(pos: DrumPosition) {
  const cur = drumPosition.value
  if (cur.bar === pos.bar && cur.beat === pos.beat) return
  drumPosition.value = pos
}

export function resetDrumPosition() { setDrumPosition({ bar: 0, beat: 0 }) }

export function formatDrumPosition(pos: DrumPosition): string {
  return pos.bar > 0 ? `${pos.bar}.${pos.beat}` : ''
}
