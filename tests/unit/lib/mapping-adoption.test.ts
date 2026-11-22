import { describe, it, expect } from 'vitest'
import { adoptMappings, needsAdoption } from '@/lib/mapping-adoption'
import { syncPresetMappings } from '@/lib/designer-preset-mappings'

let n = 0
const base = (over: any = {}) => ({
  presets: [], enabledIds: [], learn: {}, app: [],
  labelParam: (p: string) => `P(${p})`, labelAction: (a: string) => `A(${a})`,
  newId: () => `id${++n}`, now: 1, ...over,
})

describe('mapping adoption', () => {
  it('a learned mapping on a controller with no preset: a "Learned" preset, on, with that control', () => {
    const r = adoptMappings(base({ learn: { 'Keys:CH1:CC74': { cc: 74, device: 'Keys', channel: 0, paramName: 'cutoff' } } }))
    expect(r.adopted).toBe(1)
    expect(r.learn).toEqual({})
    expect(r.presets).toHaveLength(1)
    const p = r.presets[0]
    expect(p.name).toBe('Keys · Learned')
    expect(p.assignedDevice).toBe('Keys')
    expect(r.enabledIds).toEqual([p.id])
    expect(r.createdPresetIds).toEqual([p.id])
    expect(p.controls[0]).toMatchObject({ ccNumber: 74, channel: 1, type: 'encoder', assignment: { type: 'app-param', paramName: 'cutoff', label: '→ P(cutoff)' } })
  })

  it('into the preset on that already has the button (learning again replaces); else its first preset on', () => {
    const presets = [
      { id: 'mix', name: 'Mixer', assignedDevice: 'MIDI Mix', controls: [{ id: 'm1', label: 'Mute 1', noteNumber: 1, channel: 1, assignment: { type: 'midi-action', action: 'mixer_ch1_mute' } }] },
      { id: 'off', name: 'Off', assignedDevice: 'MIDI Mix', controls: [] },
    ]
    const r = adoptMappings(base({
      presets, enabledIds: ['mix'],
      learn: { 'MIDI Mix:CH1:NOTE1': { note: 1, device: 'MIDI Mix', channel: 0, paramName: 'dm_play_stop' } },
      app: [{ id: 'u1', device: 'midi mix', note: 4, channel: 0, action: 'mixer_ch2_mute', feedbackOn: 127, feedbackOff: 0 }],
    }))
    const mix = r.presets.find(p => p.id === 'mix')!
    expect(mix.controls[0].assignment).toMatchObject({ type: 'app-param', paramName: 'dm_play_stop' })
    expect(mix.controls[0].appMapping).toBeUndefined()
    expect(mix.controls[1]).toMatchObject({ noteNumber: 4, assignment: { type: 'midi-action', action: 'mixer_ch2_mute' } })
    expect(mix.controls[1].appMapping).toMatchObject({ id: `designer_ctrl_${mix.controls[1].id}`, feedbackOn: 127, action: 'mixer_ch2_mute' })
    expect(r.createdPresetIds).toEqual([])
    expect(r.app).toEqual([])
    expect(presets[0].controls[0].assignment).toMatchObject({ action: 'mixer_ch1_mute' }) // input untouched
  })

  it('kept: the presets\' own entries and NRPN; dropped: no device, legacy key → name, malformed', () => {
    const learn = {
      'MIDI Mix:CH1:NOTE1': { note: 1, device: 'MIDI Mix', channel: 0, paramName: 'x', designerPreset: 'mix' },
      'NRPN:1:2': { nrpn: { msb: 1, lsb: 2 }, device: 'Keys', channel: 0, paramName: 'y' },
      'CH1:CC20': { cc: 20, device: null, channel: 0, paramName: 'z' },
      '21': 'arp_rate',
    }
    const app = [{ id: 'designer_ctrl_m1', device: 'MIDI Mix', note: 1, action: 'a' }, { id: 'bad', device: '', cc: 3, action: 'b' }]
    const r = adoptMappings(base({ learn, app }))
    expect(Object.keys(r.learn)).toEqual(['MIDI Mix:CH1:NOTE1', 'NRPN:1:2'])
    expect(r.app.map(m => m.id)).toEqual(['designer_ctrl_m1'])
    expect(r.dropped.sort()).toEqual(['21', 'CH1:CC20', 'bad'])
    expect(r.adopted).toBe(0)
    expect(needsAdoption(r.learn, r.app)).toBe(false)
    expect(needsAdoption(learn, [])).toBe(true)
  })

  it('then the preset sync writes them back as the preset\'s own (one source)', () => {
    const r = adoptMappings(base({
      learn: { 'Keys:CH1:CC74': { cc: 74, device: 'Keys', channel: 0, paramName: 'cutoff' } },
      app: [{ id: 'u1', device: 'Keys', note: 36, channel: 9, action: 'seq_play', value: -1 }],
    }))
    const s = syncPresetMappings({ presets: r.presets, enabledIds: r.enabledIds, app: r.app, learn: r.learn })
    expect(s.learn['Keys:CH1:CC74']).toMatchObject({ paramName: 'cutoff', designerPreset: r.presets[0].id })
    expect(s.app).toHaveLength(1)
    expect(s.app[0]).toMatchObject({ device: 'Keys', note: 36, channel: 9, action: 'seq_play' })
    expect(s.app[0].id.startsWith('designer_ctrl_')).toBe(true)
    expect(needsAdoption(s.learn, s.app)).toBe(false)
  })
})
