// What the Program Change panel is browsing, for the Virtual Device Panel's display: the device
// and channel selected there, the bank open for it and the position of that channel's preset in
// it (index 0-based, -1 when it isn't in it), the bank's categories in list order, and the preset's
// position among the presets of its own category (catIndex 0-based, -1 if none / catTotal). Written by
// MidiDeviceProgramChangePanel.vue only.
import { shallowRef } from 'vue'
import { userKey } from './userKey'

export interface PcBrowseState { device: string; channel: number; bank: string; index: number; total: number; categories?: string[]; catIndex?: number; catTotal?: number }

export const pcBrowse = shallowRef<PcBrowseState>({ device: '', channel: 0, bank: '', index: -1, total: 0 })

// ── Categories seen per device (AI Song Composer) ─────────────────────────
// Each time the panel has a device's bank open, its categories are remembered (per user), so other
// modules can offer / match them without opening the panel on that device.
const LS_CATS = 'SYCORE_PC_CATEGORIES_BY_DEVICE'
type CatMap = Record<string, { bank: string; categories: string[] }>

function readCats(): CatMap {
  try { return JSON.parse(localStorage.getItem(userKey(LS_CATS)) || '{}') || {} } catch { return {} }
}

export function recordDeviceCategories(device: string, bank: string, categories: string[]) {
  if (!device || !bank || !categories.length) return
  const m = readCats()
  const prev = m[device]
  if (prev && prev.bank === bank && prev.categories.join('\u0001') === categories.join('\u0001')) return
  m[device] = { bank, categories }
  try { localStorage.setItem(userKey(LS_CATS), JSON.stringify(m)) } catch {}
}

/** The categories of the bank last open for `device` in the Program Change panel ([] if never seen). */
export function knownDeviceCategories(device: string): string[] {
  return readCats()[device]?.categories ?? []
}

/**
 * The category of `categories` that best matches `wanted` (an AI's "Pad", "pads", "Synth Pad"…):
 * same name (any case), else one containing the other, else a shared word. null when none.
 */
export function matchCategory(wanted: string, categories: string[]): string | null {
  const w = wanted.trim().toLowerCase()
  if (!w) return null
  const norm = (c: string) => c.trim().toLowerCase()
  const sing = (s: string) => s.replace(/(es|s)$/, '')
  return categories.find(c => norm(c) === w)
    ?? categories.find(c => sing(norm(c)) === sing(w))
    ?? categories.find(c => norm(c).includes(w) || w.includes(norm(c)))
    ?? categories.find(c => norm(c).split(/[\s/&,-]+/).some(t => t.length > 2 && w.split(/[\s/&,-]+/).some(u => sing(u) === sing(t))))
    ?? null
}
