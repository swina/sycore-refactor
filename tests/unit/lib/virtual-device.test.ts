import { describe, it, expect } from 'vitest'
import { presetMessages, bankProgramLabel, stepIn, parseVdpParam, vdpCcParam, vdpActionParam, vdpSlotParam, ButtonEdge } from '@/lib/virtual-device'

const x3 = { program: 29, bank: 'Factory', soundName: 'syn:Loner', category: 'Synthesizer', msb: 0, lsb: 2,
  msgs: [[0xb0, 64, 0], [0xb0, 32, 2], [0xc0, 29]] }

describe('presetMessages', () => {
  it("re-sends the recorded messages (the device's own bank select) on the target channel", () => {
    expect(presetMessages(x3, 3)).toEqual([[0xb3, 64, 0], [0xb3, 32, 2], [0xc3, 29]])
  })

  it('falls back to bank select MSB/LSB + PC for a state recorded without messages', () => {
    expect(presetMessages({ ...x3, msgs: undefined, msb: 1, lsb: 0 }, 0)).toEqual([[0xb0, 0, 1], [0xb0, 32, 0], [0xc0, 29]])
  })

  it('sends nothing without a preset', () => {
    expect(presetMessages(null, 0)).toEqual([])
    expect(presetMessages({ ...x3, program: null }, 0)).toEqual([])
  })
})

describe('bankProgramLabel', () => {
  it('shows bank (MSB, else LSB) : program, padded', () => {
    expect(bankProgramLabel(x3)).toBe('002:029')
    expect(bankProgramLabel({ ...x3, msb: 5, lsb: 0, program: 7 })).toBe('005:007')
    expect(bankProgramLabel(null)).toBe('---:---')
  })
})

describe('stepIn', () => {
  it('wraps both ways and starts from the first item', () => {
    expect(stepIn([2, 3, 4, 7], 7, 1)).toBe(2)
    expect(stepIn([2, 3, 4, 7], 2, -1)).toBe(7)
    expect(stepIn([2, 3], 9, 1)).toBe(2)
    expect(stepIn([], 1, 1)).toBeUndefined()
  })
})

describe('MIDI Learn params', () => {
  it('round-trips control and action params, device names with ":" included', () => {
    expect(parseVdpParam(vdpCcParam('Emu:X3', 74))).toEqual({ kind: 'cc', device: 'Emu:X3', cc: 74 })
    expect(parseVdpParam(vdpActionParam('preset_next', 'Emu X3'))).toEqual({ kind: 'preset_next', device: 'Emu X3' })
    expect(parseVdpParam(vdpActionParam('type', 'X3'))).toEqual({ kind: 'type', device: 'X3' })
    expect(parseVdpParam(vdpActionParam('category', 'X3'))).toEqual({ kind: 'category', device: 'X3' })
    expect(parseVdpParam(vdpActionParam('ch_prev', 'Emu X3'))).toEqual({ kind: 'ch_prev', device: 'Emu X3' })
    expect(parseVdpParam(vdpSlotParam(7, 'Emu:X3'))).toEqual({ kind: 'slot', device: 'Emu:X3', slot: 7 })
    expect(parseVdpParam('vdp_slot_9:Emu')).toBeNull()
  })

  it('rejects malformed names', () => {
    expect(parseVdpParam('vdp_cc:Emu')).toBeNull()
    expect(parseVdpParam('vdp_cc:Emu:200')).toBeNull()
    expect(parseVdpParam('vdp_preset_next:')).toBeNull()
    expect(parseVdpParam('seq_time')).toBeNull()
  })
})

describe('ButtonEdge (CHANNEL / PRESET ▼▲ buttons)', () => {
  it('momentary: fires on each press, never on the release', () => {
    const b = new ButtonEdge()
    const k = 'vdp_ch_next:X3'
    expect([b.fires(k, 127, false, 0), b.fires(k, 0, false, 120)]).toEqual([true, false])
    expect([b.fires(k, 127, false, 1000), b.fires(k, 0, false, 1100)]).toEqual([true, false])
    expect(b.mode(k)).toBe('momentary')
  })

  it('toggle: fires on both values of alternate presses', () => {
    const b = new ButtonEdge()
    const k = 'vdp_ch_next:X3'
    expect([b.fires(k, 127, false, 0), b.fires(k, 0, false, 1500), b.fires(k, 127, false, 3000), b.fires(k, 0, false, 3300)])
      .toEqual([true, true, true, true])
    expect(b.mode(k)).toBe('toggle')
  })

  it('drops a press delivered twice, fires notes on each Note On', () => {
    const b = new ButtonEdge()
    expect([b.fires('a', 127, false, 0), b.fires('a', 127, false, 30)]).toEqual([true, false])
    expect([b.fires('n', 100, true, 0), b.fires('n', 100, true, 400)]).toEqual([true, true])
  })
})
