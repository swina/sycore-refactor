/**
 * control-map.ts — the SY.CORE Control Map (P3 of the Ableton Live
 * integration plan): fixed notes on one channel of the clock source port
 * (e.g. "SYC CTRL B", fed by Live), so Live's clips drive the apps with no
 * MIDI Learn per set. Live's clips are the "control sheet".
 *
 * Notes use Live's naming (C3 = 60, so C1 = 36). Channel 16 by default.
 *
 *   C1–G1  (36–43)  Chord Prog   slot A–H        — on the next bar
 *   C2–G2  (48–55)  Drum Machine sequence A–H    — on the next bar
 *   C3–G3  (60–67)  Sequencer    bank A–H        — at the end of its pattern
 *   C4     (72)     Drum Machine Fill
 *   F4     (77)     Drum Machine Generate (current style)
 *
 * Only note-ons act; note-offs are ignored. The port's messages are never
 * forwarded to devices, and the map's notes reach no app as notes.
 */

export type ControlApp = 'chord' | 'drum' | 'seq'

export type ControlAction =
  | { app: ControlApp; type: 'slot'; index: number }
  | { app: 'drum'; type: 'fill' }
  | { app: 'drum'; type: 'generate' }

/** 0-based MIDI channel of the map by default (channel 16). */
export const CONTROL_MAP_DEFAULT_CHANNEL = 15

const SLOT_ROWS: { app: ControlApp; base: number }[] = [
  { app: 'chord', base: 36 }, // C1
  { app: 'drum',  base: 48 }, // C2
  { app: 'seq',   base: 60 }, // C3
]

export const SLOT_LETTERS = 'ABCDEFGH'

/** The action a control note stands for, or null (not in the map). */
export function controlActionForNote(note: number): ControlAction | null {
  for (const row of SLOT_ROWS) {
    const i = note - row.base
    if (i >= 0 && i < 8) return { app: row.app, type: 'slot', index: i }
  }
  if (note === 72) return { app: 'drum', type: 'fill' }
  if (note === 77) return { app: 'drum', type: 'generate' }
  return null
}

/** Live-style note name (C3 = 60). */
export function liveNoteName(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return `${names[note % 12]}${Math.floor(note / 12) - 2}`
}

const APP_LABELS: Record<ControlApp, string> = { chord: 'Chord Prog', drum: 'Drum Machine', seq: 'Sequencer' }

export function describeControlAction(a: ControlAction): string {
  if (a.type === 'slot') return `${APP_LABELS[a.app]} → ${SLOT_LETTERS[a.index]}`
  return a.type === 'fill' ? 'Drum Machine → Fill' : 'Drum Machine → Generate'
}

/** The whole map, for the reference table in the UI. */
export function controlMapRows(): { notes: string; action: string }[] {
  return [
    { notes: `${liveNoteName(36)}–${liveNoteName(43)}`, action: 'Chord Prog slot A–H (next bar)' },
    { notes: `${liveNoteName(48)}–${liveNoteName(55)}`, action: 'Drum Machine sequence A–H (next bar)' },
    { notes: `${liveNoteName(60)}–${liveNoteName(67)}`, action: 'Sequencer bank A–H (end of pattern)' },
    { notes: liveNoteName(72), action: 'Drum Machine Fill' },
    { notes: liveNoteName(77), action: 'Drum Machine Generate' },
  ]
}

/**
 * The window event that performs an action in its app (the apps already
 * listen to these: MIDI Learn, Live Timeline, Chord Prog follow).
 */
export function controlActionEvent(a: ControlAction): { name: string; detail?: Record<string, unknown> } {
  if (a.type === 'fill') return { name: 'dm-trigger-fill' }
  if (a.type === 'generate') return { name: 'dm-generate' }
  switch (a.app) {
    case 'chord': return { name: 'cp-slot-cue', detail: { idx: a.index } }
    case 'drum':  return { name: 'dm-seq-switch', detail: { seq: SLOT_LETTERS[a.index], quantize: true } }
    case 'seq':   return { name: 'seq-bank-cue', detail: { idx: a.index } }
  }
}
