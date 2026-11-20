import { describe, it, expect, afterEach } from 'vitest'
import { stopGate, endOfNextBar } from '@/core/midi/stop-gate'
import { intGrid } from '@/core/midi/int-grid'

// a 2000 ms bar (120 BPM) starting at 0: bar 1 = 0, bar 2 = 2000, … bar n = (n - 1) · 2000
const grid = (t: number) => ({ t: Math.ceil(t / 2000 - 1e-9) * 2000, barMs: 2000 })
const pos = (bar: number, beat: number, six: number) => (bar - 1) * 2000 + (beat - 1) * 500 + (six - 1) * 125

describe('endOfNextBar', () => {
  it('3.2.4 → 5.1.1 (bar 4 played to its end)', () => {
    expect(endOfNextBar(pos(3, 2, 4), grid)).toBe(pos(5, 1, 1))
  })
  it('3.4.4 → 5.1.1 too; on 4.1.1 (a hair late) → 5.1.1', () => {
    expect(endOfNextBar(pos(3, 4, 4), grid)).toBe(pos(5, 1, 1))
    expect(endOfNextBar(pos(4, 1, 1) + 30, grid)).toBe(pos(5, 1, 1))
    expect(endOfNextBar(pos(4, 1, 1) + 200, grid)).toBe(pos(6, 1, 1))
  })
  it('null with no grid', () => expect(endOfNextBar(1000, () => null)).toBeNull())
})

describe('stopGate', () => {
  afterEach(() => stopGate.clear())
  it('silences the steps at or after its time', () => {
    expect(stopGate.reached(5000)).toBe(false)
    stopGate.set(8000)
    expect(stopGate.reached(7999.5)).toBe(true) // the bar line itself, a hair early
    expect(stopGate.reached(7900)).toBe(false)
    expect(stopGate.reached(9000)).toBe(true)
    stopGate.clear()
    expect(stopGate.reached(9000)).toBe(false)
  })
})

describe('intGrid.barLineAtOrAfter', () => {
  afterEach(() => intGrid._reset())
  it('the next bar line of the grid; null when none plays', () => {
    expect(intGrid.barLineAtOrAfter(100)).toBeNull()
    intGrid.join('a', 1000, 120, false, 1000)
    expect(intGrid.barLineAtOrAfter(1500)).toEqual({ t: 3000, barMs: 2000 })
    expect(intGrid.barLineAtOrAfter(3000)).toEqual({ t: 3000, barMs: 2000 })
  })
})
