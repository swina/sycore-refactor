// MIDI learn for the FM-1 emulator's panel controls: a CC or note from any MIDI input turns an
// encoder, moves MASTER or presses a button of the emulated device — as if done by hand, so it
// works with every firmware whatever MIDI it implements. Ids follow fm1-emu's panel
// (crates/fm1-live/src/panel.rs: ENCS in panel order, the pot, key-matrix ids of the buttons).

export type Fm1Target =
  | { kind: 'enc'; index: number }
  | { kind: 'pot' }
  | { kind: 'key'; id: number }

export interface Fm1Control { id: string; label: string; target: Fm1Target }

const ENCODERS = ['SELECT', 'PRESETS', 'ALGORITHM', 'K1', 'K2', 'K3', 'K4']
const BUTTONS: [string, number][] = [
  ['OCT−', 0], ['OCT+', 1], ['FX', 2], ['SCL', 3], ['ENV', 4], ['LFO', 5], ['EDIT', 6],
  ['GLO', 7], ['HOME', 8], ['SAVE', 9], ['ARP', 10], ['SEQ', 11], ['PLAY', 12], ['REC', 13],
]

export const FM1_CONTROLS: Fm1Control[] = [
  ...ENCODERS.map((label, index) => ({ id: `enc:${index}`, label, target: { kind: 'enc', index } as Fm1Target })),
  { id: 'pot', label: 'MASTER', target: { kind: 'pot' } },
  ...BUTTONS.map(([label, id]) => ({ id: `key:${id}`, label, target: { kind: 'key', id } as Fm1Target })),
]

/**
 * How an encoder reads its CC: `abs` a knob sending 0..127 (each change of `div` steps is one
 * click); relative encoders, the three usual encodings: `rel2c` two's complement (1..63 up,
 * 127..65 down), `rel64` offset 64 (65.. up, 63.. down), `relsm` sign bit (1..63 up, 65..127
 * down); `auto` reads it as absolute until the values give a relative encoder away (it repeats a
 * value, which a knob never does) and then fixes the mode. `rel` is the old name of `rel2c`.
 */
export type EncMode = 'auto' | 'abs' | 'rel2c' | 'rel64' | 'relsm' | 'rel'

export const ENC_MODES: { value: EncMode; label: string; title: string }[] = [
  { value: 'auto', label: 'auto', title: 'Detects the encoder type from what it sends' },
  { value: 'abs', label: 'abs', title: 'Knob sending 0..127' },
  { value: 'rel64', label: 'rel 64', title: 'Relative, offset 64: 65.. up, 63.. down' },
  { value: 'rel2c', label: 'rel 2c', title: "Relative, two's complement: 1.. up, 127.. down" },
  { value: 'relsm', label: 'rel sb', title: 'Relative, sign bit: 1.. up, 65.. down' },
]

/** Signed clicks of a relative encoder's value. */
export function relClicks(mode: 'rel2c' | 'rel64' | 'relsm', v: number): number {
  if (mode === 'rel64') return v - 64
  if (mode === 'relsm') return v & 0x40 ? -(v & 0x3f) : v
  return v < 64 ? v : v - 128
}

/**
 * The relative encoding a run of values (a repeat seen, so not a knob) points to: values just
 * under 64 only come from offset 64, near 127 only from two's complement, low ones together
 * with 65.. from sign bit; one direction only falls back to the reading that agrees with it.
 */
export function inferRelMode(values: number[]): 'rel2c' | 'rel64' | 'relsm' {
  const has = (lo: number, hi: number) => values.some(v => v >= lo && v <= hi)
  if (has(96, 127)) return 'rel2c'
  if (has(32, 63)) return 'rel64'
  if (has(1, 31) && has(65, 95)) return 'relsm'
  if (has(65, 95)) return 'rel64'
  return 'rel2c'
}

export interface Fm1Mapping {
  control: string               // Fm1Control.id
  type: 'cc' | 'note'
  channel: number               // 0..15
  number: number                // CC or note number
  mode?: EncMode                // encoders only (default auto)
  div?: number                  // abs encoders: CC steps per click (default 2)
}

/** What the emulator page is told to do (posted as `{type: "sycore-ctl", ...action}`). */
export type Fm1Action =
  | { kind: 'enc'; index: number; clicks: number }
  | { kind: 'pot'; value: number }
  | { kind: 'key'; id: number; down: boolean }

/** The CC/note a message is, or null for anything else. Note-on velocity 0 counts as a note-off. */
export function midiSource(data: ArrayLike<number>): { type: 'cc' | 'note'; channel: number; number: number; value: number; on: boolean } | null {
  if (data.length < 3) return null
  const st = data[0] & 0xf0, channel = data[0] & 0x0f
  if (st === 0xb0) return { type: 'cc', channel, number: data[1], value: data[2], on: data[2] >= 64 }
  if (st === 0x90 || st === 0x80) {
    const on = st === 0x90 && data[2] > 0
    return { type: 'note', channel, number: data[1], value: data[2], on }
  }
  return null
}

export function findMapping(mappings: Fm1Mapping[], data: ArrayLike<number>): Fm1Mapping | undefined {
  const s = midiSource(data)
  if (!s) return undefined
  return mappings.find(m => m.type === s.type && m.channel === s.channel && m.number === s.number)
}

/**
 * Turns mapped MIDI into panel actions. Keeps the per-mapping state an absolute knob needs
 * (its last value and the steps not yet worth a click).
 */
export class Fm1ControlMapper {
  private last = new Map<string, number>()
  private acc = new Map<string, number>()
  private seen = new Map<string, number[]>()

  /** `onDetect`: an `auto` mapping found its encoder type (the caller saves it in the mapping). */
  constructor(private getMappings: () => Fm1Mapping[], private onDetect?: (control: string, mode: EncMode) => void) {}

  reset() { this.last.clear(); this.acc.clear(); this.seen.clear() }

  /** The action for a message, or null when it is not mapped (or not worth a click yet). */
  handle(data: ArrayLike<number>): Fm1Action | null {
    const mappings = this.getMappings()
    const m = findMapping(mappings, data)
    if (!m) return null
    const ctl = FM1_CONTROLS.find(c => c.id === m.control)
    if (!ctl) return null
    const s = midiSource(data)!
    const t = ctl.target

    if (t.kind === 'key') return { kind: 'key', id: t.id, down: s.on }

    if (t.kind === 'pot') {
      if (s.type !== 'cc') return null
      return { kind: 'pot', value: Math.round(s.value * 1023 / 127) }
    }

    // encoder
    if (s.type === 'note') return s.on ? { kind: 'enc', index: t.index, clicks: 1 } : null
    const key = m.control
    let mode = m.mode ?? 'auto'
    if (mode === 'rel') mode = 'rel2c'
    const prev = this.last.get(key)
    if (mode === 'auto') {
      const seen = this.seen.get(key) ?? []
      seen.push(s.value)
      if (seen.length > 8) seen.shift()
      this.seen.set(key, seen)
      if (prev === s.value) {
        // a repeat: a relative encoder. Fix its mode and read this value with it.
        mode = inferRelMode(seen)
        this.seen.delete(key)
        this.onDetect?.(key, mode)
      }
    }
    if (mode === 'rel2c' || mode === 'rel64' || mode === 'relsm') {
      this.last.set(key, s.value)
      const clicks = relClicks(mode, s.value)
      return clicks ? { kind: 'enc', index: t.index, clicks } : null
    }
    this.last.set(key, s.value)
    if (prev === undefined) return null          // first value: only where the knob is
    const div = Math.max(1, m.div ?? 2)
    const acc = (this.acc.get(key) ?? 0) + (s.value - prev)
    const clicks = Math.trunc(acc / div)
    this.acc.set(key, acc - clicks * div)
    return clicks ? { kind: 'enc', index: t.index, clicks } : null
  }
}

export function describeMapping(m: Fm1Mapping): string {
  return `${m.type === 'cc' ? 'CC' : 'Note'} ${m.number} · ch ${m.channel + 1}`
}
