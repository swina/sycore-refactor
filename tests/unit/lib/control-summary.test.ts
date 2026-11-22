import { describe, it, expect } from 'vitest'
import { summarizeControls, presetConflicts, ranges, targetGroupOf, controlFlowGraph, controlMessage } from '@/lib/control-summary'

const act = (label: string, to: string, note?: number) =>
  ({ id: label, label, noteNumber: note, channel: 1, assignment: { type: 'midi-action' as const, action: 'x', label: `Action: ${to}` } })

describe('control summary', () => {
  it('ranges', () => {
    expect(ranges([3, 1, 2, 5, 7, 8])).toBe('1–3, 5, 7–8')
  })

  it('controls that differ by one number become one link', () => {
    const cs = [1, 2, 3, 4].map(n => act(`Mute ${n}`, `Mixer Ch ${n}: Mute`, n * 3 - 2))
    expect(summarizeControls(cs)).toEqual([{ from: 'Mute 1–4', to: 'Mixer Ch 1–4: Mute', count: 4 }])
  })

  it('the same target for several controls; other ones one line each; unassigned skipped', () => {
    const cs = [
      act('Pad 1', 'Drum Machine: Play'), act('Pad 2', 'Drum Machine: Play'),
      act('Knob', 'Filter cutoff'),
      { id: 'u', label: 'Fader 1', channel: 1 },
      { id: 'p', label: 'Fader 2', ccNumber: 20, channel: 1, assignment: { type: 'app-param' as const, paramName: 'mix_ch2_vol', label: '→ Mixer ch 2 volume' } },
    ]
    expect(summarizeControls(cs)).toEqual([
      { from: 'Pad 1–2', to: 'Drum Machine: Play', count: 2 },
      { from: 'Fader 2', to: 'Mixer ch 2 volume', count: 1 },
      { from: 'Knob', to: 'Filter cutoff', count: 1 },
    ])
  })

  it('conflicts: one button assigned by two presets on', () => {
    const presets = [
      { id: 'a', name: 'Mixer', assignedDevice: 'MIDI Mix', controls: [act('Mute 1', 'Mixer Ch 1: Mute', 1)] },
      { id: 'b', name: 'Slots', assignedDevice: 'midi mix', controls: [act('Top 1', 'Chord Prog: A', 1), act('Top 2', 'Chord Prog: B', 4)] },
      { id: 'c', name: 'Off', assignedDevice: 'MIDI Mix', controls: [act('Mute 1', 'Something', 1)] },
    ]
    expect(presetConflicts(presets, ['a', 'b'])).toEqual([{ device: 'MIDI Mix', button: 'Note 1 · ch 1', presets: ['Mixer', 'Slots'] }])
    expect(presetConflicts(presets, ['a'])).toEqual([])
  })
})

describe('control flow', () => {
  it('targets: an action group, an instrument, a param by prefix, the Sound Engine', () => {
    expect(targetGroupOf({ type: 'midi-action', action: 'mixer_ch1_mute' })).toBe('Audio Mixer')
    expect(targetGroupOf({ type: 'midi-action', action: 'vi_cc:E-MU X3 MULTI:74:0' })).toBe('E-MU X3 MULTI')
    expect(targetGroupOf({ type: 'app-param', paramName: 'vdp_cc:E-MU X3 MULTI:72' })).toBe('E-MU X3 MULTI')
    expect(targetGroupOf({ type: 'app-param', paramName: 'mix_ch1_vol' })).toBe('Audio Mixer')
    expect(targetGroupOf({ type: 'app-param', paramName: 'dm_play_stop' })).toBe('Drum Machine')
    expect(targetGroupOf({ type: 'app-param', paramName: 'cutoff' })).toBe('Sound Engine')
    expect(targetGroupOf({ type: 'app-param', paramName: 'rig_slot_drum_a' })).toBe('Rig Controller')
    expect(targetGroupOf(undefined)).toBeNull()
  })

  it('edges per controller and target; targets most used first', () => {
    const g = controlFlowGraph([
      { controller: 'MIDI Mix', controls: [1, 2, 3].map(n => ({ id: `m${n}`, assignment: { type: 'midi-action' as const, action: `mixer_ch${n}_mute` } })) },
      { controller: 'Launchkey', controls: [
        { id: 'k1', assignment: { type: 'app-param' as const, paramName: 'mix_ch1_vol' } },
        { id: 'k2', assignment: { type: 'app-param' as const, paramName: 'vdp_cc:X3:72' } },
        { id: 'k3' },
      ] },
    ])
    expect(g.targets).toEqual(['Audio Mixer', 'X3'])
    expect(g.edges).toEqual([
      { from: 'MIDI Mix', to: 'Audio Mixer', count: 3 },
      { from: 'Launchkey', to: 'Audio Mixer', count: 1 },
      { from: 'Launchkey', to: 'X3', count: 1 },
    ])
    expect(controlMessage({ id: 'x', noteNumber: 1, channel: 1 })).toBe('Note 1 · ch 1')
  })
})
