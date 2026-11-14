import { describe, it, expect } from 'vitest'
import { moveStepInList } from '@/lib/chord-step-move'

describe('moveStepInList', () => {
  const s = ['A', 'B', 'C', 'D', 'E', 'F']

  it('moves a step right, the ones between shift left', () => {
    expect(moveStepInList(s, 0, 2)).toEqual(['B', 'C', 'A', 'D', 'E', 'F'])
  })

  it('moves a step left, the ones between shift right', () => {
    expect(moveStepInList(s, 3, 1)).toEqual(['A', 'D', 'B', 'C', 'E', 'F'])
  })

  it('a ◀ ▶ nudge swaps neighbours', () => {
    expect(moveStepInList(s, 2, 3)).toEqual(['A', 'B', 'D', 'C', 'E', 'F'])
  })

  it('never lands past the steps in use, nor before 0', () => {
    expect(moveStepInList(s, 1, 9, 4)).toEqual(['A', 'C', 'D', 'B', 'E', 'F'])
    expect(moveStepInList(s, 1, -3, 4)).toEqual(['B', 'A', 'C', 'D', 'E', 'F'])
  })

  it('returns null when nothing moves, and leaves the input alone', () => {
    expect(moveStepInList(s, 2, 2)).toBeNull()
    expect(moveStepInList(s, 4, 1, 4)).toBeNull() // source outside the steps in use
    expect(moveStepInList(s, 0, -1)).toBeNull()
    expect(s).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })
})
