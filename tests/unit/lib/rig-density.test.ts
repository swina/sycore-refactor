import { describe, it, expect } from 'vitest'
import { stepWeight, densityKeeps, densityFor, rigDensity } from '@/lib/rig-density'

describe('rig-density', () => {
  it('weighs the 16ths of a bar: downbeat, beat 3, beats 2/4, 8ths, off-beat 16ths (+1 accent)', () => {
    expect([0, 8, 4, 12, 2, 6, 1, 15].map(p => stepWeight(p))).toEqual([4, 3, 2, 2, 1, 1, 0, 0])
    expect(stepWeight(16)).toBe(4)        // song position: next bar's downbeat
    expect(stepWeight(1, true)).toBe(1)
  })

  it('127 plays all; lower thins the weakest first, down to the downbeat at 0', () => {
    const kept = (d: number) => Array.from({ length: 16 }, (_, p) => p).filter(p => densityKeeps(p, false, d))
    expect(kept(127)).toHaveLength(16)
    expect(kept(110)).toHaveLength(16)
    expect(kept(90)).toEqual([0, 2, 4, 6, 8, 10, 12, 14])
    expect(kept(60)).toEqual([0, 4, 8, 12])
    expect(kept(40)).toEqual([0, 8])
    expect(kept(0)).toEqual([0])
    expect(densityKeeps(4, true, 40)).toBe(true) // an accent holds one level longer
  })

  it('acts only while the Rig panel is open in LIVE', () => {
    rigDensity.drum = 30
    rigDensity.active = false
    expect(densityFor('drum')).toBe(127)
    rigDensity.active = true
    expect(densityFor('drum')).toBe(30)
    rigDensity.active = false
    rigDensity.drum = 127
  })
})
