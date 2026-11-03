// SY.CORE FMOS (our FM-1 firmware, ../sycore-fmos): catalog entry, model on the FM-1 output,
// CC table and Program Change catalog — they must agree with the firmware's protocol.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  FM1_FIRMWARES, FM1_DEFAULT_FIRMWARE, FM1_SYCORE_FIRMWARE, fm1Parts, fm1PcTemplate, fm1NextPcTemplate, fm1PartChannels,
} from '@/lib/fm1-firmwares'
import { ccTemplateFor } from '@/constants/cc-templates'
import { PC_TEMPLATES } from '@/constants/pc-templates'
import catalogIndex from '@/data/program_change/program_change.json'

const root = resolve(__dirname, '../../..')
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf-8'))

// sycore-fmos/docs/protocol.md (firmware: felucca/firmware/src/midi_control.c MIDI_CC_MAP)
const FMOS_CCS = [
  5, 7, 10, 71, 72, 73, 74, 75, 91, 93, 94, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  76, 77, 78, 79, 92, 85, 86, 87, 89, 90, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
  112, 113, 114, 115, 116, 117, 118, 119,
]
// felucca/firmware/src/engines.c ENGINES[] (1 retired, 14 ADPCM not built)
const ENGINES = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

describe('SY.CORE FMOS firmware entry', () => {
  it('is listed first and is the default, four parts on channels 1–4', () => {
    expect(FM1_FIRMWARES[0]).toEqual({ id: 'sycore', name: 'SY.CORE FMOS' })
    expect(FM1_DEFAULT_FIRMWARE).toBe(FM1_SYCORE_FIRMWARE)
    expect(fm1Parts('sycore')).toEqual([0, 1, 2, 3])
  })

  it('the emulator catalog serves its package from our origin, and it exists', () => {
    const cat = json('public/fm1/firmwares.json')
    const e = cat.firmwares.find((f: any) => f.id === 'sycore')
    expect(cat.default).toBe('sycore')
    expect(e).toMatchObject({ name: 'SY.CORE FMOS', license: 'GPL-3.0', sycore: true })
    expect(e.package).toMatch(/^fw\/sycore-fmos-[\d.]+\.fwsc$/)
    expect(existsSync(resolve(root, 'public/fm1', e.package))).toBe(true)
  })
})

describe('FM-1 output model (PC template) from the firmware', () => {
  it('FMOS sets sycore-fmos; other firmwares none', () => {
    expect(fm1PcTemplate('sycore')).toBe('sycore-fmos')
    expect(fm1PcTemplate('felucca')).toBeNull()
  })
  it('sets it when unset, keeps a model the user picked', () => {
    expect(fm1NextPcTemplate(undefined, 'sycore')).toEqual({ change: true, value: 'sycore-fmos' })
    expect(fm1NextPcTemplate('sycore-fmos', 'sycore')).toEqual({ change: false, value: 'sycore-fmos' })
    expect(fm1NextPcTemplate('json', 'sycore')).toEqual({ change: false })
  })
  it('leaving FMOS takes back only its own model', () => {
    expect(fm1NextPcTemplate('sycore-fmos', 'felucca')).toEqual({ change: true, value: undefined })
    expect(fm1NextPcTemplate('json', 'felucca')).toEqual({ change: false })
    expect(fm1NextPcTemplate(undefined, 'felucca')).toEqual({ change: false })
  })
  it('the model is offered in MIDI Devices', () => {
    expect(PC_TEMPLATES.some(t => t.id === 'sycore-fmos')).toBe(true)
  })
})

describe('FM-1 parts in MULTI SOUND', () => {
  it('lists all four FMOS parts though the cable carries only CH 1', () => {
    expect(fm1PartChannels('sycore', [0])).toEqual([0, 1, 2, 3])
    expect(fm1PartChannels('sycore', [])).toEqual([0, 1, 2, 3])
  })
  it('adds a cable channel outside the parts', () => {
    expect(fm1PartChannels('sycore', [5, 1])).toEqual([0, 1, 2, 3, 5])
    expect(fm1PartChannels('unknown-fw', [])).toEqual([0])
  })
})

describe('SY.CORE FMOS CC table', () => {
  const t = ccTemplateFor('sycore-fmos')!
  it('is exactly the firmware map: 57 CCs, each once, named', () => {
    expect(t.map(r => r.cc).sort((a, b) => a - b)).toEqual([...FMOS_CCS].sort((a, b) => a - b))
    expect(t.every(r => r.name.length > 0)).toBe(true)
  })
  it('none of the reserved CCs (bank select, mod wheel, data entry, expression, sustain, RPN, channel mode)', () => {
    const reserved = [0, 1, 6, 11, 32, 38, 64, 96, 97, 98, 99, 100, 101, 120, 121, 122, 123, 124, 125, 126, 127]
    expect(t.some(r => reserved.includes(r.cc))).toBe(false)
  })
})

describe('SY.CORE FMOS Program Change catalog', () => {
  const presets = json('public/data/program_change/fmos/presets.json') as any[]
  it('the template maps to its catalog, Bank Select MSB = engine', () => {
    const bank = (catalogIndex as any)['SY.CORE FMOS'].Factory
    expect(bank).toMatchObject({ data: './fmos/presets.json', msb: true, lsb: true, program_base: 0 })
  })
  it('every engine, its presets numbered from PC 0 without gaps', () => {
    expect([...new Set(presets.map(p => p.msb))].sort((a, b) => a - b)).toEqual(ENGINES)
    for (const e of ENGINES) {
      const pcs = presets.filter(p => p.msb === e).map(p => p.program)
      expect(pcs).toEqual(pcs.map((_, i) => i))
    }
    expect(presets.every(p => p.lsb === 0 && p.name && p.category)).toBe(true)
  })
})
