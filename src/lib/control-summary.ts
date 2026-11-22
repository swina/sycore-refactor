/**
 * control-summary.ts — what a controller does, in a few lines (the Control view). Pure.
 *
 * A preset's assigned controls grouped: controls whose label and assignment differ
 * only by a number become one link ("Mute 1–8 → Mixer Ch 1–8: Mute"). And the
 * conflicts: one button (device + channel + note / CC) assigned by two presets on.
 */
import { learnKeyFor, type DesignerPreset, type DesignerControl } from '@/lib/designer-preset-mappings'

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
