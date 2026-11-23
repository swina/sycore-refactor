/**
 * slot-names.ts — a name per slot A–H of each app, shown as `Verse-A` (the song, the Rig).
 *
 * Kept apart from the apps' slot data (one place for every app): Chord Prog slots, Drum Machine
 * sequences and its basslines, the Sequencer's Main / Bass / Arp lanes. A name is automatic (the
 * GEN style, the AI Song Composer's section) until written by hand (`custom`): a later GEN leaves a
 * custom name alone. Part of the engines' material (lib/engine-snapshot.ts), so it goes with a
 * session and with a song's own material. Saved per user.
 */
import { reactive, watch } from 'vue'
import { userKey } from './userKey'

export const SLOT_NAME_KEYS = ['chord', 'drum', 'dmBass', 'seq', 'bass', 'arp'] as const
export type SlotNameKey = typeof SLOT_NAME_KEYS[number]
export interface SlotName { name: string; custom: boolean }
export type SlotNamesData = Record<SlotNameKey, (SlotName | null)[]>

const LETTERS = 'ABCDEFGH'
export const SLOT_NAME_MAX = 16
const LS = 'SYCORE_SLOT_NAMES'

export const emptyNames = (): SlotNamesData =>
  Object.fromEntries(SLOT_NAME_KEYS.map(k => [k, Array(8).fill(null)])) as SlotNamesData

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, SLOT_NAME_MAX) : '')

export function parseNames(raw: unknown): SlotNamesData {
  const out = emptyNames()
  if (!raw || typeof raw !== 'object') return out
  for (const k of SLOT_NAME_KEYS) {
    const arr = (raw as any)[k]
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < 8; i++) {
      const n = clean(arr[i]?.name)
      out[k][i] = n ? { name: n, custom: arr[i]?.custom === true } : null
    }
  }
  return out
}

// ── Pure edits (on a SlotNamesData) ─────────────────────────────────────
/** An automatic name: not over a custom one (unless `force`: new content altogether). */
export function withAuto(d: SlotNamesData, key: SlotNameKey, slot: number, name: string, force = false): void {
  if (slot < 0 || slot > 7) return
  const cur = d[key][slot]
  if (cur?.custom && !force) return
  const n = clean(name)
  d[key][slot] = n ? { name: n, custom: false } : (cur?.custom && !force ? cur : null)
}
/** A name written by hand ('' = none). */
export function withCustom(d: SlotNamesData, key: SlotNameKey, slot: number, name: string): void {
  if (slot < 0 || slot > 7) return
  const n = clean(name)
  d[key][slot] = n ? { name: n, custom: true } : null
}

/** `Verse-A`, or just `A`. */
export const labelOf = (name: string | null | undefined, slot: number): string =>
  name ? `${name}-${LETTERS[slot] ?? '?'}` : LETTERS[slot] ?? '?'

// ── The user's names ─────────────────────────────────────────────────────
let state: SlotNamesData | null = null
function names(): SlotNamesData {
  if (state) return state
  let raw: unknown = null
  try { raw = JSON.parse(localStorage.getItem(userKey(LS)) || 'null') } catch {}
  state = reactive(parseNames(raw)) as SlotNamesData
  watch(state, v => { try { localStorage.setItem(userKey(LS), JSON.stringify(v)) } catch {} }, { deep: true })
  return state
}

export const slotName = (key: SlotNameKey, slot: number): string => names()[key][slot]?.name ?? ''
export const slotNameCustom = (key: SlotNameKey, slot: number): boolean => !!names()[key][slot]?.custom
export const slotLabel = (key: SlotNameKey, slot: number): string => labelOf(slotName(key, slot), slot)
export const autoName = (key: SlotNameKey, slot: number, name: string, force = false): void => withAuto(names(), key, slot, name, force)
export const setSlotName = (key: SlotNameKey, slot: number, name: string): void => withCustom(names(), key, slot, name)
export function copySlotName(key: SlotNameKey, from: number, to: number): void {
  const s = names()[key][from]
  if (to >= 0 && to < 8) names()[key][to] = s ? { ...s } : null
}
/** Asks for a name (a double-click on a slot); '' clears it. */
export function promptSlotName(key: SlotNameKey, slot: number, what: string): void {
  const cur = slotName(key, slot)
  const v = window.prompt(`${what} ${LETTERS[slot]}: name (empty = none, up to ${SLOT_NAME_MAX} characters)`, cur)
  if (v !== null) setSlotName(key, slot, v)
}

/** For the engines' snapshot (a session, a song's own material). */
export const captureNames = (): SlotNamesData => JSON.parse(JSON.stringify(names()))
export function applyNames(d: unknown): void {
  const next = parseNames(d)
  const s = names()
  for (const k of SLOT_NAME_KEYS) s[k] = next[k]
}
