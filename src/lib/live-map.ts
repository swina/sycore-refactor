/**
 * live-map.ts — SY.CORE Map (P12 of the Ableton Live plan): a controller's encoder n drives slot n
 * of the instrument the SY.CORE Map device in Live points at (the device holds the tables).
 *
 *   map_slot_<1–16>   a MIDI Learn parameter (knob / fader, 0–127) → slot 0–15, 0–1
 *   map_var_prev / map_var_next / map_var_<1–8>   recall a Macro Variation of the Rack in focus   button
 *   map_var_store / map_var_delete    store the Macros as a new variation / delete the selected one  button
 *   map_randomize     randomize the Rack's Macros                                               button
 *   map_track_prev / map_track_next   the previous / next track (the target leaves Follow)        button
 *   map_track_follow  Follow Live's selected track on / off                                       button
 *   map_track         the track by position (0–127 across the set's tracks)                      knob / fader
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
export const mapSlotCatalog = (): { paramName: string; label: string }[] => [
  ...Array.from({ length: MAP_SLOTS }, (_, i) => ({ paramName: mapSlotParam(i), label: `Map slot ${i + 1}` })),
  { paramName: 'map_var_prev', label: 'Map Variation ◀' },
  { paramName: 'map_var_next', label: 'Map Variation ▶' },
  ...Array.from({ length: MAP_VARIATION_BUTTONS }, (_, i) => ({ paramName: `map_var_${i + 1}`, label: `Map Variation ${i + 1}` })),
  { paramName: 'map_randomize', label: 'Map Randomize Macros' },
  { paramName: 'map_var_store', label: 'Map Store variation' },
  { paramName: 'map_var_delete', label: 'Map Delete variation' },
  { paramName: 'map_track_prev', label: 'Map Track ◀' },
  { paramName: 'map_track_next', label: 'Map Track ▶' },
  { paramName: 'map_track_follow', label: 'Map Follow selected track' },
  { paramName: MAP_TRACK_KNOB, label: 'Map Track (knob)' },
]

export type MapButton =
  | { kind: 'variation'; v: number | 'next' | 'prev' | 'store' | 'delete' } | { kind: 'randomize' }
  | { kind: 'track'; step: 1 | -1 } | { kind: 'follow' }
/** A Map button of a MIDI Learn parameter name, or null. */
export function parseMapButton(name: string): MapButton | null {
  if (name === 'map_var_next') return { kind: 'variation', v: 'next' }
  if (name === 'map_var_prev') return { kind: 'variation', v: 'prev' }
  if (name === 'map_randomize') return { kind: 'randomize' }
  if (name === 'map_var_store') return { kind: 'variation', v: 'store' }
  if (name === 'map_var_delete') return { kind: 'variation', v: 'delete' }
  if (name === 'map_track_next') return { kind: 'track', step: 1 }
  if (name === 'map_track_prev') return { kind: 'track', step: -1 }
  if (name === 'map_track_follow') return { kind: 'follow' }
  const m = /^map_var_([1-8])$/.exec(name)
  return m ? { kind: 'variation', v: Number(m[1]) - 1 } : null
}
export const MAP_VARIATION_BUTTONS = 8
/** The knob that picks the track by position. */
export const MAP_TRACK_KNOB = 'map_track'

/**
 * The track a step lands on, among `tracks` (the indexes of the tracks with an instrument, in order; no
 * wrap). From a track not in the list (a group, the control track) the next / previous one after / before
 * it; from none (-1) the first / last. -1 = no track to go to.
 */
export function stepTrack(tracks: readonly number[], current: number, step: 1 | -1): number {
  if (!tracks.length) return -1
  const at = tracks.indexOf(current)
  if (at >= 0) return tracks[Math.max(0, Math.min(tracks.length - 1, at + step))]
  if (current < 0) return step > 0 ? tracks[0] : tracks[tracks.length - 1]
  const next = step > 0 ? tracks.find(t => t > current) : [...tracks].reverse().find(t => t < current)
  return next ?? (step > 0 ? tracks[tracks.length - 1] : tracks[0])
}
/** The track of a knob (0–1) across `tracks` (the indexes of the tracks with an instrument). */
export const knobTrack = (tracks: readonly number[], v: number): number =>
  (tracks.length ? tracks[Math.round(Math.max(0, Math.min(1, v)) * (tracks.length - 1))] : -1)

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
