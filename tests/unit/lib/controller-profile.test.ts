import { describe, it, expect, beforeEach } from 'vitest'
import { profileIngress, isLiveDevice, setLiveDevice, loadProfile, saveProfile, loadMode, saveMode, DEFAULT_PROFILE } from '@/lib/controller-profile'

const key = { device: 'Launchkey MK4 49 MIDI', status: 0x90, data1: 40 }

describe('controller-profile', () => {
  beforeEach(() => localStorage.clear())

  it('the MIDImix is Live\'s by default', () => {
    expect(isLiveDevice(DEFAULT_PROFILE, 'MIDI Mix')).toBe(true)
    expect(isLiveDevice(DEFAULT_PROFILE, '2- MIDI Mix')).toBe(true)
    expect(isLiveDevice(DEFAULT_PROFILE, 'Launchpad Mini')).toBe(false)
    expect(isLiveDevice(DEFAULT_PROFILE, undefined)).toBe(false)
  })

  it('a chosen list replaces the default', () => {
    const s = { ...DEFAULT_PROFILE, liveDevices: ['Launchpad Mini'] }
    expect(isLiveDevice(s, 'launchpad mini ')).toBe(true)
    expect(isLiveDevice(s, 'MIDI Mix')).toBe(false)
  })

  it('drops a Live controller in Live mode only', () => {
    const s = { ...DEFAULT_PROFILE, key }
    expect(profileIngress(s, 'live', 'MIDI Mix', [0xB0, 19, 64])).toBe('drop')
    expect(profileIngress(s, 'performance', 'MIDI Mix', [0xB0, 19, 64])).toBe('pass')
    expect(profileIngress(s, 'live', 'Launchkey MK4 49 MIDI', [0x90, 60, 100])).toBe('pass')
  })

  it('the key toggles on press, its release is swallowed, in both modes', () => {
    const s = { ...DEFAULT_PROFILE, key }
    for (const mode of ['live', 'performance'] as const) {
      expect(profileIngress(s, mode, key.device, [0x90, 40, 127])).toBe('toggle')
      expect(profileIngress(s, mode, key.device, [0x90, 40, 0])).toBe('swallow')
      expect(profileIngress(s, mode, key.device, [0x80, 40, 0])).toBe('swallow')
    }
  })

  it('the key works when it is on a Live controller', () => {
    const s = { ...DEFAULT_PROFILE, key: { device: 'MIDI Mix', status: 0x90, data1: 27 } }
    expect(profileIngress(s, 'live', 'MIDI Mix', [0x90, 27, 127])).toBe('toggle')
    expect(profileIngress(s, 'live', 'MIDI Mix', [0x90, 1, 127])).toBe('drop')
  })

  it('setLiveDevice starts from the MIDImix ports connected', () => {
    const connected = ['MIDI Mix', 'Launchpad Mini', 'Worlde']
    const a = setLiveDevice(DEFAULT_PROFILE, 'Launchpad Mini', true, connected)
    expect(a.liveDevices).toEqual(['MIDI Mix', 'Launchpad Mini'])
    const b = setLiveDevice(a, 'MIDI Mix', false, connected)
    expect(b.liveDevices).toEqual(['Launchpad Mini'])
  })

  it('saves and loads; Performance by default', () => {
    expect(loadMode()).toBe('performance')
    saveMode('live')
    expect(loadMode()).toBe('live')
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
    const s = { liveDevices: ['MIDI Mix'], key, autoLive: true }
    saveProfile(s)
    expect(loadProfile()).toEqual(s)
    localStorage.setItem('SYCORE_CONTROLLER_PROFILE', '{"key":{"device":3},"liveDevices":"x"}')
    expect(loadProfile()).toEqual(DEFAULT_PROFILE)
  })
})
