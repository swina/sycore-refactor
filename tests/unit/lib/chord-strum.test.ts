import { describe, it, expect } from 'vitest'
import { orderChordStrumNotes } from '@/lib/chord-strum'

describe('orderChordStrumNotes', () => {
  const notes = [67, 60, 64] // Cmaj, deliberately unsorted input

  it('"up" sorts ascending', () => {
    expect(orderChordStrumNotes(notes, 'up')).toEqual([60, 64, 67])
  })

  it('"down" sorts descending', () => {
    expect(orderChordStrumNotes(notes, 'down')).toEqual([67, 64, 60])
  })

  it('"up-down" ascends then descends, repeating the peak once', () => {
    expect(orderChordStrumNotes(notes, 'up-down')).toEqual([60, 64, 67, 67, 64, 60])
  })

  it('"down-up" descends then ascends, repeating the trough once', () => {
    expect(orderChordStrumNotes(notes, 'down-up')).toEqual([67, 64, 60, 60, 64, 67])
  })

  it('does not mutate the input array', () => {
    const original = [67, 60, 64]
    orderChordStrumNotes(original, 'up')
    expect(original).toEqual([67, 60, 64])
  })

  it('handles a single note without error', () => {
    expect(orderChordStrumNotes([60], 'up')).toEqual([60])
    expect(orderChordStrumNotes([60], 'up-down')).toEqual([60, 60])
  })
})
