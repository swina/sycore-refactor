import { describe, it, expect } from 'vitest'
import { syncPresetMappings, learnKeyFor } from '@/lib/designer-preset-mappings'

const mute1 = { id: 'm1', noteNumber: 1, channel: 1, assignment: { type: 'midi-action' as const, action: 'mixer_ch1_mute' },
  appMapping: { id: 'designer_ctrl_m1', device: 'MIDI Mix', note: 1, channel: 0, value: -1, action: 'mixer_ch1_mute', feedbackOn: 127, feedbackOff: 0 } }
const fader1 = { id: 'f1', ccNumber: 19, channel: 1, assignment: { type: 'app-param' as const, paramName: 'mix_ch1_vol' } }
const mixer = { id: 'A', assignedDevice: 'MIDI Mix', controls: [mute1, fader1] }
const slots = { id: 'B', assignedDevice: 'MIDI Mix', controls: [
  { id: 's1', noteNumber: 1, channel: 1, assignment: { type: 'app-param' as const, paramName: 'cp_slot_0' } },
] }
const own = { id: 'user1', device: 'Launchkey', note: 40, channel: 0, action: 'toggle_arp' }
const ownLearn = { 'Launchkey:CH1:CC21': { cc: 21, device: 'Launchkey', channel: 0, paramName: 'cutoff' } }

describe('designer-preset-mappings', () => {
  it('a preset on: its actions and params are in the tables', () => {
    const r = syncPresetMappings({ presets: [mixer], enabledIds: ['A'], app: [own], learn: ownLearn })
    expect(r.app.map(m => m.id)).toEqual(['user1', 'designer_ctrl_m1'])
    expect(r.learn['MIDI Mix:CH1:CC19']).toEqual({ cc: 19, device: 'MIDI Mix', channel: 0, paramName: 'mix_ch1_vol', designerPreset: 'A' })
    expect(r.learn['Launchkey:CH1:CC21']).toEqual(ownLearn['Launchkey:CH1:CC21'])
  })

  it('a preset off: its mappings go, the user\'s own stay', () => {
    const on = syncPresetMappings({ presets: [mixer], enabledIds: ['A'], app: [own], learn: ownLearn })
    const off = syncPresetMappings({ presets: [mixer], enabledIds: [], app: on.app, learn: on.learn })
    expect(off.app).toEqual([own])
    expect(off.learn).toEqual(ownLearn)
    expect(off.appChanged && off.learnChanged).toBe(true)
  })

  it('switching setups on the same button', () => {
    const a = syncPresetMappings({ presets: [mixer, slots], enabledIds: ['A'], app: [], learn: {} })
    const b = syncPresetMappings({ presets: [mixer, slots], enabledIds: ['B'], app: a.app, learn: a.learn })
    expect(b.app).toEqual([])
    expect(b.learn).toEqual({ 'MIDI Mix:CH1:NOTE1': { note: 1, device: 'MIDI Mix', channel: 0, paramName: 'cp_slot_0', designerPreset: 'B' } })
  })

  it('in sync: nothing changes', () => {
    const a = syncPresetMappings({ presets: [mixer], enabledIds: ['A'], app: [own], learn: ownLearn })
    const again = syncPresetMappings({ presets: [mixer], enabledIds: ['A'], app: a.app, learn: a.learn })
    expect(again.appChanged || again.learnChanged || again.backfilled).toBe(false)
  })

  it('older presets: the action mapping is copied into the control, untagged learn entries are taken over', () => {
    const ctrl = { id: 'm1', noteNumber: 1, channel: 1, assignment: { type: 'midi-action' as const, action: 'mixer_ch1_mute' } } as any
    const fader = { ...fader1 }
    const p = { id: 'A', assignedDevice: 'MIDI Mix', controls: [ctrl, fader] }
    const r = syncPresetMappings({
      presets: [p], enabledIds: [],
      app: [mute1.appMapping],
      learn: { 'MIDI Mix:CH1:CC19': { cc: 19, device: 'MIDI Mix', channel: 0, paramName: 'mix_ch1_vol' } },
    })
    expect(r.backfilled).toBe(true)
    expect(ctrl.appMapping.action).toBe('mixer_ch1_mute')
    expect(r.app).toEqual([])
    expect(r.learn).toEqual({})
  })

  it('orphans of deleted controls are removed; the device follows the preset', () => {
    const r = syncPresetMappings({
      presets: [{ ...mixer, assignedDevice: 'MIDI Mix 2' }], enabledIds: ['A'],
      app: [{ id: 'designer_ctrl_gone', device: 'MIDI Mix', note: 9, action: 'x' }], learn: {},
    })
    expect(r.app.map(m => [m.id, m.device])).toEqual([['designer_ctrl_m1', 'MIDI Mix 2']])
    expect(Object.keys(r.learn)).toEqual(['MIDI Mix 2:CH1:CC19'])
  })

  it('learn keys as confirmLearn builds them', () => {
    expect(learnKeyFor('MIDI Mix', { id: 'x', ccNumber: 19, channel: 1 })).toBe('MIDI Mix:CH1:CC19')
    expect(learnKeyFor(null, { id: 'x', noteNumber: 36, channel: 10 })).toBe('CH10:NOTE36')
    expect(learnKeyFor('X', { id: 'x' })).toBeNull()
  })
})

describe('the Designer canvas learn helper', () => {
  it('ctrl_designer_<id> entries are removed (they only find the button\'s note / CC)', async () => {
    const { syncPresetMappings, isDesignerLearnHelper } = await import('@/lib/designer-preset-mappings')
    const learn = {
      'MIDI Mix:CH1:NOTE1': { note: 1, device: 'MIDI Mix', channel: 0, paramName: 'ctrl_designer_adyhlvrpl' },
      'Keys:CH1:CC74': { cc: 74, device: 'Keys', channel: 0, paramName: 'filter_cutoff' },
      'Old:20': 'ctrl_designer_x',
    }
    expect(isDesignerLearnHelper(learn['Old:20'])).toBe(true)
    const r = syncPresetMappings({ presets: [], enabledIds: [], app: [], learn })
    expect(Object.keys(r.learn)).toEqual(['Keys:CH1:CC74'])
    expect(r.learnChanged).toBe(true)
  })
})
