// Virtual Device Panel helpers (pure): the preset messages to re-send on a channel, the MIDI
// Learn param names of the panel's controls, list stepping, the display labels and LCD themes.
import type { PcChannelState } from '@/types/midi'

/**
 * The messages that select a saved preset on channel `ch`: the ones recorded when it was sent
 * (PcChannelState.msgs: the device's own bank select format, e.g. Emulator X3's CC64/CC32/PC),
 * moved onto `ch`; for a state recorded before that, bank select MSB/LSB + Program Change.
 */
export function presetMessages(state: PcChannelState | null | undefined, ch: number): number[][] {
  if (!state || state.program == null) return []
  const c = ch & 0x0f
  if (state.msgs?.length) return state.msgs.map(m => [(m[0] & 0xf0) | c, ...m.slice(1)])
  return [[0xb0 | c, 0, state.msb ?? 0], [0xb0 | c, 32, state.lsb ?? 0], [0xc0 | c, state.program & 0x7f]]
}

/** `002:029` — bank (MSB, or LSB for devices that select banks with it) : program. */
export function bankProgramLabel(state: PcChannelState | null | undefined): string {
  if (!state || state.program == null) return '---:---'
  const pad = (n: number) => String(n).padStart(3, '0')
  return `${pad(state.msb || state.lsb || 0)}:${pad(state.program)}`
}

/** The next item of a list after `current` (wrapping both ways); the first one if absent. */
export function stepIn<T>(list: T[], current: T, dir: number): T | undefined {
  if (!list.length) return undefined
  const i = list.indexOf(current)
  if (i < 0) return list[0]
  return list[(i + dir + list.length) % list.length]
}

// ── MIDI Learn params (right-click on a control → useMidiCCListener.js) ──
//   vdp_cc:<device>:<cc>     a control: the CC value goes to the device's selected channel
//   vdp_<action>:<device>    preset_next / preset_prev / ch_next / ch_prev (a press steps),
//                            type (a press switches TYPE All / Category)
//   vdp_category:<device>    the CATEGORY knob: the CC value picks a category of the open bank
//   vdp_slot_<n>:<device>    saved sound slot n (1-8) of the selected channel (a press recalls it)
export type VdpParam =
  | { kind: 'cc'; device: string; cc: number }
  | { kind: 'preset_next' | 'preset_prev' | 'ch_next' | 'ch_prev' | 'type' | 'category'; device: string }
  | { kind: 'slot'; device: string; slot: number }   // 0-based

const VDP_ACTIONS = ['preset_next', 'preset_prev', 'ch_next', 'ch_prev', 'type', 'category'] as const

export const vdpCcParam = (device: string, cc: number) => `vdp_cc:${device}:${cc}`
export const vdpActionParam = (action: (typeof VDP_ACTIONS)[number], device: string) => `vdp_${action}:${device}`
export const vdpSlotParam = (slot: number, device: string) => `vdp_slot_${slot + 1}:${device}`

export function parseVdpParam(name: string): VdpParam | null {
  if (name.startsWith('vdp_cc:')) {
    const rest = name.slice('vdp_cc:'.length)
    const i = rest.lastIndexOf(':')          // the device name may itself contain ':'
    const cc = Number(rest.slice(i + 1))
    if (i <= 0 || !Number.isInteger(cc) || cc < 0 || cc > 127) return null
    return { kind: 'cc', device: rest.slice(0, i), cc }
  }
  const slot = /^vdp_slot_([1-8]):(.+)$/.exec(name)
  if (slot) return { kind: 'slot', device: slot[2], slot: Number(slot[1]) - 1 }
  for (const kind of VDP_ACTIONS) {
    const prefix = `vdp_${kind}:`
    if (name.startsWith(prefix) && name.length > prefix.length) return { kind, device: name.slice(prefix.length) }
  }
  return null
}

// ── Buttons learned on PRESET / CHANNEL ▼▲ (vdp_<action>) ─────────────────
// A CC button is momentary (127 on press, 0 on release: fire on the press only) or toggle (127 /
// 0 on alternate presses: fire on both). Detected from what it sends, like the Program Change
// panel's button learns: a 0 that comes soon after a press is a release (momentary), a 0 on its
// own is a press (toggle); once known, the mode sticks. Notes always fire on Note On. Repeats of
// the same message within REPEAT_MS are dropped (some controllers deliver a press twice).
const RELEASE_MS = 700
const REPEAT_MS = 250

export type ButtonMode = 'momentary' | 'toggle'

export class ButtonEdge {
  private state = new Map<string, { mode?: ButtonMode; pressAt: number; lastVal: number; lastAt: number }>()

  /** Whether this message is a press that should fire. `now` in ms. */
  fires(key: string, value: number, fromNote: boolean, now: number): boolean {
    if (fromNote) return this.repeatGuard(key, -1, now)
    const s = this.state.get(key) ?? { pressAt: -Infinity, lastVal: -1, lastAt: -Infinity }
    this.state.set(key, s)
    if (value === s.lastVal && now - s.lastAt < REPEAT_MS) return false
    s.lastVal = value
    s.lastAt = now
    if (value > 0) {
      s.pressAt = now
      return true
    }
    if (s.mode === 'toggle') return true
    if (s.mode === 'momentary' || now - s.pressAt < RELEASE_MS) {
      s.mode = 'momentary'
      return false
    }
    s.mode = 'toggle'
    return true
  }

  mode(key: string): ButtonMode | undefined {
    return this.state.get(key)?.mode
  }

  private repeatGuard(key: string, value: number, now: number): boolean {
    const s = this.state.get(key) ?? { pressAt: -Infinity, lastVal: -1, lastAt: -Infinity }
    this.state.set(key, s)
    if (value === s.lastVal && now - s.lastAt < REPEAT_MS) return false
    s.lastVal = value
    s.lastAt = now
    return true
  }
}

// ── CATEGORY learned on a CC (vdp_category): knob or button? ─────────────
// Decided from how the value moves, not once and for all: a knob / fader creeps (small steps
// between values), a button jumps between 0 and its press value (127, or a pad's velocity).
// A first value strictly between 0 and 127 is taken for a knob, 0 / 127 for a button; the
// guess is corrected by the next move, so a stray value no longer turns a momentary into a knob
// (which made 127 pick the last category and 0 the first).
const KNOB_STEP = 16
const BUTTON_JUMP = 48

export class CategoryControlMode {
  private state = new Map<string, { knob: boolean; lastVal: number }>()

  /**
   * How to treat this CC value: 'knob' (pick by value), 'button' (step on press) or 'skip' — the
   * 0 that shows a control taken for a knob is a button (its release): neither a pick nor a press.
   */
  classify(key: string, value: number): 'knob' | 'button' | 'skip' {
    const s = this.state.get(key)
    if (!s) {
      const knob = value !== 0 && value !== 127
      this.state.set(key, { knob, lastVal: value })
      return knob ? 'knob' : 'button'
    }
    const d = Math.abs(value - s.lastVal)
    const was = s.knob
    if (d > 0 && d <= KNOB_STEP && value !== 0 && s.lastVal !== 0) s.knob = true
    else if (d >= BUTTON_JUMP && (value === 0 || s.lastVal === 0)) s.knob = false
    s.lastVal = value
    if (s.knob) return 'knob'
    return was && value === 0 ? 'skip' : 'button'
  }
}

// ── LCD color themes ─────────────────────────────────────────────────────
// bg: the LCD's gradient (top → bottom), text / bright: its characters (bright: the active TYPE),
// accent: the dials; onDark: text / bright for themed parts on the panel's own dark background
// (the Sounds panel), when the LCD's text is dark.
export interface LcdTheme {
  id: string; label: string; bg: [string, string]; text: string; bright: string; accent: string
  onDark?: { text: string; bright: string }
}

export const LCD_THEMES: LcdTheme[] = [
  { id: 'teal',  label: 'Teal',        bg: ['#3f7f80', '#235457'], text: '#cdeeea', bright: '#e6fffb', accent: '#2dd4bf' },
  { id: 'amber', label: 'Amber',       bg: ['#2e1f06', '#160e02'], text: '#ffb547', bright: '#ffd88f', accent: '#f59e0b' },
  { id: 'green', label: 'Neon Green',  bg: ['#0d3a1c', '#04200e'], text: '#4dff8f', bright: '#b8ffd2', accent: '#22c55e' },
  { id: 'smoke', label: 'White Smoke', bg: ['#f5f5f5', '#d6d6d6'], text: '#2a2a2a', bright: '#000000', accent: '#a3a3a3',
    onDark: { text: '#d6d6d6', bright: '#f5f5f5' } },
]

export function lcdTheme(id: string): LcdTheme {
  return LCD_THEMES.find(t => t.id === id) ?? LCD_THEMES[0]
}
