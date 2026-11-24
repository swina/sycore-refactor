// MicroFreak Editor model: the panel's parameters (the synth's MIDI CCs), their
// place in a SysEx preset dump, and the sound generator (random by character,
// mutate). Values are CC values 0..127.
//
// Unverified on the unit (to check): Param1–3 = Wave / Timbre / Shape, the
// Cycling Env's RiseLvl / FallLvl = its Rise / Fall times, and how CC 9 picks
// the oscillator (here: the middle of 23 equal slices of 0..127).
import { findParam, OSC_TYPES, CATEGORIES, type MfPreset } from './sysex'

export type EdSection = 'Oscillator' | 'Filter' | 'Cycling Env' | 'Envelope' | 'LFO' | 'Arp / Seq' | 'Keyboard'
export const ED_SECTIONS: EdSection[] = ['Oscillator', 'Filter', 'Cycling Env', 'Envelope', 'LFO', 'Arp / Seq', 'Keyboard']

export interface EdParam {
  id: string
  label: string
  section: EdSection
  cc: number
  /** Where the dump holds it ([section, param]); none when not found in the dump. */
  sysex?: [string, string]
  kind: 'cont' | 'type'
  /** Part of a generated sound (rates, Spice: no). */
  gen: boolean
}

export const ED_PARAMS: EdParam[] = [
  { id: 'type', label: 'Type', section: 'Oscillator', cc: 9, sysex: ['VCO', 'Type'], kind: 'type', gen: true },
  { id: 'wave', label: 'Wave', section: 'Oscillator', cc: 10, sysex: ['VCO', 'Param1'], kind: 'cont', gen: true },
  { id: 'timbre', label: 'Timbre', section: 'Oscillator', cc: 12, sysex: ['VCO', 'Param2'], kind: 'cont', gen: true },
  { id: 'shape', label: 'Shape', section: 'Oscillator', cc: 13, sysex: ['VCO', 'Param3'], kind: 'cont', gen: true },
  { id: 'cutoff', label: 'Cutoff', section: 'Filter', cc: 23, sysex: ['VCF', 'Cutoff'], kind: 'cont', gen: true },
  { id: 'reso', label: 'Resonance', section: 'Filter', cc: 83, sysex: ['VCF', 'Reso'], kind: 'cont', gen: true },
  { id: 'cyc_rise', label: 'Rise', section: 'Cycling Env', cc: 102, sysex: ['EG1', 'RiseLvl'], kind: 'cont', gen: true },
  { id: 'cyc_fall', label: 'Fall', section: 'Cycling Env', cc: 103, sysex: ['EG1', 'FallLvl'], kind: 'cont', gen: true },
  { id: 'cyc_hold', label: 'Hold', section: 'Cycling Env', cc: 28, sysex: ['EG1', 'Hold'], kind: 'cont', gen: true },
  { id: 'cyc_amount', label: 'Amount', section: 'Cycling Env', cc: 24, sysex: ['EG1', 'Amount'], kind: 'cont', gen: true },
  { id: 'env_attack', label: 'Attack', section: 'Envelope', cc: 105, sysex: ['EG2', 'Attack'], kind: 'cont', gen: true },
  { id: 'env_decay', label: 'Decay / Rel', section: 'Envelope', cc: 106, sysex: ['EG2', 'DecRel'], kind: 'cont', gen: true },
  { id: 'env_sustain', label: 'Sustain', section: 'Envelope', cc: 29, sysex: ['EG2', 'Sustain'], kind: 'cont', gen: true },
  { id: 'env_filter', label: 'Filter amt', section: 'Envelope', cc: 26, kind: 'cont', gen: true },
  { id: 'lfo_rate', label: 'Rate', section: 'LFO', cc: 93, sysex: ['LFO', 'Rate'], kind: 'cont', gen: true },
  { id: 'lfo_sync', label: 'Rate (sync)', section: 'LFO', cc: 94, sysex: ['LFO', 'Div'], kind: 'cont', gen: false },
  { id: 'arp_rate', label: 'Rate', section: 'Arp / Seq', cc: 91, sysex: ['Arp', 'Rate'], kind: 'cont', gen: false },
  { id: 'arp_sync', label: 'Rate (sync)', section: 'Arp / Seq', cc: 92, sysex: ['Arp', 'Div'], kind: 'cont', gen: false },
  { id: 'spice', label: 'Spice', section: 'Arp / Seq', cc: 2, sysex: ['Arp', 'Spice'], kind: 'cont', gen: false },
  { id: 'glide', label: 'Glide', section: 'Keyboard', cc: 5, sysex: ['Kbd', 'Glide'], kind: 'cont', gen: true },
]

export type EdValues = Record<string, number>

/** 23 values (index 0..22, as in the dump): the middle of each slice of 0..127. */
export const OSC_COUNT = 23
export const typeToCc = (index: number) => Math.min(127, Math.floor(((index + 0.5) * 128) / OSC_COUNT))
export const ccToType = (cc: number) => Math.min(OSC_COUNT - 1, Math.floor((cc * OSC_COUNT) / 128))

export const oscOptions = () =>
  Object.entries(OSC_TYPES).map(([i, name]) => ({ index: Number(i), name }))

const clamp7 = (v: number) => Math.max(0, Math.min(127, Math.round(v)))

/** A neutral start: every control at the middle, Basic Waves. */
export function defaultValues(): EdValues {
  const v: EdValues = {}
  for (const p of ED_PARAMS) v[p.id] = p.kind === 'type' ? typeToCc(1) : 64
  return v
}

/** The panel's values from a dump; `fromDump` lists the ids read from it (the rest keep `base`). */
export function valuesFromPreset(p: MfPreset, base: EdValues = defaultValues()): { values: EdValues; fromDump: string[] } {
  const values = { ...base }
  const fromDump: string[] = []
  for (const ed of ED_PARAMS) {
    if (!ed.sysex) continue
    const q = findParam(p, ed.sysex[0], ed.sysex[1])
    if (!q) continue
    if (ed.kind === 'type') {
      if (q.index === null) continue
      values[ed.id] = typeToCc(q.index)
    } else {
      values[ed.id] = clamp7((Math.max(0, q.value) / 32767) * 127)
    }
    fromDump.push(ed.id)
  }
  return { values, fromDump }
}

/** What has no CC, from the dump: shown read-only ("on the synth"). */
export function synthOnlyInfo(p: MfPreset): { label: string; value: string }[] {
  const idx = (s: string, n: string) => findParam(p, s, n)?.index ?? null
  const pct = (s: string, n: string) => {
    const q = findParam(p, s, n)
    return q ? `${Math.round((q.value / 32767) * 100)}%` : '—'
  }
  const show = (i: number | null, f: (i: number) => string) => (i === null ? '—' : f(i))
  const filterTypes = ['LPF', 'BPF', 'HPF']
  return [
    { label: 'Filter type', value: show(idx('VCF', 'Type'), i => filterTypes[i] ?? `#${i}`) },
    { label: 'Cycling Env mode', value: show(idx('EG1', 'Mode'), i => `#${i}`) },
    { label: 'Octave', value: show(idx('Kbd', 'Octave'), i => `${i - 3 > 0 ? '+' : ''}${i - 3}`) },
    { label: 'Paraphonic', value: show(idx('Gen', 'Parafon'), i => (i ? 'On' : 'Off')) },
    { label: 'Preset volume', value: show(idx('Gen', 'PrstVol'), i => `${i} / 24`) },
    { label: 'Arp', value: show(idx('Arp', 'Enable'), i => (i ? 'On' : 'Off')) },
    { label: 'Seq', value: show(idx('Arp', 'SeqOn'), i => (i ? 'On' : 'Off')) },
    { label: 'Hold', value: show(idx('Kbd', 'Hold'), i => (i ? 'On' : 'Off')) },
    { label: 'LFO shape', value: show(idx('LFO', 'Shape'), i => `#${i}`) },
    { label: 'Env sustain', value: pct('EG2', 'Sustain') },
  ]
}

export const categoryOf = (c: number | null) => (c === null ? '—' : CATEGORIES[c] ?? `#${c}`)

/**
 * The preset (1..512) a device channel plays, from its recorded Program Change
 * state (registration pcChannels[ch]: PC byte + bank select MSB). Null if none.
 */
export function presetFromPcState(info: { program?: number; msb?: number } | null | undefined): number | null {
  if (!info || typeof info.program !== 'number') return null
  const n = (info.msb ?? 0) * 128 + info.program + 1
  return n >= 1 && n <= 512 ? n : null
}

// ── Generator ───────────────────────────────────────────────────────────────

export type Character = 'Bass' | 'Pad' | 'Lead' | 'Pluck' | 'Free'
export const CHARACTERS: Character[] = ['Bass', 'Pad', 'Lead', 'Pluck', 'Free']

type Range = [number, number]   // 0..1 of the CC range
interface Recipe { types: number[]; ranges: Record<string, Range> }

// oscillator indexes: see OSC_TYPES
const RECIPES: Record<Character, Recipe> = {
  Bass: {
    types: [1, 2, 6, 7, 8, 15, 16],
    ranges: { cutoff: [0.18, 0.55], reso: [0, 0.5], env_attack: [0, 0.05], env_decay: [0.2, 0.5], env_sustain: [0.3, 0.8],
      env_filter: [0.5, 0.85], cyc_amount: [0, 0.35], glide: [0, 0.15], lfo_rate: [0.1, 0.5] },
  },
  Pad: {
    types: [2, 3, 4, 10, 12, 20, 21, 9],
    ranges: { cutoff: [0.4, 0.85], reso: [0, 0.35], env_attack: [0.35, 0.8], env_decay: [0.5, 0.9], env_sustain: [0.6, 1],
      env_filter: [0.4, 0.7], cyc_rise: [0.3, 0.9], cyc_fall: [0.3, 0.9], cyc_amount: [0, 0.5], glide: [0, 0.2], lfo_rate: [0.05, 0.35] },
  },
  Lead: {
    types: [1, 2, 6, 7, 8, 16, 17],
    ranges: { cutoff: [0.5, 0.95], reso: [0.1, 0.6], env_attack: [0, 0.1], env_decay: [0.3, 0.7], env_sustain: [0.5, 1],
      env_filter: [0.45, 0.8], cyc_amount: [0, 0.4], glide: [0.05, 0.35], lfo_rate: [0.2, 0.6] },
  },
  Pluck: {
    types: [5, 12, 1, 8, 4],
    ranges: { cutoff: [0.3, 0.75], reso: [0, 0.45], env_attack: [0, 0.03], env_decay: [0.15, 0.45], env_sustain: [0, 0.15],
      env_filter: [0.55, 0.9], cyc_amount: [0, 0.3], glide: [0, 0.05], lfo_rate: [0.1, 0.5] },
  },
  Free: { types: Object.keys(OSC_TYPES).map(Number), ranges: {} },
}

export type Rng = () => number

/** A new sound of `character` (only the generator's params; the rest keep `base`). */
export function randomSound(character: Character, base: EdValues = defaultValues(), rng: Rng = Math.random): EdValues {
  const r = RECIPES[character]
  const v = { ...base }
  for (const p of ED_PARAMS) {
    if (!p.gen) continue
    if (p.kind === 'type') { v[p.id] = typeToCc(r.types[Math.floor(rng() * r.types.length)]); continue }
    const [lo, hi] = r.ranges[p.id] ?? [0, 1]
    v[p.id] = clamp7((lo + rng() * (hi - lo)) * 127)
  }
  return v
}

/** `values` moved by up to ±amount (0..1) of each range; the oscillator changes only above 0.6, now and then. */
export function mutate(values: EdValues, amount: number, rng: Rng = Math.random, locked: Set<string> = new Set()): EdValues {
  const v = { ...values }
  for (const p of ED_PARAMS) {
    if (!p.gen || locked.has(p.id)) continue
    if (p.kind === 'type') {
      if (amount > 0.6 && rng() < amount - 0.5) v[p.id] = typeToCc(1 + Math.floor(rng() * (OSC_COUNT - 1)))
      continue
    }
    v[p.id] = clamp7(v[p.id] + (rng() * 2 - 1) * amount * 127)
  }
  return v
}

/** The CC messages that turn `prev` into `next` (all of `next` when there is no prev): the oscillator first. */
export function ccMessages(next: EdValues, ch: number, prev?: EdValues): number[][] {
  const out: number[][] = []
  const ordered = [...ED_PARAMS].sort((a, b) => (a.kind === 'type' ? -1 : 0) - (b.kind === 'type' ? -1 : 0))
  for (const p of ordered) {
    const n = next[p.id]
    if (n === undefined || (prev && prev[p.id] === n)) continue
    out.push([0xb0 | (ch & 0x0f), p.cc, clamp7(n)])
  }
  return out
}
