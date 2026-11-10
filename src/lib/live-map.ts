/**
 * live-map.ts — SY.CORE Map (P12 of the Ableton Live plan): a controller's encoder n drives slot n
 * of the instrument the SY.CORE Map device in Live points at (the device holds the tables).
 *
 *   map_slot_<1–16>   a MIDI Learn parameter (knob / fader, 0–127) → slot 0–15, 0–1
 *
 * Pickup (soft takeover) for absolute knobs: after a track change, or when the parameter moved in
 * Live (mouse, automation), a knob takes over only once it reaches the parameter's value (or crosses
 * it) — no jump. Relative-style "jump" mode sends at once.
 */
export const MAP_SLOTS = 16

/** The MIDI Learn parameter of a slot (0–15). */
export const mapSlotParam = (slot: number) => `map_slot_${slot + 1}`

/** The slot (0–15) of a MIDI Learn parameter name, or null. */
export function parseMapSlot(name: string): number | null {
  const m = /^map_slot_(\d{1,2})$/.exec(name)
  const n = m ? Number(m[1]) : 0
  return n >= 1 && n <= MAP_SLOTS ? n - 1 : null
}

/** Every Map slot, for MIDI Learn menus and docs: { paramName, label }. */
export const mapSlotCatalog = (): { paramName: string; label: string }[] =>
  Array.from({ length: MAP_SLOTS }, (_, i) => ({ paramName: mapSlotParam(i), label: `Map slot ${i + 1}` }))

export interface PickupSlot {
  /** the knob drives the parameter (it reached it) */
  caught: boolean
  /** the knob's last position (0–1), null = not moved since the reset */
  knob: number | null
  /** when the knob last sent (ms): Live's echo of our own moves is ignored for ECHO_MS after */
  sentAt: number
}

export const pickupSlot = (): PickupSlot => ({ caught: false, knob: null, sentAt: -Infinity })

/** How long after a move Live's values are taken as its echo (the device reports every 30 ms, plus the trip). */
export const ECHO_MS = 400

/** How close (0–1) a knob must come to the parameter to take over. */
export const PICKUP_TOLERANCE = 0.03

/**
 * A knob moved to `knob` (0–1) at `now` (ms) while the parameter is at `param` (0–1): whether to send it.
 * It takes over when it comes within the tolerance or crosses the parameter's value since its last
 * position. `param` null = unknown (no feedback yet): sent at once.
 */
export function pickupMove(st: PickupSlot, knob: number, param: number | null, now: number, tol = PICKUP_TOLERANCE): boolean {
  const prev = st.knob
  st.knob = knob
  if (!st.caught && param !== null && !(Math.abs(knob - param) <= tol || (prev !== null && (prev - param) * (knob - param) <= 0))) return false
  st.caught = true
  st.sentAt = now
  return true
}

/**
 * The parameter's value came from Live at `now` (ms). Our own moves come back as an echo (within
 * ECHO_MS of a send, or close to the knob): the knob stays in control; a different value (mouse, automation, preset) makes the knob pick it up again.
 */
export function pickupFeedback(st: PickupSlot, param: number, now: number, tol = PICKUP_TOLERANCE): void {
  if (now - st.sentAt < ECHO_MS) return
  if (st.caught && st.knob !== null && Math.abs(st.knob - param) > tol) st.caught = false
}
