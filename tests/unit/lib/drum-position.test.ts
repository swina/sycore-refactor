import { describe, it, expect, beforeEach } from 'vitest'
import { beatPosition, drumPosition, setDrumPosition, resetDrumPosition, formatDrumPosition } from '@/lib/drum-position'

describe('drum-position', () => {
  beforeEach(() => resetDrumPosition())

  it('maps beat steps to bar.beat and ignores off-beat 16ths', () => {
    expect(beatPosition(1, 0)).toEqual({ bar: 1, beat: 1 })
    expect(beatPosition(3, 12)).toEqual({ bar: 3, beat: 4 })
    expect(beatPosition(2, 5)).toBeNull()
    expect(beatPosition(0, 0)).toBeNull()
  })

  it('formats the position, empty when stopped', () => {
    expect(formatDrumPosition({ bar: 0, beat: 0 })).toBe('')
    expect(formatDrumPosition({ bar: 7, beat: 2 })).toBe('7.2')
  })

  it('only replaces the ref when the position changes', () => {
    setDrumPosition({ bar: 2, beat: 1 })
    const ref1 = drumPosition.value
    setDrumPosition({ bar: 2, beat: 1 })
    expect(drumPosition.value).toBe(ref1)
    resetDrumPosition()
    expect(drumPosition.value).toEqual({ bar: 0, beat: 0 })
  })
})
