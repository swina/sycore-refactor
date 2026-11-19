import { describe, it, expect, beforeEach } from 'vitest'
import { intGrid } from '@/core/midi/int-grid'

// The sequences on the internal clock share one bar grid: the first sets bar 1, the next ones join it.
describe('int-grid', () => {
  beforeEach(() => intGrid._reset())

  it('the first one starts when it would; the next: SYNC on → the next bar line, off → the bar playing (in phase)', () => {
    expect(intGrid.join('seq', 1000, 120, true, 1020)).toBe(1020) // alone: as it would (bar 1 at 1020; a bar = 2000 ms)
    expect(intGrid.join('bass', 3500, 120, true, 3520)).toBe(5020) // next bar line
    expect(intGrid.join('arp', 3500, 120, false, 3520)).toBe(3020) // in phase: the bar playing
    expect(intGrid.join('drum', 5050, 120, true, 5070)).toBe(5020) // 30 ms after the downbeat: that one
  })

  it('the last to leave drops the grid; a tempo change keeps the phase', () => {
    intGrid.join('seq', 0, 120, false, 0)
    intGrid.setTempo(60, 1000) // half a bar in: at 60 BPM a bar is 4000 ms → bar 1 at -1000
    expect(intGrid.join('bass', 2500, 60, true, 2520)).toBe(3000)
    intGrid.leave('seq'); intGrid.leave('bass')
    expect(intGrid.hasOthers('x')).toBe(false)
    expect(intGrid.join('arp', 7777, 120, true, 7800)).toBe(7800)
  })

  it('a sequence restarting alone sets a new grid', () => {
    intGrid.join('seq', 0, 120, false, 0)
    expect(intGrid.join('seq', 3333, 120, true, 3350)).toBe(3350)
  })
})
