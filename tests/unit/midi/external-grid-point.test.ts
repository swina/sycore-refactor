import { describe, it, expect } from 'vitest'
import { externalGrid } from '@/core/midi/external-grid'

describe('externalGrid.pointAtOrAfter', () => {
  it('finds the next beat / 2 beats / bar of the song grid, with a grace just after a point', () => {
    // 120 BPM: a sixteenth = 125 ms; song sixteenth 32 (bar 3) at t = 1000.
    externalGrid.emit({ type: 'start', sixteenth: 32, t: 1000, bpm: 120 })
    expect(externalGrid.pointAtOrAfter(1000 + 125 * 5, 16)).toBe(48) // mid-bar → next bar
    expect(externalGrid.pointAtOrAfter(1000 + 125 * 5, 4)).toBe(40)  // → next beat
    expect(externalGrid.pointAtOrAfter(1000 + 125 * 5, 8)).toBe(40)  // → next 2 beats
    expect(externalGrid.pointAtOrAfter(1000 + 30, 16, 60)).toBe(32)  // 30 ms late on the bar: that bar
    expect(externalGrid.pointAtOrAfter(1000 + 30, 16, 10)).toBe(48)  // beyond the grace: the next one
    expect(externalGrid.pointAtOrAfter(1000, 16)).toBe(32)           // exactly on it
    expect(externalGrid.pointAtOrAfter(1000, 0)).toBeNull()
    externalGrid.emit({ type: 'stop' })
    expect(externalGrid.pointAtOrAfter(1000, 16)).toBeNull()
  })
})
