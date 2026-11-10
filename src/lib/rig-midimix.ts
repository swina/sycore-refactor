/**
 * rig-midimix.ts — the physical AKAI MIDImix in "Rig" mode (P9 step 2b).
 *
 * Like the Launchpad (rig-launchpad.ts): while Rig mode is on, the MIDImix's
 * messages go to the Rig Controller only (the user's MIDI Learn mappings are
 * bypassed, not changed) and its button LEDs show the rig state.
 *
 * Factory map, channel 1:
 * - knobs (3 per strip, top to bottom): CC 16–18, 20–22, 24–26, 28–30, 46–48, 50–52, 54–56, 58–60;
 * - faders: CC 19, 23, 27, 31, 49, 53, 57, 61; master fader CC 62;
 * - Mute buttons: notes 1, 4, 7 … 22 (with SOLO held they send 2, 5, 8 … 23);
 * - Rec Arm buttons: notes 3, 6, 9 … 24;
 * - Bank Left / Right: notes 25 / 26; SOLO: note 27.
 * LEDs (Mute, Rec Arm, Bank): note-on with the button's note, velocity 127 on, 0 off.
 *
 * Pots and faders are absolute: a value is taken over only once the control
 * reaches it (pickup), so moving a pot never makes the value jump.
 */

export const isMidimixName = (name: string | undefined | null): boolean => /midi\s*mix/i.test(name ?? '')

export const MIX_KNOB_BASE = [16, 20, 24, 28, 46, 50, 54, 58]
export const MIX_FADER_CC = [19, 23, 27, 31, 49, 53, 57, 61]
export const MIX_MASTER_CC = 62
export const MIX_MUTE_NOTE = [1, 4, 7, 10, 13, 16, 19, 22]
export const MIX_SOLO_NOTE = [2, 5, 8, 11, 14, 17, 20, 23]
export const MIX_REC_NOTE = [3, 6, 9, 12, 15, 18, 21, 24]
export const MIX_BANK_LEFT = 25
export const MIX_BANK_RIGHT = 26
export const MIX_SOLO_BUTTON = 27

export type MidimixInput =
  | { kind: 'knob'; strip: number; row: number; value: number }
  | { kind: 'fader'; strip: number; value: number }
  | { kind: 'master'; value: number }
  | { kind: 'mute' | 'solo' | 'rec'; strip: number; down: boolean }
  | { kind: 'bankLeft' | 'bankRight' | 'soloButton'; down: boolean }

/** A message from the MIDImix, in Rig terms, by the factory map (null: not one of its controls). */
export function parseFactoryInput(data: ArrayLike<number>): MidimixInput | null {
  const type = data[0] & 0xF0
  const d1 = data[1] ?? 0
  const v = data[2] ?? 0
  if (type === 0xB0) {
    if (d1 === MIX_MASTER_CC) return { kind: 'master', value: v }
    const f = MIX_FADER_CC.indexOf(d1)
    if (f >= 0) return { kind: 'fader', strip: f, value: v }
    for (let strip = 0; strip < 8; strip++) {
      const row = d1 - MIX_KNOB_BASE[strip]
      if (row >= 0 && row < 3) return { kind: 'knob', strip, row, value: v }
    }
    return null
  }
  if (type === 0x90 || type === 0x80) {
    const down = type === 0x90 && v > 0
    if (d1 === MIX_BANK_LEFT) return { kind: 'bankLeft', down }
    if (d1 === MIX_BANK_RIGHT) return { kind: 'bankRight', down }
    if (d1 === MIX_SOLO_BUTTON) return { kind: 'soloButton', down }
    if (d1 >= 1 && d1 <= 24) {
      const strip = Math.floor((d1 - 1) / 3)
      const kind = (['mute', 'solo', 'rec'] as const)[(d1 - 1) % 3]
      return { kind, strip, down }
    }
  }
  return null
}

// ── User map (learned) ──────────────────────────────────────────────────────
// A MIDImix reprogrammed with the Akai editor (e.g. buttons sending CCs) is
// learned control by control. A role is a control of the rig ("mute:0",
// "knob:3:1", "master"…); the map gives it the message the MIDImix sends:
// status (type + channel; notes as 0x9n) and note/CC number. Roles not in the
// map keep the factory message.

export interface MixMsg { status: number; data1: number }
export type MixMap = Record<string, MixMsg>

const BUTTON_KINDS = ['mute', 'solo', 'rec', 'bankLeft', 'bankRight', 'soloButton']

export function roleId(ev: { kind: string; strip?: number; row?: number }): string {
  if (ev.kind === 'knob') return `knob:${ev.strip}:${ev.row}`
  if (ev.strip !== undefined) return `${ev.kind}:${ev.strip}`
  return ev.kind
}

function roleEvent(id: string, data: ArrayLike<number>): MidimixInput | null {
  const [kind, a, b] = id.split(':')
  const type = data[0] & 0xF0
  const v = data[2] ?? 0
  const down = type === 0xB0 ? v > 0 : type === 0x90 && v > 0
  if (kind === 'knob') return { kind, strip: Number(a), row: Number(b), value: v }
  if (kind === 'fader') return { kind, strip: Number(a), value: v }
  if (kind === 'master') return { kind, value: v }
  if (kind === 'mute' || kind === 'solo' || kind === 'rec') return { kind, strip: Number(a), down }
  if (kind === 'bankLeft' || kind === 'bankRight' || kind === 'soloButton') return { kind, down }
  return null
}

/** The status + number a message is keyed by (note-on/off alike). */
const msgKey = (status: number, data1: number): string => {
  const t = status & 0xF0
  return `${(t === 0x80 ? 0x90 : t) | (status & 0x0F)}:${data1}`
}

/** The message to learn for a role: a note-on (velocity > 0) or any CC. */
export function learnMixMsg(data: ArrayLike<number>): MixMsg | null {
  if (data.length < 3) return null
  const t = data[0] & 0xF0
  if (t === 0xB0 || (t === 0x90 && data[2] > 0)) return { status: data[0], data1: data[1] }
  return null
}

/** Assign `msg` to `role`; a role that had the same message loses it. */
export function assignMix(map: MixMap, role: string, msg: MixMsg): MixMap {
  const k = msgKey(msg.status, msg.data1)
  const out: MixMap = {}
  for (const [r, m] of Object.entries(map)) if (r !== role && msgKey(m.status, m.data1) !== k) out[r] = m
  out[role] = { status: msg.status, data1: msg.data1 }
  return out
}

/** A message from the MIDImix, in Rig terms: the learned map first, then the factory map. */
export function parseMidimixInput(data: ArrayLike<number>, map: MixMap = {}): MidimixInput | null {
  const k = msgKey(data[0], data[1] ?? 0)
  for (const [r, m] of Object.entries(map)) {
    if (msgKey(m.status, m.data1) === k) return roleEvent(r, data)
  }
  const ev = parseFactoryInput(data)
  // A factory message whose role was learned elsewhere no longer means that role.
  if (ev && map[roleId(ev)]) return null
  return ev
}

/** The factory message of a role. */
export function factoryMsg(role: string): MixMsg | null {
  const [kind, a, b] = role.split(':')
  const i = Number(a)
  switch (kind) {
    case 'knob': return { status: 0xB0, data1: MIX_KNOB_BASE[i] + Number(b) }
    case 'fader': return { status: 0xB0, data1: MIX_FADER_CC[i] }
    case 'master': return { status: 0xB0, data1: MIX_MASTER_CC }
    case 'mute': return { status: 0x90, data1: MIX_MUTE_NOTE[i] }
    case 'solo': return { status: 0x90, data1: MIX_SOLO_NOTE[i] }
    case 'rec': return { status: 0x90, data1: MIX_REC_NOTE[i] }
    case 'bankLeft': return { status: 0x90, data1: MIX_BANK_LEFT }
    case 'bankRight': return { status: 0x90, data1: MIX_BANK_RIGHT }
    case 'soloButton': return { status: 0x90, data1: MIX_SOLO_BUTTON }
  }
  return null
}

/** "CC 40 ch 1" / "Note 3 ch 1" for a role (learned or factory). */
export function mixMsgLabel(map: MixMap, role: string): string {
  const m = map[role] ?? factoryMsg(role)
  if (!m) return ''
  return `${(m.status & 0xF0) === 0xB0 ? 'CC' : 'Note'} ${m.data1} ch ${(m.status & 0x0F) + 1}`
}

export const isMixButtonRole = (role: string): boolean => BUTTON_KINDS.includes(role.split(':')[0])

const LS_MAP = 'SYCORE_RIG_MIDIMIX_MAP'
export function loadMixMap(): MixMap {
  try {
    const m = JSON.parse(localStorage.getItem(LS_MAP) ?? '{}')
    return m && typeof m === 'object' ? m : {}
  } catch { return {} }
}
export function saveMixMap(map: MixMap): void {
  if (Object.keys(map).length) localStorage.setItem(LS_MAP, JSON.stringify(map))
  else localStorage.removeItem(LS_MAP)
}

/** LED slots: 0–7 Mute, 8–15 Rec Arm, 16 Bank Left, 17 Bank Right. */
export const MIX_LED_COUNT = 18
const ledRole = (i: number): string => (i < 8 ? `mute:${i}` : i < 16 ? `rec:${i - 8}` : i === 16 ? 'bankLeft' : 'bankRight')

/**
 * The messages that light LED slot `i`, 127 on / 0 off: the button's own message
 * (learned or factory) and, for a learned button, its factory note too — the
 * MIDImix may light its LEDs only from the factory notes, whatever the button sends.
 */
export function mixLedMessages(i: number, on: boolean, map: MixMap = {}): number[][] {
  const role = ledRole(i)
  const factory = factoryMsg(role)!
  const m = map[role] ?? factory
  const v = on ? 127 : 0
  const own = [((m.status & 0xF0) === 0xB0 ? 0xB0 : 0x90) | (m.status & 0x0F), m.data1, v]
  if (!map[role] || ((m.status & 0xF0) === 0x90 && m.data1 === factory.data1)) return [own]
  return [own, [0x90 | (m.status & 0x0F), factory.data1, v]]
}

/** Messages for the LEDs that changed (all of them when `prev` is null). */
export function mixLedDiff(prev: readonly boolean[] | null, next: readonly boolean[], map: MixMap = {}): number[][] {
  const out: number[][] = []
  for (let i = 0; i < next.length; i++) {
    if (!prev || prev[i] !== next[i]) out.push(...mixLedMessages(i, next[i], map))
  }
  return out
}

/** All LEDs off. */
export const mixLedsOff = (map: MixMap = {}): number[][] => mixLedDiff(null, Array(MIX_LED_COUNT).fill(false), map)

// ── Pickup ──────────────────────────────────────────────────────────────────
// A control takes a value over once it reaches it: within ±TOLERANCE, or by
// crossing it between two messages. It lets go when the value is changed
// elsewhere (the screen, a page switch), so it has to reach it again.

const TOLERANCE = 2

export class Pickup {
  private state = new Map<string, { engaged: boolean; last?: number; applied?: number }>()

  /** The value to apply for control `key` at `hw`, or null while it hasn't reached `current`. */
  take(key: string, hw: number, current: number): number | null {
    let st = this.state.get(key)
    if (!st) { st = { engaged: false }; this.state.set(key, st) }
    if (st.engaged && st.applied !== undefined && st.applied !== current) st.engaged = false
    if (!st.engaged) {
      const crossed = st.last !== undefined && (st.last - current) * (hw - current) <= 0
      if (Math.abs(hw - current) <= TOLERANCE || crossed) st.engaged = true
    }
    st.last = hw
    if (!st.engaged) return null
    st.applied = hw
    return hw
  }

  /** How far the control is from the value (for a "pickup" hint): hw − current, null when engaged or unknown. */
  distance(key: string, current: number): number | null {
    const st = this.state.get(key)
    if (!st || st.last === undefined) return null
    if (st.engaged && st.applied === current) return null
    return st.last - current
  }

  reset(): void { this.state.clear() }
}
