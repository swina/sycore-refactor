import { describe, it, expect } from 'vitest'
import { parseMidimixInput, mixLedDiff, mixLedsOff, Pickup, isMidimixName, MIX_LED_COUNT } from '@/lib/rig-midimix'

describe('rig-midimix input', () => {
  it('names', () => {
    expect(isMidimixName('MIDI Mix')).toBe(true)
    expect(isMidimixName('MIDIMIX')).toBe(true)
    expect(isMidimixName('Launchpad Mini')).toBe(false)
  })
  it('knobs, faders, master', () => {
    expect(parseMidimixInput([0xB0, 16, 5])).toEqual({ kind: 'knob', strip: 0, row: 0, value: 5 })
    expect(parseMidimixInput([0xB0, 60, 9])).toEqual({ kind: 'knob', strip: 7, row: 2, value: 9 })
    expect(parseMidimixInput([0xB0, 19, 100])).toEqual({ kind: 'fader', strip: 0, value: 100 })
    expect(parseMidimixInput([0xB0, 61, 1])).toEqual({ kind: 'fader', strip: 7, value: 1 })
    expect(parseMidimixInput([0xB0, 62, 64])).toEqual({ kind: 'master', value: 64 })
    expect(parseMidimixInput([0xB0, 40, 1])).toBeNull()
  })
  it('buttons', () => {
    expect(parseMidimixInput([0x90, 1, 127])).toEqual({ kind: 'mute', strip: 0, down: true })
    expect(parseMidimixInput([0x80, 22, 0])).toEqual({ kind: 'mute', strip: 7, down: false })
    expect(parseMidimixInput([0x90, 5, 127])).toEqual({ kind: 'solo', strip: 1, down: true })
    expect(parseMidimixInput([0x90, 24, 0])).toEqual({ kind: 'rec', strip: 7, down: false })
    expect(parseMidimixInput([0x90, 25, 127])).toEqual({ kind: 'bankLeft', down: true })
    expect(parseMidimixInput([0x90, 26, 127])).toEqual({ kind: 'bankRight', down: true })
    expect(parseMidimixInput([0x90, 27, 127])).toEqual({ kind: 'soloButton', down: true })
  })
})

describe('rig-midimix LEDs', () => {
  it('only the changed LEDs; mute, rec, bank notes', () => {
    const a = Array(MIX_LED_COUNT).fill(false)
    const b = a.slice(); b[0] = true; b[15] = true; b[17] = true
    expect(mixLedDiff(a, b)).toEqual([[0x90, 1, 127], [0x90, 24, 127], [0x90, 26, 127]])
    expect(mixLedDiff(null, a)).toHaveLength(MIX_LED_COUNT)
    expect(mixLedsOff().every(m => m[2] === 0)).toBe(true)
  })
})

describe('rig-midimix pickup', () => {
  it('takes over only once the control reaches the value', () => {
    const p = new Pickup()
    expect(p.take('k', 10, 64)).toBeNull()
    expect(p.distance('k', 64)).toBe(-54)
    expect(p.take('k', 40, 64)).toBeNull()
    expect(p.take('k', 63, 64)).toBe(63) // within tolerance
    expect(p.take('k', 20, 63)).toBe(20) // engaged: follows
    expect(p.distance('k', 20)).toBeNull()
  })
  it('crossing the value between two messages engages', () => {
    const p = new Pickup()
    expect(p.take('f', 50, 64)).toBeNull()
    expect(p.take('f', 80, 64)).toBe(80)
  })
  it('lets go when the value changes elsewhere', () => {
    const p = new Pickup()
    expect(p.take('k', 64, 64)).toBe(64)
    expect(p.take('k', 70, 100)).toBeNull() // set to 100 on screen
    expect(p.take('k', 99, 100)).toBe(99)
    p.reset()
    expect(p.take('k', 10, 99)).toBeNull()
  })
})

import { assignMix, learnMixMsg, mixLedMessages, mixMsgLabel, roleId, factoryMsg, loadMixMap, saveMixMap } from '@/lib/rig-midimix'

describe('rig-midimix learned map (buttons as CCs)', () => {
  const map = assignMix(assignMix({}, 'mute:0', { status: 0xB0, data1: 70 }), 'rec:7', { status: 0xB0, data1: 90 })

  it('learned CCs are buttons: value > 0 down, 0 up', () => {
    expect(parseMidimixInput([0xB0, 70, 127], map)).toEqual({ kind: 'mute', strip: 0, down: true })
    expect(parseMidimixInput([0xB0, 70, 0], map)).toEqual({ kind: 'mute', strip: 0, down: false })
    expect(parseMidimixInput([0xB0, 90, 127], map)).toEqual({ kind: 'rec', strip: 7, down: true })
  })
  it('a learned role no longer answers its factory message; the others still do', () => {
    expect(parseMidimixInput([0x90, 1, 127], map)).toBeNull()
    expect(parseMidimixInput([0x90, 4, 127], map)).toEqual({ kind: 'mute', strip: 1, down: true })
    expect(parseMidimixInput([0xB0, 16, 3], map)).toEqual({ kind: 'knob', strip: 0, row: 0, value: 3 })
  })
  it('a learned message beats the factory meaning of the same number', () => {
    const m = assignMix({}, 'mute:2', { status: 0xB0, data1: 16 })
    expect(parseMidimixInput([0xB0, 16, 127], m)).toEqual({ kind: 'mute', strip: 2, down: true })
  })
  it('assigning a message moves it from another role', () => {
    const m = assignMix(map, 'mute:1', { status: 0xB0, data1: 70 })
    expect(m['mute:0']).toBeUndefined()
    expect(m['mute:1']).toEqual({ status: 0xB0, data1: 70 })
  })
  it('learns a note-on or any CC', () => {
    expect(learnMixMsg([0xB0, 5, 0])).toEqual({ status: 0xB0, data1: 5 })
    expect(learnMixMsg([0x90, 5, 0])).toBeNull()
    expect(learnMixMsg([0x91, 5, 9])).toEqual({ status: 0x91, data1: 5 })
  })
  it('LEDs: the button’s own message, plus its factory note when learned', () => {
    expect(mixLedMessages(0, true, map)).toEqual([[0xB0, 70, 127], [0x90, 1, 127]]) // + factory note
    expect(mixLedMessages(15, false, map)).toEqual([[0xB0, 90, 0], [0x90, 24, 0]])
    expect(mixLedMessages(1, true, map)).toEqual([[0x90, 4, 127]])
  })
  it('labels, roles, storage', () => {
    expect(mixMsgLabel(map, 'mute:0')).toBe('CC 70 ch 1')
    expect(mixMsgLabel(map, 'knob:1:2')).toBe('CC 22 ch 1')
    expect(mixMsgLabel({}, 'bankLeft')).toBe('Note 25 ch 1')
    expect(roleId({ kind: 'knob', strip: 3, row: 1 })).toBe('knob:3:1')
    expect(roleId({ kind: 'master' })).toBe('master')
    expect(factoryMsg('fader:7')).toEqual({ status: 0xB0, data1: 61 })
    saveMixMap(map)
    expect(loadMixMap()).toEqual(map)
    saveMixMap({})
    expect(loadMixMap()).toEqual({})
  })
})
