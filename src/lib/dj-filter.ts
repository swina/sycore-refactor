/**
 * dj-filter.ts — the Rig Controller's DJ Filter (Launchpad side, the old Key + button): while it is
 * held the filter cutoff (CC 21) closes from fully open down to DJ_FILTER_FLOOR over DJ_FILTER_SWEEP_MS
 * (faster at first, as a DJ's knob turned by hand); released, it opens again at once.
 */
import { reactive, watch } from 'vue'

/** The default CC (the device's cutoff); the one used is djFilter.cc, set in the Launchpad panel. */
export const DJ_FILTER_CC = 21
export const DJ_FILTER_OPEN = 127
export const DJ_FILTER_FLOOR = 12
export const DJ_FILTER_SWEEP_MS = 2000

/** The cutoff after the button has been held `heldMs`. */
export function djCutoff(heldMs: number): number {
  const t = Math.max(0, Math.min(1, heldMs / DJ_FILTER_SWEEP_MS))
  const eased = 1 - (1 - t) * (1 - t) // ease-out
  return Math.round(DJ_FILTER_OPEN - (DJ_FILTER_OPEN - DJ_FILTER_FLOOR) * eased)
}

const KEY = 'SYCORE_DJ_FILTER'
/** A CC number 0–127, else the default. */
export function djFilterCc(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 127 ? n : DJ_FILTER_CC
}
function read(): { cc: number } {
  try { return { cc: djFilterCc(JSON.parse(localStorage.getItem(KEY) || 'null')?.cc) } } catch { return { cc: DJ_FILTER_CC } }
}
/** The DJ Filter's settings, saved per browser. */
export const djFilter = reactive(read())
watch(djFilter, v => { try { localStorage.setItem(KEY, JSON.stringify({ cc: djFilterCc(v.cc) })) } catch {} })
