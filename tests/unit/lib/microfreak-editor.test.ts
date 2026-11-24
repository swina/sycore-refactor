import { describe, it, expect } from 'vitest'
import {
  ED_PARAMS, typeToCc, ccToType, OSC_COUNT, defaultValues, valuesFromPreset, synthOnlyInfo,
  randomSound, mutate, ccMessages, CHARACTERS, presetFromPcState,
} from '@/lib/microfreak/editor'
import { decodeRows } from '@/lib/microfreak/sysex'
import preset001 from '../../fixtures/microfreak-preset-001.json'

// deterministic rng
const seq = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

describe('microfreak editor', () => {
  it('has one param per CC', () => {
    const ccs = ED_PARAMS.map(p => p.cc)
    expect(new Set(ccs).size).toBe(ccs.length)
    expect(ccs.every(c => c >= 0 && c <= 127)).toBe(true)
  })

  it('maps the oscillator index to CC and back', () => {
    for (let i = 0; i < OSC_COUNT; i++) {
      const cc = typeToCc(i)
      expect(cc).toBeGreaterThanOrEqual(0)
      expect(cc).toBeLessThanOrEqual(127)
      expect(ccToType(cc)).toBe(i)
    }
    expect(ccToType(0)).toBe(0)
    expect(ccToType(127)).toBe(OSC_COUNT - 1)
  })

  it('reads the panel from a dump (preset 1)', () => {
    const { values, fromDump } = valuesFromPreset(decodeRows(preset001.rows))
    expect(ccToType(values.type)).toBe(19)        // Sample
    expect(values.cutoff).toBe(127)
    expect(values.reso).toBe(0)
    expect(values.cyc_amount).toBe(127)
    expect(fromDump).toContain('env_attack')
    expect(fromDump).not.toContain('env_filter')  // not found in the dump
    expect(values.env_filter).toBe(64)
    const info = Object.fromEntries(synthOnlyInfo(decodeRows(preset001.rows)).map(i => [i.label, i.value]))
    expect(info['Filter type']).toBe('LPF')
    expect(info['Octave']).toBe('0')
    expect(info['Preset volume']).toBe('9 / 24')
  })

  it('generates within the character', () => {
    for (const c of CHARACTERS) {
      const v = randomSound(c, defaultValues(), seq(7))
      for (const p of ED_PARAMS) expect(v[p.id]).toBeGreaterThanOrEqual(0), expect(v[p.id]).toBeLessThanOrEqual(127)
    }
    const pluck = randomSound('Pluck', defaultValues(), seq(3))
    expect(pluck.env_sustain).toBeLessThanOrEqual(Math.round(0.15 * 127))
    expect(pluck.env_attack).toBeLessThanOrEqual(Math.round(0.03 * 127))
    // rates are not generated
    const base = { ...defaultValues(), arp_rate: 11 }
    expect(randomSound('Free', base, seq(5)).arp_rate).toBe(11)
  })

  it('mutates by at most the amount, keeps locked params and the oscillator below 0.6', () => {
    const base = defaultValues()
    const m = mutate(base, 0.1, seq(9), new Set(['cutoff']))
    for (const p of ED_PARAMS.filter(p => p.gen && p.kind === 'cont')) {
      expect(Math.abs(m[p.id] - base[p.id])).toBeLessThanOrEqual(Math.ceil(0.1 * 127))
    }
    expect(m.cutoff).toBe(base.cutoff)
    expect(m.type).toBe(base.type)
  })

  it('sends only what changed, the oscillator first', () => {
    const a = defaultValues()
    const all = ccMessages(a, 2)
    expect(all[0]).toEqual([0xb2, 9, a.type])
    expect(all).toHaveLength(ED_PARAMS.length)
    const b = { ...a, cutoff: 10 }
    expect(ccMessages(b, 0, a)).toEqual([[0xb0, 23, 10]])
  })

  it('the preset a channel plays, from its Program Change state', () => {
    expect(presetFromPcState({ program: 0, msb: 0 })).toBe(1)
    expect(presetFromPcState({ program: 127, msb: 0 })).toBe(128)
    expect(presetFromPcState({ program: 0, msb: 1 })).toBe(129)
    expect(presetFromPcState({ program: 63, msb: 3 })).toBe(448)
    expect(presetFromPcState({ program: 5 })).toBe(6)
    expect(presetFromPcState(null)).toBeNull()
    expect(presetFromPcState({ msb: 1 })).toBeNull()
    expect(presetFromPcState({ program: 0, msb: 4 })).toBeNull()
  })
})
