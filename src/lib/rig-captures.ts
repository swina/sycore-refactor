/**
 * rig-captures.ts — the Rig's capture clips (Launchpad row S1–S8 in Captures mode): a phrase played
 * live, recorded on the song grid, quantized to 1/16 and looped as a MIDI clip from a bar line.
 *
 * Positions are song sixteenths (float while recording): Live's grid (external-grid.ts), the Tone.js
 * transport's, or — nothing playing — a grid from the first note at the current tempo.
 *
 * Pure: buildClip turns the notes recorded into a clip, clipEventsAt gives what a clip plays on a
 * step. The engine (core/engines/rig-captures.js) records, keeps the slots and plays them.
 */

export const CLIP_SLOTS = 8

export interface RecordedNote {
  /** Song sixteenth of the note-on (float). */
  s: number
  pitch: number
  velocity: number
  /** MIDI channel 1–16. */
  channel: number
  /** Length in sixteenths (float); 0 while still held. */
  len: number
}

export interface ClipNote {
  /** Step in the clip (sixteenths from its first bar line). */
  step: number
  /** Length in sixteenths. */
  len: number
  pitch: number
  velocity: number
  channel: number
}

export interface Clip {
  /** Loop length in sixteenths (whole bars). */
  steps: number
  notes: ClipNote[]
}

/** A first note up to this early (sixteenths) before a bar line belongs to that bar (played ahead). */
const EARLY = 1

/**
 * The clip of a recording: from the bar line of its first note to the bar line nearest the stop
 * (at least one bar), every note-on quantized to the nearest sixteenth. Null with no notes.
 */
export function buildClip(notes: RecordedNote[], stopS: number): Clip | null {
  if (!notes.length) return null
  const first = Math.min(...notes.map(n => n.s))
  const startBar = Math.floor((first + EARLY) / 16) * 16
  const bars = Math.max(1, Math.round((stopS - startBar) / 16))
  const steps = bars * 16
  // the same pitch on the same step once (a note arriving on several channels — a layered or
  // multi-part keyboard — would retrigger on the one channel the clip goes out on): the loudest
  const byKey = new Map<string, ClipNote>()
  for (const n of notes) {
    const step = Math.max(0, Math.round(n.s - startBar))
    if (step >= steps) continue
    const c = { step, len: Math.max(0.5, n.len || 1), pitch: n.pitch, velocity: n.velocity, channel: n.channel }
    const k = `${step}:${n.pitch}`
    const had = byKey.get(k)
    if (!had || c.velocity > had.velocity) byKey.set(k, c)
  }
  const out = [...byKey.values()]
  out.sort((a, b) => a.step - b.step || a.pitch - b.pitch)
  return { steps, notes: out }
}

/** The notes a clip plays on its step `pos` (0 … steps − 1). */
export function clipEventsAt(clip: Clip, pos: number): ClipNote[] {
  return clip.notes.filter(n => n.step === pos)
}

/** The slot a stopped recording goes to: the one selected, else the first empty; null when full. */
export function targetSlot(clips: (Clip | null)[], selected: number | null): number | null {
  if (selected != null && selected >= 0 && selected < clips.length) return selected
  const i = clips.findIndex(c => !c)
  return i === -1 ? null : i
}

/** One line about a clip: its bars and notes. */
export function clipSummary(clip: Clip | null): string {
  if (!clip) return 'empty'
  return `${clip.steps / 16} bar${clip.steps > 16 ? 's' : ''} · ${clip.notes.length} notes`
}
