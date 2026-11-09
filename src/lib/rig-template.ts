/**
 * rig-template.ts — a controller's Rig Controller mapping as a JSON file ("rig template").
 *
 * The file holds the same MIDI Learn mappings made by hand (right-click a rig control → MIDI
 * Learn, rig-actions.ts), so applying it is like learning every control at once: LED feedback,
 * the amber ring and the Controller Designer work unchanged. Exported from a mapped controller,
 * imported on another computer, shared, or shipped ready for common controllers.
 *
 *   {
 *     "format": "sycore-rig-template", "version": 1,
 *     "name": "Novation Launchkey 49",
 *     "match": "Launchkey",                       // part of the MIDI port name (optional)
 *     "init": ["F0 00 20 29 02 0F 0C 01 F7"],     // SysEx sent when applied (optional)
 *     "controls": {
 *       "rig_slot_drum_a": { "note": 40, "channel": 10 },  // channel 1–16
 *       "rig_density_drum": { "cc": 21, "channel": 1 }
 *     },
 *     "leds": { "palette": { "filled": 9, "playing": 21 } }  // values per LED state (optional)
 *   }
 */
import { parseRigAction, type LedPalette, type RigLedState } from '@/lib/rig-actions'

export const RIG_TEMPLATE_FORMAT = 'sycore-rig-template'

export interface RigTemplateControl { note?: number; cc?: number; channel: number }
export interface RigTemplate {
  format: typeof RIG_TEMPLATE_FORMAT
  version: 1
  name: string
  match?: string
  init?: string[]
  controls: Record<string, RigTemplateControl>
  leds?: { palette?: Partial<LedPalette> }
}

/** A MIDI Learn mapping as the mapping store keeps it (channel 0–15). */
export interface StoredMapping { cc?: number; note?: number; device: string | null; channel: number | null; paramName: string }
export type StoredMappings = Record<string, StoredMapping | string>

const LED_STATES: RigLedState[] = ['off', 'filled', 'playing', 'queued', 'muted', 'solo']
const isMidi7 = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 127
const isRigMapping = (m: StoredMapping | string): m is StoredMapping =>
  typeof m === 'object' && !!m?.paramName?.startsWith('rig_') && ('cc' in m || 'note' in m)

/** The store key of a mapping (as the mapping store's confirmLearn builds it). */
export function mappingKey(device: string, channel0: number, kind: 'cc' | 'note', number: number): string {
  return `${device}:CH${channel0 + 1}:${kind === 'note' ? `NOTE${number}` : `CC${number}`}`
}

/** The rig controls learned on `device`. */
export function rigMappingsOf(mappings: StoredMappings, device: string): StoredMapping[] {
  return Object.values(mappings).filter(isRigMapping).filter(m => m.device === device)
}

/** The devices that have rig controls learned, with how many. */
export function rigMappedDevices(mappings: StoredMappings): { device: string; count: number }[] {
  const n = new Map<string, number>()
  for (const m of Object.values(mappings)) if (isRigMapping(m) && m.device) n.set(m.device, (n.get(m.device) ?? 0) + 1)
  return [...n].map(([device, count]) => ({ device, count })).sort((a, b) => a.device.localeCompare(b.device))
}

/** The template of `device`'s rig controls. */
export function exportRigTemplate(mappings: StoredMappings, device: string, name = device, extra: Partial<RigTemplate> = {}): RigTemplate {
  const controls: Record<string, RigTemplateControl> = {}
  for (const m of rigMappingsOf(mappings, device)) {
    const channel = (m.channel ?? 0) + 1
    controls[m.paramName] = m.note !== undefined ? { note: m.note, channel } : { cc: m.cc, channel }
  }
  return { format: RIG_TEMPLATE_FORMAT, version: 1, name, match: device, ...extra, controls }
}

/** Read a template file: the template, or what is wrong with it. Unknown controls are reported. */
export function parseRigTemplate(text: string): { template: RigTemplate; warnings: string[] } | { error: string } {
  let raw: any
  try { raw = JSON.parse(text) } catch { return { error: 'Not a JSON file' } }
  if (!raw || raw.format !== RIG_TEMPLATE_FORMAT) return { error: `Not a SY.CORE rig template (format "${RIG_TEMPLATE_FORMAT}")` }
  if (raw.version !== 1) return { error: `Unsupported template version ${raw.version}` }
  if (!raw.controls || typeof raw.controls !== 'object') return { error: 'No "controls"' }
  const warnings: string[] = []
  const controls: Record<string, RigTemplateControl> = {}
  for (const [param, c] of Object.entries<any>(raw.controls)) {
    if (!parseRigAction(param)) { warnings.push(`Unknown control "${param}" skipped`); continue }
    const channel = Number(c?.channel ?? 1)
    if (!(Number.isInteger(channel) && channel >= 1 && channel <= 16)) { warnings.push(`${param}: channel must be 1–16`); continue }
    if (isMidi7(c?.note)) controls[param] = { note: c.note, channel }
    else if (isMidi7(c?.cc)) controls[param] = { cc: c.cc, channel }
    else warnings.push(`${param}: needs a "note" or a "cc" (0–127)`)
  }
  const palette: Partial<LedPalette> = {}
  for (const st of LED_STATES) {
    const v = raw.leds?.palette?.[st]
    if (v === undefined) continue
    if (isMidi7(v)) palette[st] = v
    else warnings.push(`leds.palette.${st} must be 0–127`)
  }
  const init = Array.isArray(raw.init) ? raw.init.filter((h: unknown) => {
    const ok = typeof h === 'string' && sysexBytes(h) !== null
    if (!ok) warnings.push(`init: "${String(h)}" is not a SysEx message (F0 … F7)`)
    return ok
  }) : undefined
  const template: RigTemplate = {
    format: RIG_TEMPLATE_FORMAT, version: 1,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Rig template',
    ...(typeof raw.match === 'string' && raw.match.trim() ? { match: raw.match.trim() } : {}),
    ...(init?.length ? { init } : {}),
    controls,
    ...(Object.keys(palette).length ? { leds: { palette } } : {}),
  }
  return { template, warnings }
}

/** The mappings with `template` applied to `device`: its previous rig controls replaced. */
export function applyRigTemplate(mappings: StoredMappings, template: RigTemplate, device: string): StoredMappings {
  const next: StoredMappings = {}
  for (const [k, m] of Object.entries(mappings)) if (!(isRigMapping(m) && m.device === device)) next[k] = m
  for (const [paramName, c] of Object.entries(template.controls)) {
    const ch0 = c.channel - 1
    if (c.note !== undefined) next[mappingKey(device, ch0, 'note', c.note)] = { note: c.note, device, channel: ch0, paramName }
    else if (c.cc !== undefined) next[mappingKey(device, ch0, 'cc', c.cc)] = { cc: c.cc, device, channel: ch0, paramName }
  }
  return next
}

/** The mappings without `device`'s rig controls. */
export function clearRigMappings(mappings: StoredMappings, device: string): StoredMappings {
  return Object.fromEntries(Object.entries(mappings).filter(([, m]) => !(isRigMapping(m) && m.device === device)))
}

/** Whether a template is meant for a MIDI port (its `match`, case-insensitive). */
export const templateMatches = (t: Pick<RigTemplate, 'match'>, portName: string): boolean =>
  !!t.match && portName.toLowerCase().includes(t.match.toLowerCase())

/** "F0 00 20 29 … F7" → bytes, or null when it isn't one SysEx message. */
export function sysexBytes(hex: string): number[] | null {
  const parts = hex.trim().split(/[\s,]+/).filter(Boolean)
  if (!parts.length || !parts.every(p => /^(0x)?[0-9a-f]{1,2}$/i.test(p))) return null
  const bytes = parts.map(p => parseInt(p.replace(/^0x/i, ''), 16))
  if (bytes[0] !== 0xF0 || bytes[bytes.length - 1] !== 0xF7) return null
  if (bytes.slice(1, -1).some(b => b > 0x7F)) return null
  return bytes
}

/** A file name for a template. */
export const templateFileName = (t: Pick<RigTemplate, 'name'>): string =>
  `${t.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'rig'}.sycore-rig.json`
