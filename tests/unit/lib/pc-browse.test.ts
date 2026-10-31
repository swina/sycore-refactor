import { describe, it, expect, beforeEach } from 'vitest'
import { matchCategory, recordDeviceCategories, knownDeviceCategories } from '@/lib/pc-browse'

describe('pc-browse: categories per device', () => {
  beforeEach(() => localStorage.clear())

  it('remembers the categories of the bank open for a device', () => {
    expect(knownDeviceCategories('X3')).toEqual([])
    recordDeviceCategories('X3', 'Factory', ['Pad', 'Bass'])
    expect(knownDeviceCategories('X3')).toEqual(['Pad', 'Bass'])
  })

  it('matches an AI\'s category to the bank\'s', () => {
    const cats = ['Pad', 'Synth Lead', 'Bass', 'Strings & Brass', 'Keys']
    expect(matchCategory('pad', cats)).toBe('Pad')
    expect(matchCategory('Pads', cats)).toBe('Pad')
    expect(matchCategory('Lead', cats)).toBe('Synth Lead')
    expect(matchCategory('Strings', cats)).toBe('Strings & Brass')
    expect(matchCategory('Choir', cats)).toBeNull()
  })
})
