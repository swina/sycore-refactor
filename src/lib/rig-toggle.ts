/**
 * rig-toggle.ts — the hardware button that switches Rig mode on and off
 * ("Ableton Live mode"), learned with MIDI Learn — one for both controllers,
 * and/or one each for the Launchpad and the MIDImix.
 *
 * A binding is one button: device name, message type + channel, note or CC.
 * Its press toggles; its release (note-off, note-on 0, CC 0) is swallowed too,
 * so the button never reaches the user's mappings.
 */

export interface RigToggleBinding {
  device: string
  /** Status byte with the channel (0x90 | ch for a note, 0xB0 | ch for a CC). */
  status: number
  data1: number
}

const kind = (status: number): number => status & 0xF0

/** The binding a message would learn: a note-on (velocity > 0) or a CC (value > 0); null otherwise. */
export function learnToggle(device: string | undefined | null, data: ArrayLike<number>): RigToggleBinding | null {
  if (!device || data.length < 3) return null
  const t = kind(data[0])
  if ((t === 0x90 || t === 0xB0) && data[2] > 0) return { device, status: data[0], data1: data[1] }
  return null
}

/** 'press', 'release' or null (another control). */
export function matchToggle(b: RigToggleBinding | null, device: string | undefined | null, data: ArrayLike<number>): 'press' | 'release' | null {
  if (!b || device !== b.device || data.length < 3 || data[1] !== b.data1) return null
  const ch = data[0] & 0x0F
  if (ch !== (b.status & 0x0F)) return null
  const t = kind(data[0])
  if (kind(b.status) === 0x90) {
    if (t === 0x90) return data[2] > 0 ? 'press' : 'release'
    if (t === 0x80) return 'release'
    return null
  }
  if (t === 0xB0) return data[2] > 0 ? 'press' : 'release'
  return null
}

/** Label for the UI, e.g. "MIDI Mix · Note 27 ch 1". */
export function toggleLabel(b: RigToggleBinding | null): string {
  if (!b) return 'not set'
  const what = kind(b.status) === 0x90 ? 'Note' : 'CC'
  return `${b.device} · ${what} ${b.data1} ch ${(b.status & 0x0F) + 1}`
}

/** Short label for a button in a tight bar, e.g. "CC 3" / "Note 27". */
export function toggleShortLabel(b: RigToggleBinding | null): string {
  if (!b) return 'Learn'
  return `${kind(b.status) === 0x90 ? 'Note' : 'CC'} ${b.data1}`
}

/** Same button (device, type, channel, number)? Note-on/off count as one. */
export function sameToggle(a: RigToggleBinding | null, b: RigToggleBinding | null): boolean {
  return !!a && !!b && a.device === b.device && a.data1 === b.data1 && (a.status & 0x0F) === (b.status & 0x0F) && kind(a.status) === kind(b.status)
}

/**
 * Which controllers a Rig key switches: 'all' (both; off remembers which were on),
 * 'lp' (the Launchpad only) or 'mix' (the MIDImix only).
 */
export type RigToggleSlot = 'all' | 'lp' | 'mix'
export const RIG_TOGGLE_SLOTS: RigToggleSlot[] = ['all', 'lp', 'mix']

const LS_KEYS: Record<RigToggleSlot, string> = {
  all: 'SYCORE_RIG_TOGGLE',
  lp: 'SYCORE_RIG_TOGGLE_LP',
  mix: 'SYCORE_RIG_TOGGLE_MIX',
}

export function loadToggle(slot: RigToggleSlot = 'all'): RigToggleBinding | null {
  try {
    const b = JSON.parse(localStorage.getItem(LS_KEYS[slot]) ?? 'null')
    return b && typeof b.device === 'string' && typeof b.status === 'number' && typeof b.data1 === 'number' ? b : null
  } catch { return null }
}

export function saveToggle(b: RigToggleBinding | null, slot: RigToggleSlot = 'all'): void {
  if (b) localStorage.setItem(LS_KEYS[slot], JSON.stringify(b))
  else localStorage.removeItem(LS_KEYS[slot])
}
