import { describe, it, expect } from 'vitest'
import {
  presetAddress, nameRequest, idRequest, dataRequest, parseReply, unpack7, parsePresetStream, decodeRows, percent,
  modMatrix, oscTypeName, findParam, categoryName, CHUNKS_HEAD,
} from '@/lib/microfreak/sysex'
import preset001 from '../../fixtures/microfreak-preset-001.json'
import synthBank from '@/data/program_change/microfreak/synth_bank.json'
import catalog from '@/data/program_change/program_change.json'
import { catalogPcAddress } from '@/lib/pc-address'

describe('microfreak sysex', () => {
  it('addresses presets in four banks of 128', () => {
    expect(presetAddress(0)).toEqual([0, 0])
    expect(presetAddress(127)).toEqual([0, 127])
    expect(presetAddress(128)).toEqual([1, 0])
    expect(presetAddress(255)).toEqual([1, 127])
    expect(presetAddress(447)).toEqual([3, 63])
    expect(presetAddress(511)).toEqual([3, 127])
    expect(() => presetAddress(512)).toThrow()
  })

  it('builds the requests', () => {
    expect(nameRequest(130)).toEqual([0xf0, 0x00, 0x20, 0x6b, 0x07, 0x01, 0x00, 0x01, 0x19, 0x01, 0x02, 0x00, 0xf7])
    expect(idRequest(5)).toEqual([0xf0, 0x00, 0x20, 0x6b, 0x07, 0x01, 0x01, 0x01, 0x19, 0x00, 0x05, 0x01, 0xf7])
    expect(dataRequest(39)).toEqual([0xf0, 0x00, 0x20, 0x6b, 0x07, 0x01, 39, 0x01, 0x18, 0x00, 0xf7])
  })

  it('parses a name reply', () => {
    const msg = new Array(40).fill(0)
    msg.splice(0, 4, 0xf0, 0x00, 0x20, 0x6b)
    msg[8] = 0x52
    msg[19] = 3
    'Pad Dream'.split('').forEach((c, i) => { msg[21 + i] = c.charCodeAt(0) })
    msg[msg.length - 1] = 0xf7
    expect(parseReply(msg)).toMatchObject({ kind: 'name', name: 'Pad Dream', category: 3 })
  })

  it('parses a 42-byte data reply into a 32-byte row', () => {
    const msg = [0xf0, 0x00, 0x20, 0x6b, 0, 0, 0, 0, 0x16, ...Array.from({ length: 32 }, (_, i) => i), 0xf7]
    const r = parseReply(msg)
    expect(r?.kind).toBe('data')
    expect(r && r.kind === 'data' && r.row).toHaveLength(32)
    expect(parseReply([0xf0, 0x00, 0x20, 0x6b, 0, 0, 0, 0, 0x16, 1, 0xf7])?.kind).toBe('other')
    expect(parseReply([0xf0, 0x00, 0x20, 0x6c, 0, 0, 0, 0, 0x16, 1, 0xf7])).toBeNull()
  })

  it('unpacks 7-bit groups (first byte = high bits of the next 7)', () => {
    expect(unpack7([[0b0000101, 1, 2, 3, 4, 5, 6, 7]])).toEqual([0x81, 2, 0x83, 4, 5, 6, 7])
  })

  it('parses the section stream', () => {
    const item = (name: string, steps: number, v: number) =>
      [0x40 + name.length, ...name.split('').map(c => c.charCodeAt(0)), 0x63, steps, v & 0xff, (v >> 8) & 0xff]
    const b = [0x23, ...'VCF'.split('').map(c => c.charCodeAt(0)), ...item('Type', 2, 0x4000), ...item('Cutoff', 0, 0x7fff), 0x40,
      0x23, ...'Co1'.split('').map(c => c.charCodeAt(0)), ...item('Xpr', 0, 0xec60), 0x40, 0x20, 0xff]
    const p = parsePresetStream(b)
    expect(p.error).toBeNull()
    expect(p.sections.map(s => s.name)).toEqual(['VCF', 'Co1'])
    expect(p.sections[0].params).toEqual([
      { name: 'Type', steps: 2, value: 0x4000, index: 1 },
      { name: 'Cutoff', steps: 0, value: 0x7fff, index: null },
    ])
    expect(p.sections[1].params[0].value).toBe(-5024)
    expect(p.rest).toEqual([0x20, 0xff])
    expect(percent(0x7fff)).toBe(100)
    expect(parsePresetStream([0x23, 0x41, 0x42, 0x43, 0x05]).error).toMatch(/bad name length/)
  })

  it('decodes a real dump (preset 1, "Revert to Iron")', () => {
    const p = decodeRows(preset001.rows)
    expect(p.error).toBeNull()
    expect(p.sections.map(s => s.name)).toEqual([
      'VCO', 'VCF', 'EG1', 'Kbd', 'Arp', 'LFO', 'EG2', 'Gen', 'Sys', 'Mat',
      'Co1', 'Co2', 'Co3', 'Co4', 'Co5', 'Co6', 'Co7', 'SyA', 'Seq', 'Voc',
    ])
    const get = (s: string, n: string) => p.sections.find(x => x.name === s)!.params.find(x => x.name === n)!
    expect(get('VCO', 'Type')).toMatchObject({ steps: 22, index: 19 })
    expect(get('VCF', 'Cutoff').value).toBe(32767)
    expect(get('Kbd', 'Octave').index).toBe(3)
    expect(get('Co6', 'Xpr').value).toBe(-5024)
    expect(p.end).toBe(1187)
  })

  it('labels the mod matrix and the oscillator (preset 1: Press → Assign 1–3, Key/Arp → Assign 1, Sample)', () => {
    const p = decodeRows(preset001.rows)
    const active = modMatrix(p).flatMap(r => r.cells.filter(c => c.amount !== 0).map(c => `${c.col}→${r.row}`))
    expect(active).toEqual(['Press→Assign 1', 'Key/Arp→Assign 1', 'Press→Assign 2', 'Press→Assign 3'])
    expect(modMatrix(p)[5].cells[3].amount).toBeLessThan(0)
    expect(oscTypeName(findParam(p, 'VCO', 'Type')!.index)).toBe('Sample')
    expect(oscTypeName(4)).toBe('Harmo')
    expect(oscTypeName(0)).toBe('#0')
    expect(categoryName(9)).toBe('Strings')
    expect(categoryName(12)).toBe('#12')
  })

  it('finds the oscillator in the first chunks only (bank scan)', () => {
    const head = decodeRows(preset001.rows.slice(0, CHUNKS_HEAD))
    expect(findParam(head, 'VCO', 'Type')?.index).toBe(19)
  })

  it('the synth bank list (from a scan) numbers presets as on the synth and addresses each once', () => {
    const cfg = (catalog as any)['Arturia MicroFreak']['New Presets 4']
    expect(cfg.data).toBe('./microfreak/synth_bank.json')
    expect(cfg.program_base).toBe(-1)
    synthBank.forEach((s, i) => expect(s.program).toBe(i + 1))
    const sent = synthBank.map(s => catalogPcAddress(s, cfg))
    expect(new Set(sent.map(a => `${a.msb}:${a.progNum}`)).size).toBe(synthBank.length)
    expect(sent[127]).toMatchObject({ msb: 0, progNum: 127 })
    expect(sent[128]).toMatchObject({ msb: 1, progNum: 0 })
    expect(synthBank[0]).toMatchObject({ no: 1, name: 'Revert to Iron', category: 'Strings', osc: 'Sample' })
  })
})
