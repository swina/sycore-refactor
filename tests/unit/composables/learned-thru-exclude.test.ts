import { describe, it, expect } from 'vitest'
import { isLearnedOnDevice, isThruExcludedControl } from '@/composables/useMidiCCListener'

describe('a control learned on a device is kept out of Thru', () => {
  const maps = {
    'MIDI Mix:CH1:CC19': { paramName: 'mix_ch1_vol', device: 'MIDI Mix', channel: 0, cc: 19 },
    'Launchkey:CH10:NOTE36': { paramName: 'cp_slot_0', device: 'Launchkey', channel: 9, note: 36 },
    'Arturia:21': 'filter_cutoff',
    'CH1:CC74': { paramName: 'filter_res' },
    '74': 'filter_res',
    'Launchkey:CH1:CC48': { paramName: 'vdp_cc:Emulator X3:74' },
  }

  it('device-bound mappings (device + channel, or device-level key)', () => {
    expect(isLearnedOnDevice(maps, 'MIDI Mix', 0, 'cc', 19)).toBe(true)
    expect(isLearnedOnDevice(maps, 'Launchkey', 9, 'note', 36)).toBe(true)
    expect(isLearnedOnDevice(maps, 'Arturia', 3, 'cc', 21)).toBe(true)
  })

  it('not other channels, other devices, unmapped controls, or no device', () => {
    expect(isLearnedOnDevice(maps, 'MIDI Mix', 1, 'cc', 19)).toBe(false)
    expect(isLearnedOnDevice(maps, 'Other', 0, 'cc', 19)).toBe(false)
    expect(isLearnedOnDevice(maps, 'MIDI Mix', 0, 'cc', 20)).toBe(false)
    expect(isLearnedOnDevice(maps, null, 0, 'cc', 19)).toBe(false)
  })

  it('device-less ("any device") mappings stay played', () => {
    expect(isLearnedOnDevice(maps, 'Keyboard', 0, 'cc', 74)).toBe(false)
    expect(isThruExcludedControl(maps, 'Keyboard', 0, 'cc', 74)).toBe(false)
  })

  it('Virtual Device controls stay excluded', () => {
    expect(isThruExcludedControl(maps, 'Launchkey', 0, 'cc', 48)).toBe(true)
    expect(isThruExcludedControl(maps, 'MIDI Mix', 0, 'cc', 19)).toBe(true)
  })
})
