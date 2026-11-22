/**
 * mapping-adoption.ts — every controller mapping lives in a Controller Designer preset (pure).
 *
 * Phase 4 of docs/plans/projects-and-control.md: one source. A mapping made anywhere else
 * (right-click MIDI Learn, the App MIDI Mapper, a JSON rig template, the tables saved
 * before) is *adopted*: moved into a preset of its controller, then the preset sync
 * writes it back to the tables as the preset's own. Run on every change, so the first
 * run is the migration.
 *
 * Where it goes, on the mapping's device:
 *  1. the preset on that already has a control on that button (note / CC + channel):
 *     that control gets the new assignment (learning again replaces);
 *  2. else the first preset on for that device: a new control;
 *  3. else a new preset "<device> · Learned" (turned on): a new control.
 * Dropped (D2: a device is required): mappings with no device, the legacy
 * "key → name" entries, app mappings with neither note nor CC. NRPN entries are left
 * as they are (a Designer control has no NRPN).
 */
import { DESIGNER_APP_PREFIX, isDesignerLearnHelper, type DesignerPreset, type DesignerControl } from '@/lib/designer-preset-mappings'

export interface AdoptPreset extends DesignerPreset {
  name: string
  createdAt?: number
  controls: (DesignerControl & { label?: string; type?: string; x?: number; y?: number; w?: number; h?: number; color?: string; value?: number })[]
}

export interface AdoptInput {
  presets: readonly AdoptPreset[]
  enabledIds: readonly string[]
  learn: Readonly<Record<string, any>>
  app: readonly Record<string, any>[]
  labelParam: (paramName: string) => string
  labelAction: (action: string) => string
  newId?: () => string
  now?: number
}

export interface AdoptResult {
  presets: AdoptPreset[]
  enabledIds: string[]
  learn: Record<string, any>
  app: Record<string, any>[]
  /** Mappings moved into presets. */
  adopted: number
  /** Keys / ids dropped (no device, legacy, malformed). */
  dropped: string[]
  /** Presets made for devices that had none on. */
  createdPresetIds: string[]
}

const rid = () => Math.random().toString(36).slice(2, 11)
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** The button of a control or a mapping: "note:1:1" / "cc:19:1" (channel 1–16). */
function buttonOf(x: { note?: number; noteNumber?: number; cc?: number; ccNumber?: number }, channel1: number): string | null {
  const note = x.noteNumber ?? x.note
  const cc = x.ccNumber ?? x.cc
  if (typeof cc === 'number') return `cc:${cc}:${channel1}`
  if (typeof note === 'number') return `note:${note}:${channel1}`
  return null
}

const GRID_X = 76, GRID_Y = 84, PER_ROW = 8

/** A control for an adopted mapping, placed after the preset's others. */
function newControl(p: AdoptPreset, m: { note?: number; cc?: number }, channel1: number, label: string, id: string): AdoptPreset['controls'][number] {
  const i = p.controls.length
  const isNote = typeof m.note === 'number'
  return {
    id,
    type: isNote ? 'pad-momentary' : 'encoder',
    x: 20 + (i % PER_ROW) * GRID_X,
    y: 20 + Math.floor(i / PER_ROW) * GRID_Y,
    w: isNote ? 64 : 60,
    h: isNote ? 64 : 60,
    label,
    color: isNote ? '#0891b2' : '#d97706',
    value: 0,
    channel: channel1,
    ...(isNote ? { noteNumber: m.note } : { ccNumber: m.cc }),
  }
}

export function adoptMappings(input: AdoptInput): AdoptResult {
  const newId = input.newId ?? rid
  const now = input.now ?? Date.now()
  const presets: AdoptPreset[] = input.presets.map(p => ({ ...p, controls: (p.controls ?? []).map(c => ({ ...c })) }))
  const enabled = [...input.enabledIds]
  const learn: Record<string, any> = {}
  const app: Record<string, any>[] = []
  const dropped: string[] = []
  const createdPresetIds: string[] = []
  let adopted = 0

  const onFor = (device: string) => presets.filter(p => enabled.includes(p.id) && norm(p.assignedDevice) === norm(device))

  /** The control a mapping on `device` / `button` goes to (made if needed). */
  function controlFor(device: string, m: { note?: number; cc?: number }, channel1: number, label: string) {
    const button = buttonOf(m, channel1)!
    const on = onFor(device)
    for (const p of on) {
      const c = p.controls.find(x => buttonOf(x, x.channel ?? 1) === button)
      if (c) return c
    }
    let p = on[0]
    if (!p) {
      p = { id: newId(), name: `${device} · Learned`, createdAt: now, assignedDevice: device, controls: [] }
      presets.push(p)
      enabled.push(p.id)
      createdPresetIds.push(p.id)
    }
    const c = newControl(p, m, channel1, label, newId())
    p.controls.push(c)
    return c
  }

  // MIDI Learn: device-bound note / CC entries not written by a preset.
  for (const [k, v] of Object.entries(input.learn)) {
    // a preset's own, NRPN, a Designer canvas learn helper (the sync removes it): left as they are
    if (isDesignerLearnHelper(v) || (v && typeof v === 'object' && (v.designerPreset || v.nrpn))) { learn[k] = v; continue }
    const ok = v && typeof v === 'object' && v.device && typeof v.paramName === 'string' && (typeof v.cc === 'number' || typeof v.note === 'number')
    if (!ok) { dropped.push(k); continue }
    const channel1 = (typeof v.channel === 'number' && v.channel >= 0 ? v.channel : 0) + 1
    const label = input.labelParam(v.paramName)
    const c = controlFor(v.device, v, channel1, label)
    c.assignment = { type: 'app-param', paramName: v.paramName, label: `→ ${label}` } as any
    c.appMapping = undefined
    adopted++
  }

  // App mappings: the user's own (not a preset's), with a device and a note / CC.
  for (const m of input.app) {
    const id = typeof m?.id === 'string' ? m.id : ''
    if (id.startsWith(DESIGNER_APP_PREFIX)) { app.push(m); continue }
    if (!m?.device || !m.action || (typeof m.note !== 'number' && typeof m.cc !== 'number')) { dropped.push(id || '(app mapping)'); continue }
    const channel1 = (typeof m.channel === 'number' && m.channel >= 0 ? m.channel : 0) + 1
    const label = input.labelAction(m.action)
    const c = controlFor(m.device, m, channel1, label)
    c.assignment = { type: 'midi-action', action: m.action, label: `Action: ${label}` } as any
    c.appMapping = { ...m, id: DESIGNER_APP_PREFIX + c.id }
    adopted++
  }

  return { presets, enabledIds: enabled, learn, app, adopted, dropped, createdPresetIds }
}

/** Anything to adopt or drop? (cheap: the runtime skips the rest when not) */
export function needsAdoption(learn: Readonly<Record<string, any>>, app: readonly Record<string, any>[]): boolean {
  for (const v of Object.values(learn)) if (!isDesignerLearnHelper(v) && !(v && typeof v === 'object' && (v.designerPreset || v.nrpn))) return true
  return app.some(m => !(typeof m?.id === 'string' && m.id.startsWith(DESIGNER_APP_PREFIX)))
}
