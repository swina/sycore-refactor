import { describe, it, expect, beforeEach } from 'vitest'
import { learnToggle, matchToggle, toggleLabel, toggleShortLabel, sameToggle, loadToggle, saveToggle } from '@/lib/rig-toggle'

describe('rig-toggle', () => {
  beforeEach(() => localStorage.clear())
  it('learns a press, not a release', () => {
    expect(learnToggle('MIDI Mix', [0x90, 27, 127])).toEqual({ device: 'MIDI Mix', status: 0x90, data1: 27 })
    expect(learnToggle('MIDI Mix', [0x90, 27, 0])).toBeNull()
    expect(learnToggle('MIDI Mix', [0x80, 27, 0])).toBeNull()
    expect(learnToggle('X', [0xB3, 104, 127])).toEqual({ device: 'X', status: 0xB3, data1: 104 })
    expect(learnToggle(undefined, [0x90, 1, 1])).toBeNull()
  })
  it('matches press and release of the same button only', () => {
    const b = { device: 'MIDI Mix', status: 0x90, data1: 27 }
    expect(matchToggle(b, 'MIDI Mix', [0x90, 27, 127])).toBe('press')
    expect(matchToggle(b, 'MIDI Mix', [0x90, 27, 0])).toBe('release')
    expect(matchToggle(b, 'MIDI Mix', [0x80, 27, 0])).toBe('release')
    expect(matchToggle(b, 'MIDI Mix', [0x91, 27, 127])).toBeNull()
    expect(matchToggle(b, 'MIDI Mix', [0x90, 26, 127])).toBeNull()
    expect(matchToggle(b, 'Launchpad', [0x90, 27, 127])).toBeNull()
    expect(matchToggle(b, 'MIDI Mix', [0xB0, 27, 127])).toBeNull()
    const cc = { device: 'LP', status: 0xB0, data1: 111 }
    expect(matchToggle(cc, 'LP', [0xB0, 111, 127])).toBe('press')
    expect(matchToggle(cc, 'LP', [0xB0, 111, 0])).toBe('release')
    expect(matchToggle(null, 'LP', [0xB0, 111, 127])).toBeNull()
  })
  it('label and storage', () => {
    const b = { device: 'MIDI Mix', status: 0x90, data1: 27 }
    expect(toggleLabel(b)).toBe('MIDI Mix · Note 27 ch 1')
    expect(toggleLabel(null)).toBe('not set')
    saveToggle(b)
    expect(loadToggle()).toEqual(b)
    saveToggle(null)
    expect(loadToggle()).toBeNull()
  })
  it('one key per slot: all, Launchpad, MIDImix', () => {
    const a = { device: 'MIDI Mix', status: 0x90, data1: 27 }
    const l = { device: 'Launchpad Mini', status: 0xB0, data1: 111 }
    saveToggle(a, 'mix')
    saveToggle(l, 'lp')
    expect(loadToggle('mix')).toEqual(a)
    expect(loadToggle('lp')).toEqual(l)
    expect(loadToggle('all')).toBeNull()
    expect(loadToggle()).toBeNull()
    expect(toggleShortLabel(a)).toBe('Note 27')
    expect(toggleShortLabel(l)).toBe('CC 111')
    expect(toggleShortLabel(null)).toBe('Learn')
  })
  it('sameToggle: same device, type, channel and number', () => {
    const a = { device: 'MIDI Mix', status: 0x90, data1: 27 }
    expect(sameToggle(a, { ...a })).toBe(true)
    expect(sameToggle(a, { ...a, status: 0x91 })).toBe(false)
    expect(sameToggle(a, { ...a, status: 0xB0 })).toBe(false)
    expect(sameToggle(a, { ...a, device: 'X' })).toBe(false)
    expect(sameToggle(a, null)).toBe(false)
  })
})
