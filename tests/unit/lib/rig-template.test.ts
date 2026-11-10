import { describe, it, expect } from 'vitest'
import {
  exportRigTemplate, parseRigTemplate, applyRigTemplate, clearRigMappings, rigMappedDevices,
  templateMatches, sysexBytes, templateFileName, mappingKey, type StoredMappings,
} from '@/lib/rig-template'

const LK = 'Launchkey MK3 49'
const mappings: StoredMappings = {
  [`${LK}:CH10:NOTE40`]: { note: 40, device: LK, channel: 9, paramName: 'rig_slot_drum_a' },
  [`${LK}:CH1:CC21`]: { cc: 21, device: LK, channel: 0, paramName: 'rig_density_drum' },
  [`${LK}:CH1:CC22`]: { cc: 22, device: LK, channel: 0, paramName: 'cutoff' },          // not a rig control
  ['Worlde:CH1:CC1']: { cc: 1, device: 'Worlde', channel: 0, paramName: 'rig_global' },
  ['legacy']: 'cutoff',
}

describe('rig-template', () => {
  it('exports a controller\'s rig controls (channel 1–16), and lists the mapped controllers', () => {
    const t = exportRigTemplate(mappings, LK, 'My Launchkey')
    expect(t).toMatchObject({ format: 'sycore-rig-template', version: 1, name: 'My Launchkey', match: LK })
    expect(t.controls).toEqual({ rig_slot_drum_a: { note: 40, channel: 10 }, rig_density_drum: { cc: 21, channel: 1 } })
    expect(rigMappedDevices(mappings)).toEqual([{ device: LK, count: 2 }, { device: 'Worlde', count: 1 }])
  })

  it('round-trips: export → JSON → parse → apply on another port', () => {
    const text = JSON.stringify(exportRigTemplate(mappings, LK))
    const res = parseRigTemplate(text)
    if ('error' in res) throw new Error(res.error)
    const next = applyRigTemplate({}, res.template, 'Other port')
    expect(next[mappingKey('Other port', 9, 'note', 40)]).toEqual({ note: 40, device: 'Other port', channel: 9, paramName: 'rig_slot_drum_a' })
    expect(Object.keys(next)).toHaveLength(2)
  })

  it('applying replaces only that controller\'s rig controls', () => {
    const res = parseRigTemplate(JSON.stringify({ format: 'sycore-rig-template', version: 1, name: 'T', controls: { rig_fill: { note: 50, channel: 1 } } }))
    if ('error' in res) throw new Error(res.error)
    const next = applyRigTemplate(mappings, res.template, LK)
    expect(Object.values(next).filter(m => typeof m === 'object' && m.device === LK).map(m => (m as any).paramName).sort())
      .toEqual(['cutoff', 'rig_fill'])
    expect(next['Worlde:CH1:CC1']).toBeDefined()
    expect(next.legacy).toBe('cutoff')
    expect(Object.keys(clearRigMappings(mappings, LK))).toEqual([`${LK}:CH1:CC22`, 'Worlde:CH1:CC1', 'legacy'])
  })

  it('validates: format, version, controls, channels, palette, init', () => {
    expect(parseRigTemplate('nope')).toEqual({ error: 'Not a JSON file' })
    expect('error' in parseRigTemplate('{"format":"x"}')).toBe(true)
    expect('error' in parseRigTemplate('{"format":"sycore-rig-template","version":2,"controls":{}}')).toBe(true)
    const res = parseRigTemplate(JSON.stringify({
      format: 'sycore-rig-template', version: 1, name: ' APC ', match: 'APC mini mk2',
      init: ['F0 47 7F 4F F7', 'zz'],
      controls: {
        rig_slot_chord_a: { note: 56, channel: 1 },
        rig_unknown: { note: 1, channel: 1 },
        rig_gen_chord: { note: 200, channel: 1 },
        rig_global: { cc: 56, channel: 17 },
      },
      leds: { palette: { playing: 21, filled: 300 } },
    }))
    if ('error' in res) throw new Error(res.error)
    expect(res.template.name).toBe('APC')
    expect(res.template.controls).toEqual({ rig_slot_chord_a: { note: 56, channel: 1 } })
    expect(res.template.init).toEqual(['F0 47 7F 4F F7'])
    expect(res.template.leds).toEqual({ palette: { playing: 21 } })
    expect(res.warnings).toHaveLength(5)
  })

  it('matches ports, reads SysEx, names files', () => {
    expect(templateMatches({ match: 'apc mini' }, 'APC mini mk2 Control')).toBe(true)
    expect(templateMatches({}, 'APC mini mk2')).toBe(false)
    expect(sysexBytes('F0 00 20 29 02 0F 0C 01 F7')).toEqual([0xF0, 0, 0x20, 0x29, 2, 0x0F, 0x0C, 1, 0xF7])
    expect(sysexBytes('90 40 7F')).toBeNull()
    expect(sysexBytes('F0 80 F7')).toBeNull()
    expect(templateFileName({ name: 'Novation Launchkey 49!' })).toBe('Novation-Launchkey-49.sycore-rig.json')
  })
})
