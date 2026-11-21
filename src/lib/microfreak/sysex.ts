// Arturia MicroFreak — preset read over SysEx (probe).
//
// The protocol is not documented by Arturia. What follows is the community's
// reverse-engineered picture (from MIDI Control Center traffic), re-implemented
// here: a name request, an ID request, then N data requests (chunk 0..N-1),
// each answered by one message. Everything is unverified on our side — the
// probe exists to check it on a real unit.

export const ARTURIA_ID = [0x00, 0x20, 0x6b] as const
export const MF_DEVICE = 0x07

/** A full preset: 146 data chunks (the parameter sections need ~43, the rest is the sequence). */
export const CHUNKS_FULL = 146
/** The parameter sections with margin (they end at byte ~1187 = chunk 43): what the editor reads. */
export const CHUNKS_PARAMS = 48

export const REPLY_NAME = 0x52
export const REPLY_DATA = [0x16, 0x17] as const

/** Preset slots: 4 banks of 128 (FW 5: 448 factory presets, then Init). */
export const PRESET_SLOTS = 512

/** 0-based preset index (0..511) → [bank, program]. */
export function presetAddress(index: number): [number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= PRESET_SLOTS) throw new Error(`preset index out of range: ${index}`)
  return [Math.floor(index / 128), index % 128]
}

const frame = (body: number[]) => [0xf0, ...ARTURIA_ID, ...body, 0xf7]

export function nameRequest(index: number): number[] {
  const [bank, prog] = presetAddress(index)
  return frame([MF_DEVICE, 0x01, 0x00, 0x01, 0x19, bank, prog, 0x00])
}

export function idRequest(index: number): number[] {
  const [bank, prog] = presetAddress(index)
  return frame([MF_DEVICE, 0x01, 0x01, 0x01, 0x19, bank, prog, 0x01])
}

/** Data chunk request — no preset in it: it reads the one the name/ID requests selected. */
export function dataRequest(chunk: number): number[] {
  return frame([MF_DEVICE, 0x01, chunk & 0x7f, 0x01, 0x18, 0x00])
}

export function isArturiaSysEx(d: ArrayLike<number>): boolean {
  return d.length >= 10 && d[0] === 0xf0 && d[1] === 0x00 && d[2] === 0x20 && d[3] === 0x6b
}

export type Reply =
  | { kind: 'name'; name: string; category: number; raw: number[] }
  | { kind: 'data'; row: number[]; raw: number[] }
  | { kind: 'other'; type: number; raw: number[] }

export function parseReply(d: ArrayLike<number>): Reply | null {
  if (!isArturiaSysEx(d)) return null
  const raw = Array.from(d)
  const type = raw[8]
  if (type === REPLY_NAME) {
    let name = ''
    for (let i = 21; i < raw.length - 1 && raw[i] !== 0; i++) name += String.fromCharCode(raw[i])
    return { kind: 'name', name: name.trim(), category: raw[19] ?? -1, raw }
  }
  if ((REPLY_DATA as readonly number[]).includes(type) && raw.length === 42) {
    return { kind: 'data', row: raw.slice(9, -1), raw }
  }
  return { kind: 'other', type, raw }
}

// ── Preset data ─────────────────────────────────────────────────────────────
//
// Verified on a real unit (2026-11-21, preset 1 "Revert to Iron", 146 chunks):
// the 32-byte rows are 7-bit packed — groups of 8 bytes, the first holding the
// high bits of the next 7 (bit k → byte k). Unpacked, the preset is a
// self-describing stream:
//
//   section := '#' <3-char name> item* 0x40
//   item    := (0x40 + L) <L-char name> 'c' <steps> <int16 LE>
//
// <steps> is the number of values minus 1 for a discrete parameter (0 =
// continuous; ≥ 0x80: a continuous kind not understood yet). The value is
// normalized: a discrete index is round(value / 32767 * steps). After the last
// section comes the sequencer's step data (not decoded yet).

export type Rows = number[][]

export function unpack7(rows: Rows): number[] {
  const out: number[] = []
  for (const r of rows) {
    for (let g = 0; g < r.length; g += 8) {
      const hi = r[g]
      for (let k = 0; k < 7 && g + 1 + k < r.length; k++) out.push(r[g + 1 + k] | ((hi >> k) & 1 ? 0x80 : 0))
    }
  }
  return out
}

export interface MfParam {
  name: string
  steps: number          // values − 1 if discrete; 0 continuous; ≥ 0x80 unknown kind
  value: number          // int16 (signed)
  /** Discrete index, when steps is 1..0x7f. */
  index: number | null
}
export interface MfSection { name: string; params: MfParam[] }
export interface MfPreset {
  sections: MfSection[]
  /** Offset where the section stream ended (the sequencer data starts there). */
  end: number
  /** Unpacked bytes after the sections. */
  rest: number[]
  /** Set if the stream broke the grammar before its natural end. */
  error: string | null
}

const ascii = (b: number[]) => String.fromCharCode(...b)

export function parsePresetStream(b: number[]): MfPreset {
  const sections: MfSection[] = []
  let i = 0
  let error: string | null = null
  outer: while (i < b.length && b[i] === 0x23) {
    const sec: MfSection = { name: ascii(b.slice(i + 1, i + 4)), params: [] }
    i += 4
    for (;;) {
      const c = b[i]
      if (c === undefined) { error = `truncated in section ${sec.name}`; sections.push(sec); break outer }
      if (c === 0x40) { i++; break }
      const len = c - 0x40
      if (len < 1 || len > 15) { error = `bad name length 0x${c.toString(16)} at ${i} in ${sec.name}`; sections.push(sec); break outer }
      const name = ascii(b.slice(i + 1, i + 1 + len))
      i += 1 + len
      if (b[i] !== 0x63 || i + 3 >= b.length) { error = `bad value tag at ${i} (${sec.name}.${name})`; sections.push(sec); break outer }
      const steps = b[i + 1]
      const u = b[i + 2] | (b[i + 3] << 8)
      const value = u > 0x7fff ? u - 0x10000 : u
      i += 4
      const index = steps > 0 && steps < 0x80 ? Math.round((value / 32767) * steps) : null
      sec.params.push({ name, steps, value, index })
    }
    sections.push(sec)
  }
  return { sections, end: i, rest: b.slice(i), error }
}

/** Continuous value as a percent of 0..32767 (negative for bipolar amounts). */
export const percent = (v: number) => Math.round((v * 1000) / 32767) / 10

export function decodeRows(rows: Rows): MfPreset {
  return parsePresetStream(unpack7(rows))
}

// ── Labels (checked on the unit unless marked) ──────────────────────────────

/** Mod matrix: sections Co1..Co7 are the destinations (rows), their params the sources (columns). */
export const MATRIX_ROWS: Record<string, string> = {
  Co1: 'Pitch', Co2: 'Wave', Co3: 'Timbre', Co4: 'Cutoff',   // inferred from the panel order
  Co5: 'Assign 1', Co6: 'Assign 2', Co7: 'Assign 3',          // checked (preset 1)
}
export const MATRIX_COLS: Record<string, string> = {
  EG1: 'Cyc Env', EG2: 'Env', LFO: 'LFO', Xpr: 'Press', Key: 'Key/Arp',
}

/** Oscillator type index (VCO.Type) → name, checked on the unit (2026-11-21). 0: no factory preset uses it. */
export const OSC_TYPES: Record<number, string> = {
  1: 'Basic Waves', 2: 'SuperWave', 3: 'Wavetable', 4: 'Harmo', 5: 'KarplusStr', 6: 'V. Analog',
  7: 'Waveshaper', 8: 'Two Op. FM', 9: 'Formant', 10: 'Chords', 11: 'Speech', 12: 'Modal',
  13: 'Noise', 14: 'Vocoder', 15: 'Bass', 16: 'SawX', 17: 'Harm', 18: 'WaveUser',
  19: 'Sample', 20: 'Scan Grains', 21: 'Cloud Grains', 22: 'Hit Grains',
}

/** Category byte → name: alphabetical, the same names as SY.CORE's MicroFreak bank (checked on all 256 presets). */
export const CATEGORIES = [
  'Bass', 'Brass', 'Keys', 'Lead', 'Organ', 'Pad', 'Percussion', 'Sequence', 'SFX', 'Strings', 'Template', 'Vocoder',
] as const

export const categoryName = (c: number | null) => (c === null ? '—' : CATEGORIES[c] ?? `#${c}`)

export const oscTypeName = (i: number | null) => (i === null ? '—' : OSC_TYPES[i] ?? `#${i}`)

export function findParam(p: MfPreset, section: string, name: string): MfParam | undefined {
  return p.sections.find(s => s.name === section)?.params.find(x => x.name === name)
}

/** The 7×5 mod matrix as percent amounts (−100..100). */
export function modMatrix(p: MfPreset): { row: string; cells: { col: string; amount: number }[] }[] {
  return Object.entries(MATRIX_ROWS).map(([sec, row]) => ({
    row,
    cells: Object.entries(MATRIX_COLS).map(([key, col]) => ({ col, amount: percent(findParam(p, sec, key)?.value ?? 0) })),
  }))
}

/** Data chunks that hold the #VCO section — enough for a bank scan of names + oscillator. */
export const CHUNKS_HEAD = 2

// ── Bank list ───────────────────────────────────────────────────────────────

/** One slot of a bank scan: name, category byte, oscillator index. */
export interface ScanRow { preset: number; name: string | null; category: number | null; osc: number | null }

/** A program-change catalog entry (the program_change/*.json shape). */
export interface BankEntry {
  category: string; no: number; name: string; osc: string | null
  msb: number; lsb: number; bank: number; program: number
}

/**
 * The bank list from a scan: numbered as on the synth (`program` 1..512, to use
 * with program_base −1), the trailing empty "Init" slots left out.
 */
export function bankFromScan(scan: ScanRow[]): BankEntry[] {
  let last = scan.length
  while (last > 0 && /^init$/i.test((scan[last - 1].name ?? '').trim())) last--
  return scan.slice(0, last).map((r, i) => {
    if (r.preset !== i + 1) throw new Error(`preset ${i + 1} out of order (${r.preset})`)
    const bank = Math.floor(i / 128)
    return {
      category: categoryName(r.category),
      no: r.preset,
      name: r.name ?? `Preset ${r.preset}`,
      osc: r.osc === null ? null : oscTypeName(r.osc),
      msb: bank,
      lsb: 0,
      bank,
      program: i + 1,
    }
  })
}

export interface MicroFreakDump {
  preset: number          // 1..512, as on the synth
  name: string | null
  category: number | null
  rows: Rows
  /** Every Arturia reply, in arrival order, hex — the evidence. */
  replies: string[]
  readAt: string
}

export const hex = (a: ArrayLike<number>) => Array.from(a, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
