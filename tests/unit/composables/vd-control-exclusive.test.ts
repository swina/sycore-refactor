import { describe, it, expect } from 'vitest'
import { isVirtualDeviceControl } from '@/composables/useMidiCCListener'

describe('isVirtualDeviceControl — a control learned on a Virtual Device control is its alone', () => {
  const maps = {
    'Launchkey:CH1:CC48': { paramName: 'vdp_cc:Emulator X3:74' },
    'Launchkey:CH10:NOTE36': { paramName: 'vdp_slot_1:Emulator X3' },
    'Launchkey:CH1:CC49': { paramName: 'filter_cutoff' },
    'Arturia:21': 'vdp_ch_next:Emulator X3',
  }

  it('matches CCs and notes mapped to vdp_* (device + channel, or device-level key)', () => {
    expect(isVirtualDeviceControl(maps, 'Launchkey', 0, 'cc', 48)).toBe(true)
    expect(isVirtualDeviceControl(maps, 'Launchkey', 9, 'note', 36)).toBe(true)
    expect(isVirtualDeviceControl(maps, 'Arturia', 4, 'cc', 21)).toBe(true)
  })

  it('leaves other mappings, other channels and unmapped controls alone', () => {
    expect(isVirtualDeviceControl(maps, 'Launchkey', 0, 'cc', 49)).toBe(false)
    expect(isVirtualDeviceControl(maps, 'Launchkey', 1, 'cc', 48)).toBe(false)
    expect(isVirtualDeviceControl(maps, 'Other', 0, 'cc', 48)).toBe(false)
    expect(isVirtualDeviceControl(maps, null, 0, 'cc', 48)).toBe(false)
  })
})
