import { describe, it, expect } from 'vitest'
import { presetsToS1Sounds, s1BankFile, parseS1BankFile, s1PresetToRecall, S1_BANK_FORMAT, s1PresetCcMessages } from '@/lib/s1-bank'
import { FIELD_TO_CC } from '@/constants/s1-config'
import { presetMessages } from '@/lib/virtual-device'

const preset = (name: string, category = 'bass') => ({
  id: name.toLowerCase(), name, category, device: 'S-1', patchNotes: '',
  aVariant: { data: { cutoff: 64 } }, bVariant: { data: { cutoff: 64 } },
}) as any

describe('Roland S-1 banks', () => {
  it('a bank from presets: name, category, program 1..N, a copy of each preset', () => {
    const src = [preset('Wobble'), preset('Pad One', 'pad')]
    const sounds = presetsToS1Sounds(src)
    expect(sounds.map(s => [s.name, s.category, s.program])).toEqual([['Wobble', 'bass', 1], ['Pad One', 'pad', 2]])
    expect(sounds[0].preset).toEqual(src[0])
    expect(sounds[0].preset).not.toBe(src[0])
  })

  it('export → import gives back the same bank', () => {
    const sounds = presetsToS1Sounds([preset('A'), preset('B')])
    const file = JSON.parse(JSON.stringify(s1BankFile('My Bank', sounds)))
    expect(file.format).toBe(S1_BANK_FORMAT)
    expect(parseS1BankFile(file)).toEqual({ name: 'My Bank', sounds })
  })

  it('imports a bare array of presets (file name as bank name), legacy data too; rejects anything else', () => {
    const legacy = { name: 'Old', category: 'lead', data: { cutoff: 1 } }
    const r = parseS1BankFile([preset('A'), legacy, { name: 'no data' }], 'file')
    expect(r.name).toBe('file')
    expect(r.sounds.map(s => s.name)).toEqual(['A', 'Old'])
    expect(() => parseS1BankFile({ presets: [{ pc: 1, name: 'x' }] })).toThrow()
    expect(() => parseS1BankFile('nope')).toThrow()
  })

  it('recalls a copy of the preset; an S-1 sound has no Program Change to re-send', () => {
    const [s] = presetsToS1Sounds([preset('A')])
    const p = s1PresetToRecall(s)
    expect(p).toEqual(s.preset)
    expect(p).not.toBe(s.preset)
    expect(s1PresetToRecall(null)).toBeNull()
    expect(presetMessages({ program: 0, bank: 'Sound Library', soundName: 'A', category: '', msb: 0, lsb: 0, engine: 'roland-s1' }, 2)).toEqual([])
  })

  it('turns a preset into the S-1 engine CCs on the channel, LFO Sync first', () => {
    const preset: any = { name: 'X', aVariant: { data: { lfoRate: 40, lfoSync: 1, transpose: 200.4, notAParam: 5, bad: 'x' } } }
    const msgs = s1PresetCcMessages(preset, 2)
    expect(msgs[0]).toEqual([0xb2, FIELD_TO_CC.lfoSync, 1])
    expect(msgs).toContainEqual([0xb2, FIELD_TO_CC.lfoRate, 40])
    expect(msgs).toContainEqual([0xb2, FIELD_TO_CC.transpose, 127])
    expect(msgs).toHaveLength(3)
  })
  it('reads an old preset\'s data, nothing without one', () => {
    expect(s1PresetCcMessages({ name: 'Y', data: { transpose: 64 } } as any, 0)).toEqual([[0xb0, FIELD_TO_CC.transpose, 64]])
    expect(s1PresetCcMessages(null, 0)).toEqual([])
  })
})
