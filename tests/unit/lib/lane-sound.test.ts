import { describe, it, expect } from 'vitest'
import { captureLaneSound, laneSoundMessages, laneSoundLabel } from '@/lib/lane-sound'

const preset = (program: number, extra: any = {}) => ({ program, bank: 'A', soundName: `Snd${program}`, category: null, msb: 1, lsb: 2, ...extra })

describe('lane-sound', () => {
  it('captures the presets on the channels the lane reaches, per device', () => {
    const s = captureLaneSound([
      { device: 'X3', chs: [2], pcChannels: { 2: preset(10), 3: preset(11) } },
      { device: 'Synth', chs: [0, 1], pcChannels: { 1: preset(5) } },
      { device: 'Empty', chs: [0], pcChannels: {} },
    ])
    expect(s?.targets.map(t => [t.device, t.ch, t.preset.program])).toEqual([['X3', 2, 10], ['Synth', 1, 5]])
  })

  it('null with no preset; S-1 engine sounds left out', () => {
    expect(captureLaneSound([{ device: 'A', chs: [0], pcChannels: { 0: preset(1, { engine: 'roland-s1' }) } }])).toBeNull()
    expect(captureLaneSound([])).toBeNull()
  })

  it('recalls with the recorded messages moved onto the channel, else bank select + PC', () => {
    const s = captureLaneSound([
      { device: 'X3', chs: [3], pcChannels: { 3: preset(7, { msgs: [[0xb0, 64, 0], [0xb0, 32, 4], [0xc0, 7]] }) } },
      { device: 'Syn', chs: [0], pcChannels: { 0: preset(9) } },
    ])
    expect(laneSoundMessages(s)).toEqual([
      { device: 'X3', msgs: [[0xb3, 64, 0], [0xb3, 32, 4], [0xc3, 7]] },
      { device: 'Syn', msgs: [[0xb0, 0, 1], [0xb0, 32, 2], [0xc0, 9]] },
    ])
  })

  it('labels by the first sound name', () => {
    const s = captureLaneSound([{ device: 'A', chs: [0, 1], pcChannels: { 0: preset(1), 1: preset(2) } }])
    expect(laneSoundLabel(s)).toBe('Snd1 +1')
    expect(laneSoundLabel(null)).toBe('')
  })
})
