import { describe, it, expect } from 'vitest'
import { ledTargets, ledChanges } from '@/lib/led-feedback'

const learn = {
  'a': { note: 1, device: 'MIDI Mix', channel: 0, paramName: 'mix_ch1_mute' },
  'b': { note: 3, device: 'MIDI Mix', channel: 0, paramName: 'dm_play_stop' },
  'c': { cc: 16, device: 'MIDI Mix', channel: 0, paramName: 'cutoff' },
  'd': { note: 4, device: null, channel: 0, paramName: 'mix_ch2_mute' },
  'e': 'legacy-string',
}
const state: Record<string, boolean> = { mix_ch1_mute: true, dm_play_stop: false, mix_ch2_mute: true }
const paramState = (p: string) => state[p]

describe('led-feedback', () => {
  it('MIDI Learn mappings with a state: 127 / 0; no state or no device: none', () => {
    expect(ledTargets(learn, [], paramState, () => undefined)).toEqual([
      { device: 'MIDI Mix', status: 0x90, data1: 1, value: 127 },
      { device: 'MIDI Mix', status: 0x90, data1: 3, value: 0 },
    ])
  })

  it('app mappings use their feedback values; channel -1 is channel 1', () => {
    const app = [
      { action: 'mixer_ch1_mute', device: 'Worlde', channel: -1, note: 36, feedbackOn: 5, feedbackOff: 1 },
      { action: 'mixer_ch2_mute', device: 'Worlde', channel: 2, cc: 20, feedbackOn: 127, feedbackOff: 0 },
      { action: 'next_preset', device: 'Worlde', channel: 0, note: 37, feedbackOn: 127, feedbackOff: 0 },
      { action: 'mixer_ch1_mute', device: 'Worlde', channel: 0, note: 38 },
    ]
    const st: Record<string, boolean> = { mixer_ch1_mute: false, mixer_ch2_mute: true }
    expect(ledTargets({}, app, () => undefined, a => st[a])).toEqual([
      { device: 'Worlde', status: 0x90, data1: 36, value: 1 },
      { device: 'Worlde', status: 0xB2, data1: 20, value: 127 },
    ])
  })

  it('two mappings on one button: on wins', () => {
    const l = {
      x: { note: 5, device: 'P', channel: 0, paramName: 'off' },
      y: { note: 5, device: 'P', channel: 0, paramName: 'on' },
    }
    expect(ledTargets(l, [], p => p === 'on', () => undefined)).toEqual([{ device: 'P', status: 0x90, data1: 5, value: 127 }])
  })

  it('sends only what changed', () => {
    const sent = new Map<string, number>()
    const a = [{ device: 'M', status: 0x90, data1: 1, value: 127 }, { device: 'M', status: 0x90, data1: 3, value: 0 }]
    expect(ledChanges(sent, a)).toHaveLength(2)
    expect(ledChanges(sent, a)).toHaveLength(0)
    expect(ledChanges(sent, [{ ...a[0], value: 0 }, a[1]])).toEqual([{ ...a[0], value: 0 }])
  })
})

import { findOutputFor, portBaseName } from '@/lib/led-feedback'

describe('findOutputFor', () => {
  it('exact, then case, then the same base name', () => {
    const outs = [{ name: 'MIDIOUT2 (MIDI Mix)' }, { name: 'MIDIWIN (A)' }, { name: 'launchpad mini' }]
    expect(findOutputFor('MIDIWIN (A)', outs)).toBe(outs[1])
    expect(findOutputFor('Launchpad Mini', outs)).toBe(outs[2])
    expect(findOutputFor('MIDI Mix', outs)).toBe(outs[0])
    expect(findOutputFor('MIDIIN2 (MIDI Mix)', outs)).toBe(outs[0])
    expect(findOutputFor('Worlde', outs)).toBeNull()
  })
  it('base names', () => {
    expect(portBaseName('2- MIDI Mix')).toBe('midi mix')
    expect(portBaseName('Worlde In')).toBe('worlde')
  })
})
