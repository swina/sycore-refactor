/**
 * rig-launchpad.ts — the physical Launchpad Mini MK1 in "Rig" mode (P9 step 2).
 *
 * While Rig mode is on, the Rig Controller owns the Launchpad: every message
 * from it goes to the Rig Controller only (midiService.setExclusiveInput, before
 * raw listeners, MIDI Learn, MIDI Actions, the profile and Thru), and its LEDs
 * show the rig state. The user's mappings are not touched: off, they work again
 * and the Launchpad's usual LEDs come back.
 *
 * Layout (XY, as the LaunchpadMiniMK1 profile sets it): grid note = 16·row + col
 * (rows 0–7 from the top), right-side round buttons = 16·row + 8, top round
 * buttons = CC 104–111.
 *
 * LEDs: velocity = 16·green + red + flags. With automatic flashing on
 * (B0 00 28), flags 12 (Copy + Clear) light an LED steadily and flags 8
 * (Clear only) make it flash; flags 0 would leave the other buffer's old
 * colour blinking with it.
 */
import { LP_COLOR, type LpColor } from '@/lib/rig-controller'

export const isLaunchpadName = (name: string | undefined | null): boolean => /Launchpad/i.test(name ?? '')

/** LED slots: 0–63 grid (row·8 + col), 64–71 side buttons (by row), 72–79 top buttons. */
export const LP_LED_COUNT = 80

/** The message that sets LED slot `i` to velocity `v`. */
export function ledMessage(i: number, v: number): number[] {
  if (i < 64) return [0x90, 16 * Math.floor(i / 8) + (i % 8), v]
  if (i < 72) return [0x90, 16 * (i - 64) + 8, v]
  return [0xB0, 104 + (i - 72), v]
}

/** Messages for the LEDs that changed (all of them when `prev` is null). */
export function ledDiff(prev: readonly number[] | null, next: readonly number[]): number[][] {
  const out: number[][] = []
  for (let i = 0; i < next.length; i++) {
    if (!prev || prev[i] !== next[i]) out.push(ledMessage(i, next[i]))
  }
  return out
}

export const colorVelocity = (c: LpColor): number => LP_COLOR[c]

export type LaunchpadInput =
  | { kind: 'pad'; row: number; col: number; down: boolean }
  | { kind: 'side'; row: number; down: boolean }
  | { kind: 'top'; index: number; down: boolean }

/** A message from the Launchpad, in Rig terms (null: not a button). */
export function parseLaunchpadInput(data: ArrayLike<number>): LaunchpadInput | null {
  const type = data[0] & 0xF0
  const d1 = data[1] ?? 0
  const v = data[2] ?? 0
  if (type === 0x90 || type === 0x80) {
    const row = Math.floor(d1 / 16)
    const col = d1 % 16
    if (row > 7 || col > 8) return null
    const down = type === 0x90 && v > 0
    return col === 8 ? { kind: 'side', row, down } : { kind: 'pad', row, col, down }
  }
  if (type === 0xB0 && d1 >= 104 && d1 <= 111) return { kind: 'top', index: d1 - 104, down: v > 0 }
  return null
}

/** Reset, XY layout, automatic flashing. */
export const RIG_INIT_MESSAGES: number[][] = [[0xB0, 0, 0], [0xB0, 0, 1], [0xB0, 0, 0x28]]

/**
 * The hand-over point between the Rig Controller and useControllerManager.
 * `handler` set: Rig mode is on (the controller manager leaves the Launchpad's LEDs alone).
 * `restore` (set by the controller manager): give the Launchpad back its usual LEDs.
 */
export const rigLaunchpad: {
  handler: ((data: ArrayLike<number>) => void) | null
  restore: (() => void) | null
} = { handler: null, restore: null }

// ── Muting the other senders ────────────────────────────────────────────────
// SY.CORE has several feedback paths that write to a controller's port
// directly (MIDI Learn LEDs in the Chord Prog, Drum Machine…, the profile's
// LEDs). In Rig mode they would overwrite the rig's LEDs — and a plain 0 (no
// flags) makes a pad blink with automatic flashing on. The port's own `send`
// is shadowed by a no-op meanwhile; the Rig Controller writes with the original.

interface SendPort { send: (data: number[], timestamp?: number) => void; name?: string | null }
const muted = new Map<SendPort, SendPort['send']>()

export function muteOtherSenders(port: SendPort): void {
  if (muted.has(port)) return
  muted.set(port, port.send)
  port.send = () => {}
}

/** Give the muted ports (those `match` accepts, by default all) their own `send` back. */
export function unmuteOtherSenders(match?: (port: SendPort) => boolean): void {
  for (const p of [...muted.keys()]) {
    if (match && !match(p)) continue
    delete (p as Partial<SendPort>).send
    muted.delete(p)
  }
}

/** Send from the Rig Controller, past the mute. */
export function rigSend(port: SendPort, data: number[]): void {
  const original = muted.get(port)
  try {
    if (original) original.call(port, data)
    else port.send(data)
  } catch { /* port gone */ }
}
