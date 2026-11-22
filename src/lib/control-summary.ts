/**
 * control-summary.ts — what a controller does (the Control view: its flow and detail panel). Pure.
 *
 * A preset's assigned controls grouped: controls whose label and assignment differ
 * only by a number become one link ("Mute 1–8 → Mixer Ch 1–8: Mute"). And the
 * conflicts: one button (device + channel + note / CC) assigned by two presets on.
 */
import { learnKeyFor, type DesignerPreset, type DesignerControl } from '@/lib/designer-preset-mappings'
import { MIDI_ACTION_GROUPS, parseViCcAction, parseViChannelAction } from '@/lib/app-midi-actions'

export interface ControlLink {
  /** The controls ("Mute 1–8", "Knob 3"). */
  from: string
  /** What they do ("Mixer Ch 1–8: Mute"). */
  to: string
  count: number
}

type Ctrl = DesignerControl & { label?: string }

const targetOf = (c: Ctrl): string | null => {
  const a = c.assignment as (DesignerControl['assignment'] & { label?: string }) | undefined
  if (!a) return null
  return (a.label ?? a.action ?? a.paramName ?? '').replace(/^Action:\s*/, '').replace(/^→\s*/, '').trim() || null
}

const NUM = /\d+/g

/** "1, 2, 3, 5" → "1–3, 5" */
export function ranges(nums: readonly number[]): string {
  const s = [...new Set(nums)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`)
    i = j
  }
  return out.join(', ')
}

/**
 * The links of a set of controls. Grouped when label and target, numbers aside,
 * are the same and each has exactly one number that moves together (control N →
 * target N, or the same target for all); otherwise one line each.
 */
export function summarizeControls(controls: readonly Ctrl[]): ControlLink[] {
  const groups = new Map<string, { from: string; to: string; fromN: number[]; toN: number[]; items: Ctrl[] }>()
  const singles: ControlLink[] = []
  for (const c of controls) {
    const to = targetOf(c)
    if (!to) continue
    const from = (c.label ?? '').trim() || (c.ccNumber != null ? `CC ${c.ccNumber}` : c.noteNumber != null ? `Note ${c.noteNumber}` : '?')
    const fn = from.match(NUM) ?? []
    const tn = to.match(NUM) ?? []
    if (fn.length !== 1 || tn.length > 1) { singles.push({ from, to, count: 1 }); continue }
    const key = `${from.replace(NUM, '#')}→${to.replace(NUM, '#')}`
    const g = groups.get(key) ?? { from, to, fromN: [], toN: [], items: [] }
    g.fromN.push(Number(fn[0]))
    if (tn.length) g.toN.push(Number(tn[0]))
    g.items.push(c)
    groups.set(key, g)
  }
  const out: ControlLink[] = []
  for (const g of groups.values()) {
    if (g.items.length === 1) { out.push({ from: g.from, to: g.to, count: 1 }); continue }
    const from = g.from.replace(NUM, ranges(g.fromN))
    const to = g.toN.length ? g.to.replace(NUM, ranges(g.toN)) : g.to
    out.push({ from, to, count: g.items.length })
  }
  return [...out, ...singles]
}

export interface ControlConflict {
  device: string
  /** The button ("Note 1 · ch 1"). */
  button: string
  /** The presets on that assign it (names). */
  presets: string[]
}

/** Buttons assigned by two or more of the presets on (same device + channel + note / CC). */
export function presetConflicts(presets: readonly (DesignerPreset & { name?: string })[], enabledIds: readonly string[]): ControlConflict[] {
  const on = new Set(enabledIds)
  const byKey = new Map<string, { device: string; button: string; presets: string[] }>()
  for (const p of presets) {
    if (!on.has(p.id) || !p.assignedDevice) continue
    for (const c of p.controls ?? []) {
      if (!c.assignment) continue
      const k = learnKeyFor(p.assignedDevice, c)
      if (!k) continue
      const key = k.toLowerCase()
      const button = `${c.ccNumber != null ? `CC ${c.ccNumber}` : `Note ${c.noteNumber}`} · ch ${c.channel ?? 1}`
      const e = byKey.get(key) ?? { device: p.assignedDevice, button, presets: [] }
      const name = p.name ?? p.id
      if (!e.presets.includes(name)) e.presets.push(name)
      byKey.set(key, e)
    }
  }
  return [...byKey.values()].filter(e => e.presets.length > 1)
}

// ── The Control flow: controllers → the apps / devices they drive ─────────────

const ACTION_GROUP = new Map<string, string>()
for (const [g, list] of Object.entries(MIDI_ACTION_GROUPS)) for (const a of list) ACTION_GROUP.set(a, g)

const PARAM_PREFIX: [RegExp, string][] = [
  [/^rig_/, 'Rig Controller'],
  [/^(mix_|mixer_)/, 'Audio Mixer'],
  [/^dm_/, 'Drum Machine'],
  [/^cp_/, 'Chord Prog'],
  [/^(seq_|seq2_)/, 'Sequencer'],
  [/^arp/, 'Arpeggiator'],
  [/^(lfo|velocity_)/, 'Modulation'],
  [/^(playlist_|transport_|global_)/, 'Transport & Performance'],
  [/^(panel_|toggle_|open_|deck_|cockpit_)/, 'UI & Panels'],
]

/** What a control drives, as a node of the Control flow: an app, a device (by name), or a group. */
export function targetGroupOf(a: DesignerControl['assignment'] | undefined): string | null {
  if (!a) return null
  const name = a.action ?? a.paramName ?? ''
  if (!name) return null
  const vi = parseViCcAction(name) ?? parseViChannelAction(name)
  if (vi) return vi.instrumentName
  const vd = /^vdp_[a-z_0-9]*:(.+?)(?::\d+)?$/.exec(name)
  if (vd) return vd[1]
  if (a.type === 'midi-action' && ACTION_GROUP.has(name)) return ACTION_GROUP.get(name)!
  for (const [re, g] of PARAM_PREFIX) if (re.test(name)) return g
  return a.type === 'app-param' ? 'Sound Engine' : 'Other'
}

export interface FlowEdge { from: string; to: string; count: number }

/** The flow's edges (controller → target, how many controls) and its targets, most used first. */
export function controlFlowGraph(entries: readonly { controller: string; controls: readonly Ctrl[] }[]): { targets: string[]; edges: FlowEdge[] } {
  const edges = new Map<string, FlowEdge>()
  const used = new Map<string, number>()
  for (const { controller, controls } of entries) {
    for (const c of controls) {
      const to = targetGroupOf(c.assignment)
      if (!to) continue
      const k = `${controller}\u0000${to}`
      const e = edges.get(k) ?? { from: controller, to, count: 0 }
      e.count++
      edges.set(k, e)
      used.set(to, (used.get(to) ?? 0) + 1)
    }
  }
  const targets = [...used.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  return { targets, edges: [...edges.values()] }
}

/** A control's message, for the detail panel ("Note 1 · ch 1", "CC 19 · ch 1"). */
export function controlMessage(c: DesignerControl): string {
  if (c.ccNumber != null) return `CC ${c.ccNumber} · ch ${c.channel ?? 1}`
  if (c.noteNumber != null) return `Note ${c.noteNumber} · ch ${c.channel ?? 1}`
  return 'not learned'
}

export const controlTarget = targetOf
