// Roland S-1 (pcTemplate 'roland-s1') banks: the S-1 has a sound engine but no Program Change
// banks — its sounds are SY.CORE's Sound Library presets, sent as CC parameter values. A bank
// built from them (or imported from a file) lets the Program Change panel and the Virtual Device
// browse them like any other bank: each bank sound carries the whole preset, and selecting it
// recalls the preset on the sound engine instead of sending bank select + Program Change.
import type { Preset } from '@/types/preset'
import { FIELD_TO_CC } from '@/constants/s1-config'

export const S1_BANK_SOURCE = 'roland-s1' as const
export const S1_DEFAULT_BANK = 'Sound Library'
export const S1_BANK_FORMAT = 'sycore-s1-bank'

/** A sound of an S-1 bank: name / category / program (1-based position) like other banks, plus the preset. */
export interface S1BankSound {
  name: string
  category: string
  program: number
  preset: Preset
}

/** The bank sounds for these presets, in order (program 1..N). Presets are copied. */
export function presetsToS1Sounds(presets: Preset[]): S1BankSound[] {
  return (presets ?? [])
    .filter(p => p && typeof p.name === 'string')
    .map((p, i) => ({
      name: p.name,
      category: p.category ?? '',
      program: i + 1,
      preset: JSON.parse(JSON.stringify(p)),
    }))
}

/** The exported file's content: { format, version, name, presets }. */
export function s1BankFile(name: string, sounds: S1BankSound[]) {
  return { format: S1_BANK_FORMAT, version: 1, name, exportedAt: new Date().toISOString(), presets: sounds.map(s => s.preset) }
}

/**
 * Reads an S-1 bank file: an exported bank ({ format, name, presets }) or a bare array of
 * presets. Throws when nothing in it looks like an S-1 preset (a name and synth data).
 */
export function parseS1BankFile(json: unknown, fallbackName = 'Imported Bank'): { name: string; sounds: S1BankSound[] } {
  const obj = json as any
  const list: any[] = Array.isArray(obj) ? obj : Array.isArray(obj?.presets) ? obj.presets : []
  const presets = list.filter(p => p && typeof p.name === 'string' && (p.aVariant?.data || p.data))
  if (!presets.length) throw new Error('No S-1 presets in this file.')
  const name = (!Array.isArray(obj) && typeof obj?.name === 'string' && obj.name.trim()) || fallbackName
  return { name, sounds: presetsToS1Sounds(presets) }
}

/** A copy of the bank sound's preset to recall (recallPreset migrates / keeps what it gets). */
export function s1PresetToRecall(sound: { preset?: Preset } | null | undefined): Preset | null {
  return sound?.preset ? JSON.parse(JSON.stringify(sound.preset)) : null
}

/**
 * The CC messages that set the S-1's sound engine to a preset, on channel `ch` (0-based): every
 * parameter of the preset's A variant (else its old `data`) that the S-1 has a CC for, LFO Sync
 * first (it sets how LFO Rate reads). Values rounded and clamped to 0–127.
 */
export function s1PresetCcMessages(preset: Preset | null | undefined, ch: number): number[][] {
  const data: Record<string, unknown> = (preset as any)?.aVariant?.data ?? (preset as any)?.data ?? {}
  const c = ch & 0x0f
  const out: number[][] = []
  const push = (field: string) => {
    const cc = FIELD_TO_CC[field], v = data[field]
    if (cc === undefined || typeof v !== 'number' || !Number.isFinite(v)) return
    out.push([0xb0 | c, cc & 0x7f, Math.max(0, Math.min(127, Math.round(v)))])
  }
  if ('lfoSync' in data) push('lfoSync')
  for (const field of Object.keys(data)) if (field !== 'lfoSync') push(field)
  return out
}
